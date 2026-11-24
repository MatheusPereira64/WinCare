/*
 * Regras puras de arquivos (sem Electron): categorias por extensão, o que pode
 * ir para a Lixeira, hash de imagem para fotos parecidas e comparação de
 * análises de disco. Testadas em electron/tests/file-rules.test.cjs.
 */
const path = require("path");

const DAY = 24 * 60 * 60 * 1000;

/** Categorias da busca de arquivos (chips na tela). */
const CATEGORIES = Object.freeze({
  video: ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg", "ts", "3gp"],
  image: [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "bmp",
    "tif",
    "tiff",
    "webp",
    "heic",
    "heif",
    "raw",
    "cr2",
    "nef",
    "arw",
    "dng",
    "psd",
  ],
  audio: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus", "aiff"],
  document: [
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "odt",
    "ods",
    "odp",
    "txt",
    "rtf",
    "epub",
    "csv",
  ],
  archive: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz", "cab", "zst"],
  installer: ["exe", "msi", "msix", "msixbundle", "appx", "appxbundle"],
  diskImage: ["iso", "img", "vhd", "vhdx", "vmdk", "dmg", "wim", "esd"],
});

const CATEGORY_IDS = Object.freeze(["all", ...Object.keys(CATEGORIES)]);

const EXT_CATEGORY = new Map();
for (const [category, exts] of Object.entries(CATEGORIES)) {
  for (const ext of exts) EXT_CATEGORY.set(ext, category);
}

/** Fotos que dá para decodificar e comparar (o Chromium lê esses formatos). */
const PHOTO_EXTS = new Set(["jpg", "jpeg", "png", "bmp", "webp", "gif"]);

const extOf = (name) => {
  const ext = path.win32
    .extname(String(name || ""))
    .slice(1)
    .toLowerCase();
  return ext.length <= 12 ? ext : "";
};

const categoryOf = (name) => EXT_CATEGORY.get(extOf(name)) || "other";

const isPhoto = (name) => PHOTO_EXTS.has(extOf(name));

/** Arquivos menores que isso não entram no índice da busca (exceto fotos). */
const INDEX_MIN_BYTES = 1024 * 1024;
const INDEX_MIN_PHOTO_BYTES = 100 * 1024;

const shouldIndexFile = (name, size) =>
  size >= INDEX_MIN_BYTES || (size >= INDEX_MIN_PHOTO_BYTES && isPhoto(name));

/* ------------------------------ Segurança ------------------------------ */

const lower = (p) => path.win32.resolve(String(p || "")).toLowerCase();

const isInside = (child, parent) =>
  !!parent &&
  (child === parent || child.startsWith(parent.endsWith("\\") ? parent : `${parent}\\`));

/**
 * Pastas onde nunca apagamos nada pela busca, duplicados ou fotos: arquivos de
 * programas e do Windows quebram apps mesmo quando parecem "cópias".
 */
function systemRoots(env) {
  const drive = String(env.SystemDrive || "C:").toLowerCase();
  return [
    env.WINDIR,
    env.ProgramFiles,
    env["ProgramFiles(x86)"],
    env.ProgramW6432,
    env.ProgramData,
    env.APPDATA,
    env.LOCALAPPDATA,
    env.USERPROFILE && path.win32.join(env.USERPROFILE, "AppData"),
    `${drive}\\$recycle.bin`,
    `${drive}\\system volume information`,
    `${drive}\\recovery`,
    `${drive}\\boot`,
    `${drive}\\$windows.~bt`,
    `${drive}\\$windows.~ws`,
    `${drive}\\windows.old`,
  ]
    .filter(Boolean)
    .map(lower);
}

const SYSTEM_FILES = new Set(["pagefile.sys", "hiberfil.sys", "swapfile.sys", "dumpstack.log"]);

/** Pode ir para a Lixeira a partir das telas de arquivos? */
function isUserDeletablePath(target, env) {
  // Só caminhos absolutos com letra de unidade (nada relativo à pasta atual).
  if (!/^[a-z]:\\/i.test(String(target || ""))) return false;
  const p = lower(target);
  if (!/^[a-z]:\\.+/.test(p)) return false;
  if (SYSTEM_FILES.has(path.win32.basename(p))) return false;
  // Qualquer pasta "$..." na raiz de uma unidade é do sistema ($Recycle.Bin, $WinREAgent…).
  if (/^[a-z]:\\\$/.test(p)) return false;
  if (/\\windowsapps(\\|$)/.test(p)) return false;
  for (const root of systemRoots(env)) {
    if (isInside(p, root)) return false;
  }
  return true;
}

/** Pastas que a varredura de duplicados/fotos nem visita (só arquivos do usuário). */
const isSystemArea = (target, env) => !isUserDeletablePath(path.win32.join(target, "x"), env);

