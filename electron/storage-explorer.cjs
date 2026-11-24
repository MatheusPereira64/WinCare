/*
 * Explorador de armazenamento: mapa do disco (unidade inteira ou pasta
 * escolhida), busca de arquivos por filtros, duplicados por conteúdo, fotos
 * parecidas, arquivos esquecidos (instaladores e downloads antigos) e
 * análises salvas para comparar ao longo do tempo.
 *
 * Segurança: o renderer só manda ids gerados aqui (pasta "d…", arquivo "f…",
 * esquecido "g…") e escolhas de lista (unidade, categoria, faixa). Caminhos
 * nunca vêm da tela; a pasta personalizada vem da janela "Selecionar pasta"
 * aberta por este processo. Remover = mandar para a Lixeira (recuperável) e só
 * fora das pastas do Windows e de programas (file-isUserDeletablePath).
 */
const { Worker } = require("worker_threads");
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, dialog, nativeImage, shell } = require("electron");

const logger = require("./logger.cjs");
const history = require("./maintenance-history.cjs");
const { psFileJson, psQuote } = require("./powershell.cjs");
const {
  CATEGORY_IDS,
  DAY,
  categoryOf,
  compareSnapshots: diffSnapshots,
  differenceHash,
  groupSimilar,
  isForgottenInstaller,
  isPhoto,
  isUserDeletablePath,
} = require("./file-rules.cjs");

const WORKER_FILE = path.join(__dirname, "disk-scan-worker.cjs");
const MAX_CHILDREN = 60;
const MAX_FIND_RESULTS = 300;
const MAX_PHOTOS = 4000;
const MAX_SNAPSHOTS = 30;
const SNAPSHOT_DEPTH = 4;
const SNAPSHOT_MIN_BYTES = 20 * 1024 * 1024;

const SIZE_FILTERS = Object.freeze({
  any: 0,
  "10mb": 10 * 1024 ** 2,
  "100mb": 100 * 1024 ** 2,
  "500mb": 500 * 1024 ** 2,
  "1gb": 1024 ** 3,
  "5gb": 5 * 1024 ** 3,
});
const AGE_FILTERS = Object.freeze({ any: 0, "30d": 30, "180d": 180, "1y": 365, "2y": 730 });
const DUPLICATE_MIN = Object.freeze({
  "1mb": 1024 ** 2,
  "10mb": 10 * 1024 ** 2,
  "100mb": 100 * 1024 ** 2,
});
const FORGOTTEN_AGES = Object.freeze({ "90d": 90, "180d": 180, "1y": 365 });

const env = () => process.env;

/* ------------------------------ Estado ------------------------------ */

let scanSeq = 0;
/** Análise atual: { seq, root, label, kind, state, startedAt, finishedAt, progress, data, error, worker } */
let current = null;
let duplicateJob = null;
let photoJob = null;
/** id "g…" → arquivo esquecido encontrado na última verificação. */
let forgotten = new Map();

const idle = { state: "idle" };

const dirId = (seq, index) => `s${seq}-d${index}`;
const fileId = (seq, index) => `s${seq}-f${index}`;

/** "s3-d12" → { kind: "d", index: 12 } se for da análise atual. */
function parseId(id) {
  const match = /^s(\d+)-([df])(\d+)$/.exec(String(id || ""));
  if (!match || !current?.data || Number(match[1]) !== current.seq) return null;
  return { kind: match[2], index: Number(match[3]) };
}

/* ------------------------------ Unidades ------------------------------ */

function listDrives() {
  const out = [];
  for (let code = 67; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    const root = `${letter}:\\`;
    try {
      if (!fs.existsSync(root)) continue;
      const s = fs.statfsSync(root);
      const totalBytes = Number(s.blocks) * Number(s.bsize);
      if (!(totalBytes > 0)) continue;
      out.push({ letter, totalBytes, freeBytes: Number(s.bavail ?? s.bfree) * Number(s.bsize) });
    } catch {
      /* unidade sem mídia (leitor de cartão vazio) */
    }
  }
  return out;
}

/* ------------------------------ Árvore ------------------------------ */

