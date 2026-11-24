/*
 * Trabalho pesado de disco fora do processo principal (worker_threads): a
 * janela e o IPC continuam respondendo enquanto varremos centenas de milhares
 * de arquivos ou calculamos o hash de vários GB.
 *
 * Modos:
 *   scan  → árvore de pastas com tamanho total + índice dos arquivos grandes
 *   hash  → grupos de arquivos com conteúdo idêntico (mesmo tamanho → hash)
 *
 * Não apaga nada: só lê. Junções e links simbólicos não são seguidos (o mesmo
 * arquivo seria contado duas vezes e há laços como "Application Data").
 */
const { parentPort, workerData } = require("worker_threads");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { isSystemArea, shouldIndexFile } = require("./file-rules.cjs");

const PROGRESS_MS = 250;
const MAX_INDEXED_FILES = 300_000;
const PARTIAL_BYTES = 64 * 1024;

let lastProgress = 0;
const progress = (payload, force = false) => {
  const now = Date.now();
  if (!force && now - lastProgress < PROGRESS_MS) return;
  lastProgress = now;
  parentPort.postMessage({ type: "progress", ...payload });
};

function scan({ root, skipSystem, env }) {
  // dirs[i] = [paiIndex, nome, bytesTotal, arquivos, bytesDiretos]
  const dirs = [[-1, root, 0, 0, 0]];
  const dirPaths = [root];
  const files = [];
  let fileCount = 0;
  let totalBytes = 0;
  let skipped = 0;
  const stack = [0];

  while (stack.length) {
    const index = stack.pop();
    const dirPath = dirPaths[index];
    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      skipped++;
      continue;
    }
    for (const ent of entries) {
      if (ent.isSymbolicLink()) continue;
      const full = path.join(dirPath, ent.name);
      if (ent.isDirectory()) {
        if (skipSystem && isSystemArea(full, env)) continue;
        dirs.push([index, ent.name, 0, 0, 0]);
        dirPaths.push(full);
        stack.push(dirs.length - 1);
        continue;
      }
      if (!ent.isFile()) continue;
      let st;
      try {
        st = fs.lstatSync(full);
      } catch {
        skipped++;
        continue;
      }
      const size = st.size;
      fileCount++;
      totalBytes += size;
      dirs[index][4] += size;
      dirs[index][3]++;
      if (files.length < MAX_INDEXED_FILES && shouldIndexFile(ent.name, size)) {
        files.push([index, ent.name, size, Math.round(st.mtimeMs)]);
      }
    }
    progress({ files: fileCount, dirs: dirs.length, bytes: totalBytes, current: dirPath });
  }

  // Filhos sempre vêm depois do pai: somar de trás para frente fecha os totais.
  for (const dir of dirs) dir[2] = dir[4];
  for (let i = dirs.length - 1; i > 0; i--) {
    const parent = dirs[i][0];
    dirs[parent][2] += dirs[i][2];
    dirs[parent][3] += dirs[i][3];
  }

  progress({ files: fileCount, dirs: dirs.length, bytes: totalBytes, current: root }, true);
  return {
    dirs,
    files,
    fileCount,
    totalBytes,
    skipped,
    truncated: files.length >= MAX_INDEXED_FILES,
  };
}

function readChunk(fd, position, length) {
  const buffer = Buffer.alloc(length);
  const read = fs.readSync(fd, buffer, 0, length, position);
  return buffer.subarray(0, read);
}

/** Começo + fim do arquivo: separa quase todos os "mesmo tamanho, conteúdo diferente". */
function partialHash(file) {
  const fd = fs.openSync(file.path, "r");
  try {
    const hash = crypto.createHash("sha1");
    hash.update(readChunk(fd, 0, Math.min(PARTIAL_BYTES, file.size)));
    if (file.size > PARTIAL_BYTES * 2) {
      hash.update(readChunk(fd, file.size - PARTIAL_BYTES, PARTIAL_BYTES));
    }
    return hash.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}

function fullHash(file) {
  const fd = fs.openSync(file.path, "r");
  try {
    const hash = crypto.createHash("sha1");
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, position);
      if (!read) break;
      hash.update(buffer.subarray(0, read));
      position += read;
    }
    return hash.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}

function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    let key;
    try {
      key = keyFn(item);
    } catch {
      continue; // arquivo sumiu ou está travado: fica de fora
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.values()].filter((g) => g.length > 1);
}

function hashDuplicates({ files }) {
  const bySize = groupBy(files, (f) => f.size);
  const total = bySize.reduce((n, g) => n + g.length, 0);
  let done = 0;
  let bytes = 0;
  const groups = [];
  for (const sameSize of bySize) {
    const byPartial = groupBy(sameSize, (f) => {
      done++;
      progress({ done, total, bytes });
      return partialHash(f);
    });
    for (const candidates of byPartial) {
      // Arquivo pequeno: o hash parcial já leu tudo.
      const identical =
        candidates[0].size <= PARTIAL_BYTES * 2
          ? [candidates]
          : groupBy(candidates, (f) => {
              bytes += f.size;
              progress({ done, total, bytes });
              return fullHash(f);
            });
      for (const group of identical) groups.push(group.map((f) => f.id));
    }
  }
  progress({ done: total, total, bytes }, true);
  return { groups };
}

try {
  const result = workerData.mode === "hash" ? hashDuplicates(workerData) : scan(workerData);
  parentPort.postMessage({ type: "done", result });
} catch (error) {
  parentPort.postMessage({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  });
}