/* ------------------------------ Fotos parecidas ------------------------------ */

/**
 * dHash de 64 bits a partir de um bitmap BGRA 9×8: cada bit diz se o pixel é
 * mais claro que o vizinho da direita. Fotos parecidas (mesma cena, outro
 * tamanho/compressão) ficam a poucos bits de distância.
 */
function differenceHash(bitmap, width = 9, height = 8) {
  if (!bitmap || bitmap.length < width * height * 4) return null;
  const gray = new Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const b = bitmap[i * 4];
    const g = bitmap[i * 4 + 1];
    const r = bitmap[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  let bits = "";
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      bits += gray[y * width + x] > gray[y * width + x + 1] ? "1" : "0";
    }
  }
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

function popcount32(n) {
  let v = n - ((n >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Hash hexadecimal de 64 bits → duas metades de 32 bits (comparação rápida). */
const splitHash = (hex) => [parseInt(hex.slice(0, 8), 16) | 0, parseInt(hex.slice(8, 16), 16) | 0];

const distanceOf = (a, b) => popcount32(a[0] ^ b[0]) + popcount32(a[1] ^ b[1]);

function hammingDistance(a, b) {
  return distanceOf(splitHash(a), splitHash(b));
}

/** Até 6 de 64 bits diferentes: mesma foto reeditada, redimensionada ou em sequência. */
const SIMILAR_MAX_DISTANCE = 6;

/**
 * Agrupa fotos parecidas (união por proximidade). `items`: [{ id, hash, … }].
 * Imagens chapadas (hash todo 0 ou todo 1: telas pretas, fundos lisos) não
 * entram — pareceriam iguais a qualquer outra imagem lisa.
 */
function groupSimilar(items, maxDistance = SIMILAR_MAX_DISTANCE) {
  const valid = items.filter(
    (it) => it.hash && it.hash !== "0000000000000000" && it.hash !== "ffffffffffffffff",
  );
  const parent = valid.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const halves = valid.map((it) => splitHash(it.hash));
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      if (distanceOf(halves[i], halves[j]) <= maxDistance) {
        parent[find(j)] = find(i);
      }
    }
  }
  const groups = new Map();
  valid.forEach((item, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}

/* ------------------------------ Duplicados ------------------------------ */

/** Qual cópia fica: a mais nova ou a mais antiga (pela data de modificação). */
function pickKeeper(files, keep) {
  if (!files.length) return null;
  const sorted = [...files].sort((a, b) =>
    keep === "oldest" ? a.modifiedAt - b.modifiedAt : b.modifiedAt - a.modifiedAt,
  );
  return sorted[0].id;
}

/* ------------------------------ Comparar análises ------------------------------ */

/**
 * Diferença entre duas análises: { [caminho]: bytes }. Devolve as pastas que
 * mais cresceram e as que mais diminuíram (sem repetir pai e filho com a
 * mesma variação: fica o caminho mais fundo, que diz onde está o arquivo).
 */
function compareSnapshots(before, after, { limit = 15, minDelta = 50 * 1024 * 1024 } = {}) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const rows = [];
  for (const key of keys) {
    const a = Number(before?.[key]) || 0;
    const b = Number(after?.[key]) || 0;
    const delta = b - a;
    if (Math.abs(delta) < minDelta) continue;
    rows.push({ path: key, before: a, after: b, delta });
  }
  const pruned = rows.filter(
    (row) =>
      !rows.some(
        (other) =>
          other !== row &&
          isInside(other.path.toLowerCase(), row.path.toLowerCase()) &&
          Math.sign(other.delta) === Math.sign(row.delta) &&
          Math.abs(other.delta) >= Math.abs(row.delta) * 0.9,
      ),
  );
  const grew = pruned.filter((r) => r.delta > 0).sort((x, y) => y.delta - x.delta);
  const shrank = pruned.filter((r) => r.delta < 0).sort((x, y) => x.delta - y.delta);
  return { grew: grew.slice(0, limit), shrank: shrank.slice(0, limit) };
}

/* ------------------------------ Arquivos esquecidos ------------------------------ */

/** Instalador antigo na pasta Downloads/Área de Trabalho (já usado, esquecido). */
const isForgottenInstaller = (name, modifiedAt, now, minDays = 14) =>
  categoryOf(name) === "installer" && now - modifiedAt >= minDays * DAY;

module.exports = {
  CATEGORY_IDS,
  DAY,
  categoryOf,
  compareSnapshots,
  differenceHash,
  groupSimilar,
  hammingDistance,
  isForgottenInstaller,
  isPhoto,
  isSystemArea,
  isUserDeletablePath,
  pickKeeper,
  shouldIndexFile,
};