function buildIndexes(data) {
  const children = data.dirs.map(() => []);
  for (let i = 1; i < data.dirs.length; i++) children[data.dirs[i][0]].push(i);
  const filesByDir = new Map();
  data.files.forEach((file, i) => {
    if (!filesByDir.has(file[0])) filesByDir.set(file[0], []);
    filesByDir.get(file[0]).push(i);
  });
  data.children = children;
  data.filesByDir = filesByDir;
  data.pathCache = new Map();
  data.removed = new Set();
}

function dirPath(index) {
  const data = current.data;
  if (data.pathCache.has(index)) return data.pathCache.get(index);
  const dir = data.dirs[index];
  const full = dir[0] < 0 ? dir[1] : path.join(dirPath(dir[0]), dir[1]);
  data.pathCache.set(index, full);
  return full;
}

const filePath = (index) => {
  const file = current.data.files[index];
  return path.join(dirPath(file[0]), file[1]);
};

function depthOf(index) {
  let depth = 0;
  for (let i = index; current.data.dirs[i][0] >= 0; i = current.data.dirs[i][0]) depth++;
  return depth;
}

function dirSummary(index) {
  const dir = current.data.dirs[index];
  return {
    id: dirId(current.seq, index),
    name: dir[0] < 0 ? current.label : dir[1],
    path: dirPath(index),
    sizeBytes: dir[2],
    fileCount: dir[3],
  };
}

function publicScan() {
  if (!current) return { ok: true, ...idle, drives: listDrives() };
  const base = {
    ok: true,
    state: current.state,
    kind: current.kind,
    root: current.root,
    label: current.label,
    startedAt: current.startedAt,
    finishedAt: current.finishedAt || 0,
    progress: current.progress,
    error: current.error,
    drives: listDrives(),
  };
  if (current.state !== "done") return base;
  const data = current.data;
  return {
    ...base,
    rootId: dirId(current.seq, 0),
    totalBytes: data.dirs[0][2],
    fileCount: data.dirs[0][3],
    dirCount: data.dirs.length,
    skipped: data.skipped,
    truncated: data.truncated,
  };
}

function startScan({ target, drive } = {}) {
  let root;
  let kind;
  if (target === "folder") {
    const win = BrowserWindow.getFocusedWindow() || undefined;
    const picked = dialog.showOpenDialogSync(win, {
      title: "Escolha a pasta para analisar",
      properties: ["openDirectory"],
    });
    if (!picked || !picked[0]) return { ok: false, reason: "cancelled" };
    root = path.resolve(picked[0]);
    kind = "folder";
  } else {
    const letter = String(drive || "").toUpperCase();
    if (!/^[C-Z]$/.test(letter) || !listDrives().some((d) => d.letter === letter)) {
      return { ok: false, reason: "Unidade inválida." };
    }
    root = `${letter}:\\`;
    kind = "drive";
  }

  cancelScan();
  duplicateJob = null;
  photoJob = null;
  const seq = ++scanSeq;
  const label = kind === "drive" ? `Unidade ${root.slice(0, 2)}` : path.basename(root) || root;
  current = {
    seq,
    root,
    label,
    kind,
    state: "scanning",
    startedAt: Date.now(),
    finishedAt: 0,
    progress: { files: 0, dirs: 0, bytes: 0, current: root },
    data: null,
    error: null,
    worker: null,
  };
  const worker = new Worker(WORKER_FILE, {
    workerData: { mode: "scan", root, skipSystem: false, env: env() },
  });
  current.worker = worker;
  const mine = current;
  worker.on("message", (msg) => {
    if (current !== mine) return;
    if (msg.type === "progress") {
      mine.progress = { files: msg.files, dirs: msg.dirs, bytes: msg.bytes, current: msg.current };
    } else if (msg.type === "done") {
      mine.data = msg.result;
      buildIndexes(mine.data);
      mine.state = "done";
      mine.finishedAt = Date.now();
      mine.worker = null;
      logger.log("storage", "Análise concluída", {
        root,
        files: msg.result.fileCount,
        ms: mine.finishedAt - mine.startedAt,
      });
    } else if (msg.type === "error") {
      mine.state = "error";
      mine.error = msg.message;
      mine.worker = null;
    }
  });
  worker.on("error", (error) => {
    if (current !== mine) return;
    mine.state = "error";
    mine.error = error instanceof Error ? error.message : String(error);
    mine.worker = null;
  });
  return { ok: true, ...publicScan() };
}

