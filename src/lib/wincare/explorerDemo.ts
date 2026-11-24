/**
 * Dados simulados do explorador de armazenamento (modo demonstração e
 * screenshots). Nada aqui toca o disco: "apagar" só some da lista.
 */
import type {
  DiskBreakdown,
  DuplicatesState,
  ExportPayload,
  FileCategory,
  FindFilters,
  FindResult,
  ForgottenAge,
  ForgottenResult,
  PhotosState,
  ScanStatus,
  SnapshotComparison,
  SnapshotMeta,
  TrashResult,
  TreeChild,
  TreeLevel,
} from "./explorer";

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const DAY = 24 * 60 * 60 * 1000;
const now = () => Date.now();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ Árvore ------------------------------ */

interface DemoNode {
  name: string;
  size?: number;
  files?: number;
  age?: number;
  children?: DemoNode[];
}

const f = (name: string, size: number, age = 40): DemoNode => ({ name, size, age, files: 1 });
const d = (name: string, children: DemoNode[], extra = 0): DemoNode => ({
  name,
  children,
  size: extra,
  files: Math.max(1, Math.round(extra / (2 * MB))),
});

const TREE: DemoNode = d("Unidade C:", [
  d(
    "Users",
    [
      d("Usuario", [
        d(
          "Videos",
          [
            f("viagem-2024-4k.mp4", 18.4 * GB, 400),
            f("aniversario.mov", 6.2 * GB, 520),
            f("gravacao-tela.mkv", 3.1 * GB, 95),
          ],
          1.2 * GB,
        ),
        d(
          "Downloads",
          [
            f("ubuntu-24.04-desktop.iso", 5.7 * GB, 410),
            f("SteamSetup.exe", 2.3 * MB, 300),
            f("backup-fotos-2022.zip", 9.4 * GB, 700),
            f("Instalador-Office.exe", 4.1 * GB, 250),
          ],
          3.4 * GB,
        ),
        d("Pictures", [d("Celular", [], 22.8 * GB), d("Câmera", [], 14.1 * GB)], 2.2 * GB),
        d(
          "Documents",
          [d("Projetos", [], 8.6 * GB), f("planilha-2023.xlsx", 48 * MB, 600)],
          3.9 * GB,
        ),
        d("AppData", [d("Local", [], 31.5 * GB), d("Roaming", [], 9.8 * GB)], 0.2 * GB),
        d("Desktop", [f("video-final-v3.mp4", 2.6 * GB, 210)], 0.9 * GB),
      ]),
    ],
    0,
  ),
  d("Windows", [d("WinSxS", [], 11.3 * GB), d("System32", [], 7.6 * GB)], 9.2 * GB),
  d(
    "Program Files",
    [d("Steam", [], 96.4 * GB), d("Adobe", [], 12.8 * GB), d("Microsoft Office", [], 4.6 * GB)],
    6.1 * GB,
  ),
  d("Program Files (x86)", [], 14.2 * GB),
  d("ProgramData", [], 6.8 * GB),
  f("pagefile.sys", 16 * GB, 2),
  f("hiberfil.sys", 12.7 * GB, 2),
]);

interface Flat {
  id: string;
  parent: string | null;
  node: DemoNode;
  path: string;
  total: number;
  fileCount: number;
}

const flat = new Map<string, Flat>();
let removed = new Set<string>();

function index(node: DemoNode, parent: Flat | null, id: string): Flat {
  const path = parent ? `${parent.path === "C:" ? "C:" : parent.path}\\${node.name}` : "C:";
  const entry: Flat = { id, parent: parent?.id ?? null, node, path, total: 0, fileCount: 0 };
  flat.set(id, entry);
  if (node.children) {
    let total = node.size || 0;
    let files = node.files || 0;
    node.children.forEach((child, i) => {
      const c = index(child, entry, `${id}.${i}`);
      total += c.total;
      files += c.fileCount;
    });
    entry.total = total;
    entry.fileCount = files;
  } else {
    entry.total = node.size || 0;
    entry.fileCount = 1;
  }
  return entry;
}
index(TREE, null, "demo");

const categoryOf = (name: string): FileCategory => {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["mp4", "mov", "mkv"].includes(ext)) return "video";
  if (["jpg", "png"].includes(ext)) return "image";
  if (["iso"].includes(ext)) return "diskImage";
  if (["zip"].includes(ext)) return "archive";
  if (["exe", "msi"].includes(ext)) return "installer";
  if (["xlsx", "pdf", "docx"].includes(ext)) return "document";
  return "other";
};

