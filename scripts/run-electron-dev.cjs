const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const electronPath = require("electron");
const electronDist = path.dirname(electronPath);

/**
 * No Windows, prepara .electron-dev/ com o runtime completo do Electron
 * (icudtl.dat, locales, resources, …) e WinCare.exe para o nome correto no Gerenciador de Tarefas.
 */
function resolveExecutable() {
  if (process.platform !== "win32") return electronPath;

  const devDir = path.join(root, ".electron-dev");
  const brandedExe = path.join(devDir, "WinCare.exe");
  const marker = path.join(devDir, ".electron-version");
  const versionFile = path.join(electronDist, "version");
  const version = fs.existsSync(versionFile)
    ? fs.readFileSync(versionFile, "utf8").trim()
    : "unknown";

  const needsSync =
    !fs.existsSync(brandedExe) ||
    !fs.existsSync(path.join(devDir, "icudtl.dat")) ||
    !fs.existsSync(marker) ||
    fs.readFileSync(marker, "utf8").trim() !== version;

  if (needsSync) {
    fs.rmSync(devDir, { recursive: true, force: true });
    fs.mkdirSync(devDir, { recursive: true });

    for (const entry of fs.readdirSync(electronDist)) {
      if (entry === "electron.exe") continue;
      fs.cpSync(path.join(electronDist, entry), path.join(devDir, entry), { recursive: true });
    }

    fs.copyFileSync(path.join(electronDist, "electron.exe"), brandedExe);
    fs.writeFileSync(marker, version, "utf8");
  }

  return brandedExe;
}

const child = spawn(resolveExecutable(), ["."], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