function cancelScan() {
  if (current?.worker) {
    void current.worker.terminate();
    current.worker = null;
    if (current.state === "scanning") current.state = "cancelled";
  }
  return { ok: true };
}

function childrenOf({ id } = {}) {
  if (!current?.data) return { ok: false, reason: "Nenhuma análise concluída." };
  const parsed = id ? parseId(id) : { kind: "d", index: 0 };
  if (!parsed || parsed.kind !== "d") return { ok: false, reason: "Pasta não encontrada." };
  const data = current.data;
  const index = parsed.index;

  const breadcrumb = [];
  for (let i = index; i >= 0; i = data.dirs[i][0]) {
    breadcrumb.unshift({
      id: dirId(current.seq, i),
      name: i === 0 ? current.label : data.dirs[i][1],
    });
    if (data.dirs[i][0] < 0) break;
  }

  const items = [];
  for (const child of data.children[index]) {
    const dir = data.dirs[child];
    if (dir[2] <= 0) continue;
    items.push({
      id: dirId(current.seq, child),
      kind: "dir",
      name: dir[1],
      sizeBytes: dir[2],
      fileCount: dir[3],
    });
  }
  let listedFileBytes = 0;
  for (const fi of data.filesByDir.get(index) || []) {
    if (data.removed.has(fi)) continue;
    const file = data.files[fi];
    listedFileBytes += file[2];
    items.push({
      id: fileId(current.seq, fi),
      kind: "file",
      name: file[1],
      sizeBytes: file[2],
      modifiedAt: file[3],
      category: categoryOf(file[1]),
    });
  }
  items.sort((a, b) => b.sizeBytes - a.sizeBytes);
  const shown = items.slice(0, MAX_CHILDREN);
  const hiddenBytes = items.slice(MAX_CHILDREN).reduce((n, it) => n + it.sizeBytes, 0);
  // Arquivos pequenos (fora do índice) direto nesta pasta + o que não coube.
  const smallBytes = Math.max(0, data.dirs[index][4] - listedFileBytes);
  const restBytes = smallBytes + hiddenBytes;
  if (restBytes > 0) {
    shown.push({
      id: `${dirId(current.seq, index)}-rest`,
      kind: "rest",
      name: hiddenBytes ? "Outros itens" : "Arquivos pequenos",
      sizeBytes: restBytes,
    });
  }
  return { ok: true, node: dirSummary(index), breadcrumb, children: shown };
}

/* ------------------------------ Busca ------------------------------ */

function findFiles({ category = "all", size = "any", age = "any", sort = "size" } = {}) {
  if (!current?.data) return { ok: false, reason: "Nenhuma análise concluída." };
  const cat = CATEGORY_IDS.includes(category) ? category : "all";
  const minBytes = SIZE_FILTERS[size] ?? 0;
  const minDays = AGE_FILTERS[age] ?? 0;
  const cutoff = minDays ? Date.now() - minDays * DAY : Infinity;
  const data = current.data;
  const matches = [];
  let totalBytes = 0;
  data.files.forEach((file, i) => {
    if (data.removed.has(i)) return;
    if (file[2] < minBytes) return;
    if (minDays && !(file[3] <= cutoff)) return;
    if (cat !== "all" && categoryOf(file[1]) !== cat) return;
    matches.push(i);
    totalBytes += file[2];
  });
  matches.sort((a, b) =>
    sort === "oldest" ? data.files[a][3] - data.files[b][3] : data.files[b][2] - data.files[a][2],
  );
  const e = env();
  const items = matches.slice(0, MAX_FIND_RESULTS).map((i) => {
    const file = data.files[i];
    const full = filePath(i);
    return {
      id: fileId(current.seq, i),
      name: file[1],
      path: full,
      sizeBytes: file[2],
      modifiedAt: file[3],
      category: categoryOf(file[1]),
      deletable: isUserDeletablePath(full, e),
    };
  });
  return { ok: true, total: matches.length, totalBytes, items };
}