const sizeOf = (id: string) => {
  const entry = flat.get(id);
  if (!entry || removed.has(id)) return 0;
  if (!entry.node.children) return entry.total;
  let total = entry.node.size || 0;
  entry.node.children.forEach((_, i) => (total += sizeOf(`${id}.${i}`)));
  return total;
};

/* ------------------------------ Análise ------------------------------ */

let scan: ScanStatus = {
  ok: true,
  state: "idle",
  drives: [
    { letter: "C", totalBytes: 476 * GB, freeBytes: 128 * GB },
    { letter: "D", totalBytes: 1863 * GB, freeBytes: 1120 * GB },
  ],
};

export async function scanStart(options: { target: "drive" | "folder"; drive?: string }) {
  await wait(150);
  const label = options.target === "folder" ? "Usuario" : `Unidade ${options.drive || "C"}:`;
  scan = {
    ...scan,
    state: "scanning",
    kind: options.target,
    label,
    root: "C:\\",
    startedAt: now(),
    progress: { files: 0, dirs: 0, bytes: 0, current: "C:\\Users" },
  };
  const started = now();
  const total = flat.get("demo")!.total;
  const tick = () => {
    const pct = Math.min(1, (now() - started) / 2600);
    if (scan.state !== "scanning") return;
    if (pct >= 1) {
      scan = {
        ...scan,
        state: "done",
        finishedAt: now(),
        rootId: "demo",
        totalBytes: sizeOf("demo"),
        fileCount: 412_380,
        dirCount: 61_204,
        skipped: 14,
        truncated: false,
        progress: { files: 412_380, dirs: 61_204, bytes: total, current: "C:\\" },
      };
      return;
    }
    scan = {
      ...scan,
      progress: {
        files: Math.round(412_380 * pct),
        dirs: Math.round(61_204 * pct),
        bytes: Math.round(total * pct),
        current: pct < 0.5 ? "C:\\Users\\Usuario\\AppData\\Local" : "C:\\Program Files\\Steam",
      },
    };
    setTimeout(tick, 200);
  };
  setTimeout(tick, 200);
  return scan;
}

export async function scanStatus() {
  return scan.state === "done" ? { ...scan, totalBytes: sizeOf("demo") } : scan;
}

export async function scanCancel() {
  if (scan.state === "scanning") scan = { ...scan, state: "cancelled" };
  return { ok: true };
}

export async function treeLevel(id = "demo"): Promise<TreeLevel> {
  const entry = flat.get(id) ?? flat.get("demo")!;
  const breadcrumb: { id: string; name: string }[] = [];
  for (let e: Flat | undefined = entry; e; e = e.parent ? flat.get(e.parent) : undefined) {
    breadcrumb.unshift({ id: e.id, name: e.node.name });
  }
  const children: TreeChild[] = (entry.node.children || [])
    .map((child, i) => {
      const cid = `${entry.id}.${i}`;
      const c = flat.get(cid)!;
      return child.children
        ? {
            id: cid,
            kind: "dir" as const,
            name: child.name,
            sizeBytes: sizeOf(cid),
            fileCount: c.fileCount,
          }
        : {
            id: cid,
            kind: "file" as const,
            name: child.name,
            sizeBytes: sizeOf(cid),
            modifiedAt: now() - (child.age || 30) * DAY,
            category: categoryOf(child.name),
          };
    })
    .filter((c) => c.sizeBytes > 0);
  if (entry.node.size) {
    children.push({
      id: `${entry.id}-rest`,
      kind: "rest",
      name: "Arquivos pequenos",
      sizeBytes: entry.node.size,
    });
  }
  children.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return {
    ok: true,
    node: {
      id: entry.id,
      name: entry.node.name,
      path: entry.path,
      sizeBytes: sizeOf(entry.id),
      fileCount: entry.fileCount,
    },
    breadcrumb,
    children,
  };
}

/* ------------------------------ Busca ------------------------------ */

const SIZE_MIN: Record<FindFilters["size"], number> = {
  any: 0,
  "10mb": 10 * MB,
  "100mb": 100 * MB,
  "500mb": 500 * MB,
  "1gb": GB,
  "5gb": 5 * GB,
};
const AGE_DAYS: Record<FindFilters["age"], number> = {
  any: 0,
  "30d": 30,
  "180d": 180,
  "1y": 365,
  "2y": 730,
};

