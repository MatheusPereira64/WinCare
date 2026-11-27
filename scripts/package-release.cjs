/**
 * Empacota o WinCare para Windows e gera um ZIP pronto para GitHub Releases.
 *
 * Saída:
 *   electron-release/WinCare-win32-x64/   (pasta do app)
 *   electron-release/WinCare-Windows-x64.zip
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { signPackage } = require("./sign-windows.cjs");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "electron-release");
const appDir = path.join(outDir, "WinCare-win32-x64");
const zipPath = path.join(outDir, "WinCare-Windows-x64.zip");
// Atualização pequena (electron/update-delta.cjs): manifesto + app.asar comprimido.
const manifestPath = path.join(outDir, "WinCare-manifest.json");
const asarGzPath = path.join(outDir, "WinCare-app.asar.gz");

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    ...opts,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/**
 * O Electron vem com arquivos datados de 01/01/1980 (UTC). Em fusos atrás do
 * UTC (ex.: Brasil) isso vira 31/12/1979, que o formato ZIP não aceita e o
 * Compress-Archive falha. Puxa essas datas para 02/01/1980.
 */
function fixZipDates(dir) {
  const min = new Date(1980, 0, 2);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) fixZipDates(full);
    if (fs.statSync(full).mtime < min) fs.utimesSync(full, min, min);
  }
}

function zipFolder(sourceDir, destZip) {
  if (fs.existsSync(destZip)) fs.unlinkSync(destZip);
  fixZipDates(sourceDir);

  if (process.platform === "win32") {
    const ps = [
      "$ErrorActionPreference = 'Stop'",
      `Compress-Archive -Path '${sourceDir.replace(/'/g, "''")}\\*' -DestinationPath '${destZip.replace(/'/g, "''")}' -Force`,
    ].join("; ");
    run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps]);
    return;
  }

  run("zip", ["-r", destZip, "."], { cwd: sourceDir });
}

function listFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** Hash de cada arquivo do app + app.asar comprimido, publicados no release. */
function writeUpdateManifest(sourceDir) {
  const crypto = require("crypto");
  const zlib = require("zlib");
  const files = listFiles(sourceDir).map((full) => {
    const data = fs.readFileSync(full);
    return {
      path: path.relative(sourceDir, full).split(path.sep).join("/"),
      size: data.length,
      sha256: crypto.createHash("sha256").update(data).digest("hex"),
    };
  });
  const manifest = {
    version: require(path.join(root, "package.json")).version,
    electron: require("electron/package.json").version,
    files,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);
  const asar = fs.readFileSync(path.join(sourceDir, "resources", "app.asar"));
  fs.writeFileSync(asarGzPath, zlib.gzipSync(asar, { level: 9 }));
}

function main() {
  console.log("=== WinCare: build da interface ===");
  run("npx", ["vite", "build", "--config", "vite.electron.config.ts"]);

  fs.mkdirSync(outDir, { recursive: true });

  console.log("=== WinCare: empacotando Electron (win32-x64) ===");
  run("npx", [
    "@electron/packager",
    ".",
    "WinCare",
    "--platform=win32",
    "--arch=x64",
    `--out=${outDir}`,
    "--overwrite",
    "--executable-name=WinCare",
    "--icon=electron/assets/icon.ico",
    "--win32metadata.ProductName=WinCare",
    "--win32metadata.FileDescription=WinCare — Central de manutenção do Windows",
    "--win32metadata.InternalName=WinCare",
    "--win32metadata.OriginalFilename=WinCare.exe",
    "--ignore=node_modules",
    "--ignore=^/src",
    "--ignore=^/public",
    "--ignore=^/electron-release",
    "--ignore=^/.electron-dev",
    "--ignore=^/.git",
    "--ignore=^/.github",
    "--ignore=^/docs",
    "--ignore=^/scripts",
    "--ignore=^/electron/tests",
    // Pastas de desenvolvimento/teste que só existem na máquina de quem empacota.
    "--ignore=^/\\.update-test",
    "--ignore=^/\\.output",
    "--ignore=^/\\.wrangler",
    "--ignore=^/\\.cursor",
    "--ignore=^/\\.tanstack",
    "--ignore=^/\\.lovable",
    "--ignore=^/\\.claude",
    "--ignore=^/e2e",
    "--ignore=^/tests",
    "--ignore=^/test-results",
    "--ignore=^/playwright-report",
  ]);

  if (!fs.existsSync(path.join(appDir, "WinCare.exe"))) {
    console.error("Falha: WinCare.exe não encontrado em", appDir);
    process.exit(1);
  }

  console.log("=== WinCare: assinatura de código ===");
  signPackage(appDir);

  console.log("=== WinCare: gerando ZIP ===");
  zipFolder(appDir, zipPath);

  console.log("=== WinCare: manifesto da atualização pequena ===");
  writeUpdateManifest(appDir);

  const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);
  console.log("");
  console.log("Pronto para distribuição:");
  console.log(`  Pasta: ${appDir}`);
  console.log(`  ZIP:   ${zipPath} (${sizeMb} MB)`);
  const gzMb = (fs.statSync(asarGzPath).size / (1024 * 1024)).toFixed(1);
  console.log(`  Atualização pequena: ${path.basename(asarGzPath)} (${gzMb} MB) + manifesto`);
  console.log("");
  console.log("Usuário final: extrair o ZIP e abrir WinCare.exe");
}

main();