/** Dono (conta do Windows) de cada arquivo da lista — sob demanda, é lento. */
async function fileOwners({ ids } = {}) {
  if (!current?.data || !Array.isArray(ids)) return { ok: false, reason: "Nada para consultar." };
  const targets = ids
    .slice(0, MAX_FIND_RESULTS)
    .map((id) => ({ id, parsed: parseId(id) }))
    .filter((t) => t.parsed?.kind === "f")
    .map((t) => ({ id: t.id, path: filePath(t.parsed.index) }));
  if (!targets.length || process.platform !== "win32") return { ok: true, owners: {} };
  const list = targets.map((t) => psQuote(t.path)).join(",\n");
  const rows = await psFileJson(
    `$ErrorActionPreference = 'SilentlyContinue'
$paths = @(
${list}
)
$out = foreach ($p in $paths) { $o = $null; try { $o = (Get-Acl -LiteralPath $p).Owner } catch {}; [string]$o }
ConvertTo-Json -Compress -InputObject @($out)`,
    120000,
  );
  const owners = {};
  (Array.isArray(rows) ? rows : [rows]).forEach((owner, i) => {
    if (targets[i] && owner) owners[targets[i].id] = String(owner);
  });
  return { ok: true, owners };
}

/* ------------------------------ Abrir / Lixeira ------------------------------ */

function resolveTarget(id) {
  const str = String(id || "");
  if (str.startsWith("g")) {
    const item = forgotten.get(str);
    return item
      ? { kind: "f", path: item.path, sizeBytes: item.sizeBytes, source: "forgotten" }
      : null;
  }
  const parsed = parseId(str);
  if (!parsed) return null;
  if (parsed.kind === "d") return { kind: "d", path: dirPath(parsed.index), index: parsed.index };
  return {
    kind: "f",
    path: filePath(parsed.index),
    index: parsed.index,
    sizeBytes: current.data.files[parsed.index][2],
    source: "scan",
  };
}

function reveal({ id } = {}) {
  const target = resolveTarget(id);
  if (!target) return { ok: false, reason: "Item não encontrado." };
  if (target.kind === "d") {
    void shell.openPath(target.path);
  } else {
    shell.showItemInFolder(target.path);
  }
  return { ok: true };
}

/** Desconta o arquivo removido da pasta e de todas as acima (o mapa atualiza). */
function subtractFromTree(fileIndex) {
  const data = current.data;
  const file = data.files[fileIndex];
  data.removed.add(fileIndex);
  data.dirs[file[0]][4] = Math.max(0, data.dirs[file[0]][4] - file[2]);
  for (let i = file[0]; i >= 0; i = data.dirs[i][0]) {
    data.dirs[i][2] = Math.max(0, data.dirs[i][2] - file[2]);
    data.dirs[i][3] = Math.max(0, data.dirs[i][3] - 1);
    if (data.dirs[i][0] < 0) break;
  }
}

async function trashFiles({ ids, source = "files" } = {}) {
  if (!Array.isArray(ids) || !ids.length) return { ok: false, reason: "Nada selecionado." };
  const e = env();
  let removed = 0;
  let freedBytes = 0;
  const failed = [];
  for (const id of ids.slice(0, 2000)) {
    const target = resolveTarget(id);
    if (!target || target.kind !== "f") {
      failed.push({ id, name: "?", reason: "Item não encontrado." });
      continue;
    }
    const name = path.basename(target.path);
    if (!isUserDeletablePath(target.path, e)) {
      failed.push({ id, name, reason: "Arquivo de sistema ou de programa: o WinCare não remove." });
      continue;
    }
    try {
      const st = fs.lstatSync(target.path);
      if (!st.isFile()) throw new Error("Não é um arquivo.");
      await shell.trashItem(target.path);
      removed++;
      freedBytes += st.size;
      if (target.source === "scan") subtractFromTree(target.index);
      if (target.source === "forgotten") forgotten.delete(String(id));
    } catch (error) {
      failed.push({
        id,
        name,
        reason: error instanceof Error ? error.message : "Não foi possível mover para a Lixeira.",
      });
    }
  }
  if (removed) {
    const titles = {
      duplicates: "Cópias duplicadas enviadas para a Lixeira",
      photos: "Fotos parecidas enviadas para a Lixeira",
      forgotten: "Arquivos esquecidos enviados para a Lixeira",
      files: "Arquivos enviados para a Lixeira",
    };
    history.recordEvent({
      kind: "cleanup",
      action: `trash-${source}`.slice(0, 40),
      title: titles[source] || titles.files,
      detail: `${removed.toLocaleString("pt-BR")} ${removed === 1 ? "arquivo" : "arquivos"} · recuperável pela Lixeira`,
      freedBytes,
      ok: true,
    });
  }
  return { ok: removed > 0 || failed.length === 0, removed, freedBytes, failed };
}

