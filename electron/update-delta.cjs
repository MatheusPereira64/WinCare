/*
 * Atualização pequena: entre versões com o mesmo Electron só o
 * resources/app.asar muda de verdade (o WinCare.exe muda só o número de
 * versão gravado nele). Então, quando todos os outros arquivos da instalação
 * batem com o manifesto do release, basta baixar o app.asar comprimido
 * (~25 MB em vez do ZIP de ~150 MB) e montar a versão nova a partir dos
 * arquivos locais. Qualquer diferença → ZIP completo, como antes.
 *
 * O manifesto e o .asar.gz são gerados por scripts/package-release.cjs.
 * planDelta é puro e testado em electron/tests/update-apply.test.cjs.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { pipeline } = require("stream/promises");

const MANIFEST_ASSET = "WinCare-manifest.json";
const ASAR_ASSET = "WinCare-app.asar.gz";
const ASAR_PATH = "resources/app.asar";
/** Fica com o executável local (só o número de versão gravado nele muda). */
const KEEP_LOCAL = new Set(["WinCare.exe", ASAR_PATH]);

/** O Electron finge que .asar é pasta; aqui precisamos dos arquivos reais. */
function withNoAsar(fn) {
  const previous = process.noAsar;
  process.noAsar = true;
  try {
    return fn();
  } finally {
    process.noAsar = previous;
  }
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * Dá para atualizar só o app.asar?
 * `local`: { "caminho/relativo": { size, sha256? } } da instalação atual.
 */
function planDelta(manifest, local, electronVersion) {
  if (!manifest || !Array.isArray(manifest.files)) return { ok: false, reason: "no-manifest" };
  if (!manifest.electron || manifest.electron !== electronVersion) {
    return { ok: false, reason: "electron-changed" };
  }
  const asar = manifest.files.find((f) => f.path === ASAR_PATH);
  if (!asar || !/^[a-f0-9]{64}$/.test(asar.sha256 || "")) return { ok: false, reason: "no-asar" };
  for (const f of manifest.files) {
    if (KEEP_LOCAL.has(f.path)) continue;
    const mine = local[f.path];
    if (!mine) return { ok: false, reason: "missing", path: f.path };
    if (mine.size !== f.size || (mine.sha256 && mine.sha256 !== f.sha256)) {
      return { ok: false, reason: "different", path: f.path };
    }
  }
  return { ok: true, asar };
}

/** Lê tamanho e hash dos arquivos que o manifesto cita (só os que importam). */
async function readLocalFiles(installDir, manifest) {
  const out = {};
  for (const f of manifest.files || []) {
    if (KEEP_LOCAL.has(f.path)) continue;
    if (typeof f.path !== "string" || f.path.includes("..")) continue;
    const full = path.join(installDir, ...f.path.split("/"));
    const stat = withNoAsar(() => (fs.existsSync(full) ? fs.statSync(full) : null));
    if (!stat?.isFile()) continue;
    out[f.path] = { size: stat.size };
    if (stat.size === f.size) {
      out[f.path].sha256 = await withNoAsar(() => sha256File(full));
    }
  }
  return out;
}

/** Descomprime o .asar.gz baixado e confere o hash do manifesto. */
async function unpackAsar(gzPath, destPath, expectedSha256) {
  await withNoAsar(() =>
    pipeline(fs.createReadStream(gzPath), zlib.createGunzip(), fs.createWriteStream(destPath)),
  );
  const got = await withNoAsar(() => sha256File(destPath));
  if (got !== expectedSha256) {
    throw new Error("O arquivo baixado não confere com o release (hash diferente).");
  }
}

/**
 * Monta a pasta da versão nova: os arquivos do manifesto copiados da
 * instalação atual + o app.asar novo. Só os do manifesto — se o app foi
 * extraído numa pasta com outras coisas, elas não entram.
 */
function buildStaging(installDir, stagingDir, newAsar, manifest) {
  withNoAsar(() => {
    for (const f of manifest.files) {
      if (f.path === ASAR_PATH || f.path.includes("..")) continue;
      const parts = f.path.split("/");
      const dst = path.join(stagingDir, ...parts);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(installDir, ...parts), dst);
    }
    const asarDst = path.join(stagingDir, ...ASAR_PATH.split("/"));
    fs.mkdirSync(path.dirname(asarDst), { recursive: true });
    fs.copyFileSync(newAsar, asarDst);
  });
  return stagingDir;
}

module.exports = {
  ASAR_ASSET,
  MANIFEST_ASSET,
  buildStaging,
  planDelta,
  readLocalFiles,
  sha256File,
  unpackAsar,
};
