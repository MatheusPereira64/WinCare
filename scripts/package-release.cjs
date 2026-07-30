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

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "electron-release");
const appDir = path.join(outDir, "WinCare-win32-x64");
const zipPath = path.join(outDir, "WinCare-Windows-x64.zip");

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

function zipFolder(sourceDir, destZip) {
  if (fs.existsSync(destZip)) fs.unlinkSync(destZip);

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
  ]);

  if (!fs.existsSync(path.join(appDir, "WinCare.exe"))) {
    console.error("Falha: WinCare.exe não encontrado em", appDir);
    process.exit(1);
  }

  console.log("=== WinCare: gerando ZIP ===");
  zipFolder(appDir, zipPath);

  const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);
  console.log("");
  console.log("Pronto para distribuição:");
  console.log(`  Pasta: ${appDir}`);
  console.log(`  ZIP:   ${zipPath} (${sizeMb} MB)`);
  console.log("");
  console.log("Usuário final: extrair o ZIP e abrir WinCare.exe");
}

main();