/* ------------------------------ Duplicados ------------------------------ */

function startDuplicates({ minSize = "1mb" } = {}) {
  if (!current?.data) return { ok: false, reason: "Analise uma unidade ou pasta primeiro." };
  if (duplicateJob?.state === "running") return { ok: true, ...publicDuplicates() };
  const min = DUPLICATE_MIN[minSize] ?? DUPLICATE_MIN["1mb"];
  const e = env();
  const data = current.data;
  const bySize = new Map();
  data.files.forEach((file, i) => {
    if (data.removed.has(i) || file[2] < min) return;
    if (!bySize.has(file[2])) bySize.set(file[2], []);
    bySize.get(file[2]).push(i);
  });
  const files = [];
  for (const list of bySize.values()) {
    if (list.length < 2) continue;
    for (const i of list) {
      const full = filePath(i);
      if (!isUserDeletablePath(full, e)) continue;
      files.push({ id: fileId(current.seq, i), path: full, size: data.files[i][2] });
    }
  }
  const seq = current.seq;
  duplicateJob = {
    seq,
    state: "running",
    minSize,
    progress: { done: 0, total: files.length, bytes: 0 },
    groups: [],
  };
  const job = duplicateJob;
  const worker = new Worker(WORKER_FILE, { workerData: { mode: "hash", files } });
  worker.on("message", (msg) => {
    if (duplicateJob !== job) return;
    if (msg.type === "progress")
      job.progress = { done: msg.done, total: msg.total, bytes: msg.bytes };
    else if (msg.type === "done") {
      job.groups = msg.result.groups;
      job.state = "done";
    } else if (msg.type === "error") {
      job.state = "error";
      job.error = msg.message;
    }
  });
  worker.on("error", (error) => {
    job.state = "error";
    job.error = error instanceof Error ? error.message : String(error);
  });
  return { ok: true, ...publicDuplicates() };
}

function publicDuplicates() {
  if (!duplicateJob || duplicateJob.seq !== current?.seq) return { state: "idle", groups: [] };
  const job = duplicateJob;
  if (job.state !== "done") {
    return { state: job.state, progress: job.progress, error: job.error, groups: [] };
  }
  const data = current.data;
  const groups = job.groups
    .map((ids) => {
      const files = ids
        .map((id) => ({ id, parsed: parseId(id) }))
        .filter((f) => f.parsed && !data.removed.has(f.parsed.index))
        .map(({ id, parsed }) => {
          const file = data.files[parsed.index];
          return { id, name: file[1], path: filePath(parsed.index), modifiedAt: file[3] };
        });
      const sizeBytes = files.length ? data.files[parseId(files[0].id).index][2] : 0;
      return {
        id: `g-${ids[0]}`,
        sizeBytes,
        files,
        wastedBytes: sizeBytes * Math.max(0, files.length - 1),
      };
    })
    .filter((g) => g.files.length > 1)
    .sort((a, b) => b.wastedBytes - a.wastedBytes)
    .slice(0, 200);
  return {
    state: "done",
    progress: job.progress,
    groups,
    wastedBytes: groups.reduce((n, g) => n + g.wastedBytes, 0),
  };
}

/* ------------------------------ Fotos parecidas ------------------------------ */

async function hashPhoto(full) {
  const thumb = await nativeImage.createThumbnailFromPath(full, { width: 128, height: 128 });
  if (thumb.isEmpty()) return null;
  const tiny = thumb.resize({ width: 9, height: 8, quality: "good" });
  return {
    hash: differenceHash(tiny.toBitmap()),
    thumbnail: thumb.resize({ width: 96, quality: "good" }).toDataURL(),
  };
}