export async function findFiles(filters: FindFilters): Promise<FindResult> {
  await wait(120);
  const files = [...flat.values()].filter(
    (e) => !e.node.children && !removed.has(e.id) && e.parent,
  );
  const items = files
    .map((e) => ({
      id: e.id,
      name: e.node.name,
      path: e.path,
      sizeBytes: e.total,
      modifiedAt: now() - (e.node.age || 30) * DAY,
      category: categoryOf(e.node.name),
      deletable: !/\.sys$/.test(e.node.name),
    }))
    .filter((it) => it.sizeBytes >= SIZE_MIN[filters.size])
    .filter((it) => !AGE_DAYS[filters.age] || now() - it.modifiedAt >= AGE_DAYS[filters.age] * DAY)
    .filter((it) => filters.category === "all" || it.category === filters.category)
    .sort((a, b) =>
      filters.sort === "oldest" ? a.modifiedAt - b.modifiedAt : b.sizeBytes - a.sizeBytes,
    );
  return {
    ok: true,
    total: items.length,
    totalBytes: items.reduce((n, it) => n + it.sizeBytes, 0),
    items,
  };
}

export async function fileOwners(ids: string[]) {
  await wait(400);
  return {
    ok: true,
    owners: Object.fromEntries(
      ids.map((id) => [id, id.includes(".2.") ? "BUILTIN\\Administradores" : "PC\\Usuario"]),
    ),
  };
}

/* ------------------------------ Lixeira ------------------------------ */

export async function trash(ids: string[]): Promise<TrashResult> {
  await wait(300);
  let freedBytes = 0;
  for (const id of ids) {
    freedBytes += sizeOf(id) || DUP_SIZES.get(id) || 0;
    removed = new Set([...removed, id]);
    forgottenRemoved.add(id);
  }
  return { ok: true, removed: ids.length, freedBytes, failed: [] };
}

/* ------------------------------ Duplicados ------------------------------ */

const DUP_SIZES = new Map<string, number>();

const DUPLICATES = [
  {
    name: "backup-fotos-2022.zip",
    size: 9.4 * GB,
    paths: [
      "C:\\Users\\Usuario\\Downloads\\backup-fotos-2022.zip",
      "D:\\Backup\\backup-fotos-2022 (1).zip",
    ],
  },
  {
    name: "video-final.mp4",
    size: 2.6 * GB,
    paths: [
      "C:\\Users\\Usuario\\Desktop\\video-final-v3.mp4",
      "C:\\Users\\Usuario\\Videos\\video-final.mp4",
      "D:\\Edição\\exportado.mp4",
    ],
  },
  {
    name: "ubuntu-24.04-desktop.iso",
    size: 5.7 * GB,
    paths: ["C:\\Users\\Usuario\\Downloads\\ubuntu-24.04-desktop.iso", "D:\\ISOs\\ubuntu.iso"],
  },
];

let dupState: DuplicatesState = { state: "idle", groups: [] };

function buildDuplicates(): DuplicatesState {
  const groups = DUPLICATES.map((g, gi) => {
    const files = g.paths
      .map((p, i) => {
        const id = `dup-${gi}-${i}`;
        DUP_SIZES.set(id, g.size);
        return {
          id,
          name: p.split("\\").pop() || g.name,
          path: p,
          modifiedAt: now() - (300 - i * 90) * DAY,
        };
      })
      .filter((file) => !removed.has(file.id));
    return { id: `dg-${gi}`, sizeBytes: g.size, files, wastedBytes: g.size * (files.length - 1) };
  }).filter((g) => g.files.length > 1);
  return {
    state: "done",
    progress: { done: 9, total: 9 },
    groups,
    wastedBytes: groups.reduce((n, g) => n + g.wastedBytes, 0),
  };
}

export async function duplicatesStart() {
  dupState = { state: "running", progress: { done: 0, total: 9 }, groups: [] };
  setTimeout(() => (dupState = buildDuplicates()), 1800);
  return dupState;
}

export async function duplicatesStatus() {
  return dupState.state === "done" ? buildDuplicates() : dupState;
}

/* ------------------------------ Fotos parecidas ------------------------------ */