function startPhotos() {
  if (!current?.data) return { ok: false, reason: "Analise uma unidade ou pasta primeiro." };
  if (photoJob?.state === "running") return { ok: true, ...publicPhotos() };
  const e = env();
  const data = current.data;
  const candidates = [];
  data.files.forEach((file, i) => {
    if (data.removed.has(i) || !isPhoto(file[1])) return;
    candidates.push(i);
  });
  // As mais recentes primeiro: é onde costumam estar as sequências de fotos.
  candidates.sort((a, b) => data.files[b][3] - data.files[a][3]);
  const list = candidates
    .slice(0, MAX_PHOTOS)
    .map((i) => ({ index: i, path: filePath(i) }))
    .filter((c) => isUserDeletablePath(c.path, e));

  const seq = current.seq;
  photoJob = { seq, state: "running", progress: { done: 0, total: list.length }, groups: [] };
  const job = photoJob;
  void (async () => {
    const hashed = [];
    let next = 0;
    const workerLoop = async () => {
      while (next < list.length && photoJob === job) {
        const item = list[next++];
        try {
          const out = await hashPhoto(item.path);
          if (out?.hash) hashed.push({ id: fileId(seq, item.index), index: item.index, ...out });
        } catch {
          /* imagem corrompida ou formato sem miniatura */
        }
        job.progress = { done: job.progress.done + 1, total: list.length };
      }
    };
    await Promise.all([workerLoop(), workerLoop(), workerLoop(), workerLoop()]);
    if (photoJob !== job) return;
    job.groups = groupSimilar(hashed).slice(0, 150);
    job.state = "done";
  })().catch((error) => {
    job.state = "error";
    job.error = error instanceof Error ? error.message : String(error);
  });
  return { ok: true, ...publicPhotos() };
}

function publicPhotos() {
  if (!photoJob || photoJob.seq !== current?.seq) return { state: "idle", groups: [] };
  const job = photoJob;
  if (job.state !== "done")
    return { state: job.state, progress: job.progress, error: job.error, groups: [] };
  const data = current.data;
  const groups = job.groups
    .map((group) => ({
      id: `p-${group[0].id}`,
      photos: group
        .filter((p) => !data.removed.has(p.index))
        .map((p) => {
          const file = data.files[p.index];
          return {
            id: p.id,
            name: file[1],
            path: filePath(p.index),
            sizeBytes: file[2],
            modifiedAt: file[3],
            thumbnail: p.thumbnail,
          };
        }),
    }))
    .filter((g) => g.photos.length > 1);
  return { state: "done", progress: job.progress, groups };
}

/* ------------------------------ Arquivos esquecidos ------------------------------ */

async function walkShallow(root, maxDepth, visit) {
  const stack = [{ dir: root, depth: 0 }];
  let visited = 0;
  while (stack.length && visited < 50_000) {
    const { dir, depth } = stack.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      visited++;
      if (ent.isSymbolicLink()) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (depth < maxDepth) stack.push({ dir: full, depth: depth + 1 });
      } else if (ent.isFile()) {
        try {
          visit(full, ent.name, await fs.promises.lstat(full));
        } catch {
          /* arquivo em uso */
        }
      }
    }
  }
}

async function scanForgotten({ age = "180d" } = {}) {
  const days = FORGOTTEN_AGES[age] ?? 180;
  const now = Date.now();
  const cutoff = now - days * DAY;
  const downloads = app.getPath("downloads");
  const desktop = app.getPath("desktop");
  const e = env();
  const installers = [];
  const oldDownloads = [];
  let seq = 0;
  forgotten = new Map();
  const add = (list, full, name, st, where) => {
    const id = `g${++seq}`;
    forgotten.set(id, { path: full, sizeBytes: st.size });
    list.push({
      id,
      name,
      path: full,
      where,
      sizeBytes: st.size,
      modifiedAt: Math.round(st.mtimeMs),
      category: categoryOf(name),
    });
  };
  const roots = [
    { root: downloads, where: "Downloads" },
    { root: desktop, where: "Área de Trabalho" },
  ];
  for (const { root, where } of roots) {
    if (!root || !fs.existsSync(root)) continue;
    await walkShallow(root, 3, (full, name, st) => {
      if (!isUserDeletablePath(full, e)) return;
      if (isForgottenInstaller(name, st.mtimeMs, now)) {
        add(installers, full, name, st, where);
      } else if (where === "Downloads" && st.mtimeMs <= cutoff) {
        add(oldDownloads, full, name, st, where);
      }
    });
  }
  installers.sort((a, b) => b.sizeBytes - a.sizeBytes);
  oldDownloads.sort((a, b) => b.sizeBytes - a.sizeBytes);
  const sum = (list) => list.reduce((n, it) => n + it.sizeBytes, 0);
  return {
    ok: true,
    age,
    installers: installers.slice(0, 300),
    oldDownloads: oldDownloads.slice(0, 300),
    installersBytes: sum(installers),
    oldDownloadsBytes: sum(oldDownloads),
  };
}