/** Miniatura simulada: paisagem em SVG com a cor de cada "cena". */
function thumb(hue: number, shift: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="72"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,${62 + shift}%)"/><stop offset="1" stop-color="hsl(${hue + 30},60%,${38 + shift}%)"/></linearGradient></defs><rect width="96" height="72" fill="url(#g)"/><circle cx="${70 - shift}" cy="20" r="9" fill="hsl(48,95%,75%)"/><path d="M0 58 L28 34 L48 50 L66 30 L96 56 V72 H0Z" fill="hsl(${hue + 120},35%,${24 + shift}%)"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

let photoState: PhotosState = { state: "idle", groups: [] };

function buildPhotos(): PhotosState {
  const scenes = [
    { hue: 200, name: "praia", count: 4 },
    { hue: 20, name: "por-do-sol", count: 3 },
    { hue: 140, name: "trilha", count: 2 },
  ];
  const groups = scenes
    .map((scene, si) => ({
      id: `pg-${si}`,
      photos: Array.from({ length: scene.count }, (_, i) => ({
        id: `photo-${si}-${i}`,
        name: `IMG_2024${si}${i}_${scene.name}.jpg`,
        path: `C:\\Users\\Usuario\\Pictures\\Celular\\IMG_2024${si}${i}_${scene.name}.jpg`,
        sizeBytes: (3.1 + i * 0.4) * MB,
        modifiedAt: now() - (60 + si * 20) * DAY + i * 4000,
        thumbnail: thumb(scene.hue, i * 3),
      })).filter((p) => !removed.has(p.id)),
    }))
    .filter((g) => g.photos.length > 1);
  return { state: "done", progress: { done: 1240, total: 1240 }, groups };
}

export async function photosStart() {
  photoState = { state: "running", progress: { done: 0, total: 1240 }, groups: [] };
  setTimeout(() => (photoState = buildPhotos()), 2000);
  return photoState;
}

export async function photosStatus() {
  return photoState.state === "done" ? buildPhotos() : photoState;
}

/* ------------------------------ Esquecidos ------------------------------ */

const forgottenRemoved = new Set<string>();

export async function forgotten(age: ForgottenAge): Promise<ForgottenResult> {
  await wait(500);
  const minDays = { "90d": 90, "180d": 180, "1y": 365 }[age];
  const installers = [
    { id: "g1", name: "Instalador-Office.exe", days: 250, size: 4.1 * GB },
    { id: "g2", name: "ChromeSetup.exe", days: 120, size: 1.4 * MB },
    { id: "g3", name: "python-3.12.1-amd64.exe", days: 330, size: 25 * MB },
    { id: "g4", name: "DiscordSetup.exe", days: 60, size: 98 * MB },
  ];
  const old = [
    { id: "g5", name: "backup-fotos-2022.zip", days: 700, size: 9.4 * GB },
    { id: "g6", name: "ubuntu-24.04-desktop.iso", days: 410, size: 5.7 * GB },
    { id: "g7", name: "relatorio-2023.pdf", days: 540, size: 6 * MB },
    { id: "g8", name: "fotos-casamento.rar", days: 220, size: 2.2 * GB },
  ];
  const toItem = (it: (typeof old)[number], where: string) => ({
    id: it.id,
    name: it.name,
    path: `C:\\Users\\Usuario\\${where === "Downloads" ? "Downloads" : "Desktop"}\\${it.name}`,
    where,
    sizeBytes: it.size,
    modifiedAt: now() - it.days * DAY,
    category: categoryOf(it.name),
  });
  const ins = installers
    .filter((i) => !forgottenRemoved.has(i.id))
    .map((i) => toItem(i, "Downloads"));
  const downloads = old
    .filter((i) => !forgottenRemoved.has(i.id) && i.days >= minDays)
    .map((i) => toItem(i, "Downloads"));
  return {
    ok: true,
    age,
    installers: ins,
    oldDownloads: downloads,
    installersBytes: ins.reduce((n, i) => n + i.sizeBytes, 0),
    oldDownloadsBytes: downloads.reduce((n, i) => n + i.sizeBytes, 0),
  };
}

/* ------------------------------ Análises salvas ------------------------------ */

let snapshots: SnapshotMeta[] = [
  {
    id: "1700000000001",
    root: "C:\\",
    label: "Unidade C:",
    createdAt: now() - 14 * DAY,
    totalBytes: 301 * GB,
    fileCount: 398_120,
  },
  {
    id: "1700000000002",
    root: "C:\\",
    label: "Unidade C:",
    createdAt: now() - 7 * DAY,
    totalBytes: 318 * GB,
    fileCount: 405_840,
  },
];

export async function listSnapshots() {
  return { ok: true, items: [...snapshots].sort((a, b) => b.createdAt - a.createdAt) };
}

export async function saveSnapshot() {
  if (scan.state !== "done") return { ok: false, reason: "Nenhuma análise concluída para salvar." };
  const snap: SnapshotMeta = {
    id: String(now()),
    root: "C:\\",
    label: scan.label || "Unidade C:",
    createdAt: now(),
    totalBytes: sizeOf("demo"),
    fileCount: 412_380,
  };
  snapshots = [snap, ...snapshots];
  return { ok: true, snapshot: snap };
}

export async function deleteSnapshot(id: string) {
  snapshots = snapshots.filter((s) => s.id !== id);
  return { ok: true };
}

export async function compareSnapshots(a: string, b: string): Promise<SnapshotComparison> {
  await wait(200);
  const before = snapshots.find((s) => s.id === a) ?? snapshots[snapshots.length - 1];
  const after =
    b === "current"
      ? {
          id: "current",
          root: "C:\\",
          label: "Análise atual",
          createdAt: now(),
          totalBytes: sizeOf("demo"),
          fileCount: 412_380,
        }
      : (snapshots.find((s) => s.id === b) ?? snapshots[0]);
  const grew = [
    { path: "C:\\Program Files\\Steam\\steamapps", before: 64.2 * GB, after: 96.4 * GB },
    { path: "C:\\Users\\Usuario\\Videos", before: 12.1 * GB, after: 28.9 * GB },
    { path: "C:\\Users\\Usuario\\AppData\\Local\\Temp", before: 1.2 * GB, after: 6.8 * GB },
    { path: "C:\\Windows\\SoftwareDistribution", before: 0.9 * GB, after: 3.4 * GB },
  ].map((r) => ({ ...r, delta: r.after - r.before }));
  const shrank = [
    { path: "C:\\Users\\Usuario\\Downloads", before: 31.2 * GB, after: 22.9 * GB },
    { path: "C:\\Program Files\\Adobe", before: 15.4 * GB, after: 12.8 * GB },
  ].map((r) => ({ ...r, delta: r.after - r.before }));
  return {
    ok: true,
    before,
    after,
    sameRoot: true,
    deltaBytes: after.totalBytes - before.totalBytes,
    grew,
    shrank,
  };
}

/* ------------------------------ O que ocupa a unidade ------------------------------ */

export async function diskBreakdown(drive: string): Promise<DiskBreakdown> {
  await wait(250);
  const d = drive.toUpperCase().startsWith("D");
  const totalBytes = (d ? 1863 : 476) * GB;
  const freeBytes = (d ? 1120 : 128) * GB;
  const sizes = d
    ? { apps: 412 * GB, recycle: 0.2 * GB }
    : {
        apps: 132.6 * GB,
        system: 28.1 * GB,
        desktop: 3.5 * GB,
        downloads: 22.4 * GB,
        documents: 12.5 * GB,
        pictures: 39.1 * GB,
        videos: 29.5 * GB,
        music: 2.8 * GB,
        recycle: 1.4 * GB,
      };
  const known = Object.values(sizes).reduce((n, v) => n + v, 0);
  return {
    ok: true,
    drive: drive.toUpperCase(),
    state: "done",
    at: now() - 6 * 60_000,
    totalBytes,
    freeBytes,
    usedBytes: totalBytes - freeBytes,
    sizes,
    otherBytes: Math.max(0, totalBytes - freeBytes - known),
  };
}

/* ------------------------------ Exportar ------------------------------ */

export async function exportInBrowser(payload: ExportPayload) {
  const header = payload.columns.map((c) => c.label).join(";");
  const lines = payload.rows.map((row) =>
    payload.columns.map((c) => String(row[c.key] ?? "").replace(/;/g, ",")).join(";"),
  );
  const blob = new Blob([`\uFEFF${[header, ...lines].join("\r\n")}`], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${payload.fileName || "wincare"}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  return { ok: true, path: link.download };
}