/* ------------------------------ Análises salvas ------------------------------ */

const snapshotDir = () => path.join(app.getPath("userData"), "disk-snapshots");

function readSnapshot(id) {
  if (!/^\d{10,16}$/.test(String(id || ""))) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(snapshotDir(), `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

function listSnapshots() {
  let files = [];
  try {
    files = fs.readdirSync(snapshotDir()).filter((f) => /^\d+\.json$/.test(f));
  } catch {
    /* pasta ainda não existe */
  }
  const items = files
    .map((f) => readSnapshot(f.replace(/\.json$/, "")))
    .filter(Boolean)
    .map(({ entries: _entries, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt);
  return { ok: true, items };
}

/** Pastas até 4 níveis abaixo da raiz com 20 MB ou mais (o suficiente para achar o que cresceu). */
function snapshotEntries() {
  const data = current.data;
  const entries = {};
  for (let i = 0; i < data.dirs.length; i++) {
    if (data.dirs[i][2] < SNAPSHOT_MIN_BYTES) continue;
    if (depthOf(i) > SNAPSHOT_DEPTH) continue;
    entries[dirPath(i)] = data.dirs[i][2];
  }
  return entries;
}

function saveSnapshot() {
  if (!current?.data) return { ok: false, reason: "Nenhuma análise concluída para salvar." };
  const createdAt = Date.now();
  const snapshot = {
    id: String(createdAt),
    root: current.root,
    label: current.label,
    createdAt,
    totalBytes: current.data.dirs[0][2],
    fileCount: current.data.dirs[0][3],
    entries: snapshotEntries(),
  };
  fs.mkdirSync(snapshotDir(), { recursive: true });
  fs.writeFileSync(
    path.join(snapshotDir(), `${snapshot.id}.json`),
    JSON.stringify(snapshot),
    "utf8",
  );
  const all = listSnapshots().items;
  for (const old of all.slice(MAX_SNAPSHOTS)) {
    try {
      fs.unlinkSync(path.join(snapshotDir(), `${old.id}.json`));
    } catch {
      /* ignore */
    }
  }
  const { entries: _entries, ...meta } = snapshot;
  return { ok: true, snapshot: meta };
}

function deleteSnapshot({ id } = {}) {
  if (!readSnapshot(id)) return { ok: false, reason: "Análise não encontrada." };
  fs.unlinkSync(path.join(snapshotDir(), `${id}.json`));
  return { ok: true };
}

/** Compara duas análises salvas, ou uma salva com a atual (`b: "current"`). */
function compareSnapshots({ a, b } = {}) {
  let before = readSnapshot(a);
  if (!before) return { ok: false, reason: "Escolha uma análise salva." };
  let after;
  if (b === "current") {
    if (!current?.data) return { ok: false, reason: "Faça uma análise nova para comparar." };
    after = {
      id: "current",
      root: current.root,
      label: current.label,
      createdAt: current.finishedAt,
      totalBytes: current.data.dirs[0][2],
      fileCount: current.data.dirs[0][3],
      entries: snapshotEntries(),
    };
  } else {
    after = readSnapshot(b);
  }
  if (!after) return { ok: false, reason: "Escolha a segunda análise." };
  if (before.createdAt > after.createdAt) [before, after] = [after, before];
  const diff = diffSnapshots(before.entries, after.entries);
  const meta = ({ entries: _entries, ...rest }) => rest;
  return {
    ok: true,
    before: meta(before),
    after: meta(after),
    sameRoot: before.root.toLowerCase() === after.root.toLowerCase(),
    deltaBytes: after.totalBytes - before.totalBytes,
    ...diff,
  };
}

module.exports = {
  cancelScan,
  childrenOf,
  compareSnapshots,
  deleteSnapshot,
  fileOwners,
  findFiles,
  listSnapshots,
  publicDuplicates,
  publicPhotos,
  publicScan,
  reveal,
  saveSnapshot,
  scanForgotten,
  startDuplicates,
  startPhotos,
  startScan,
  trashFiles,
};
