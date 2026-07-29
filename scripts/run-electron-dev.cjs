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

  writeLaunchers(root, brandedExe);
  return brandedExe;
}

/** Atalhos na raiz do projeto — sempre passam o caminho do app ao WinCare.exe. */
function writeLaunchers(rootDir, brandedExe) {
  const relExe = path.relative(rootDir, brandedExe).replace(/\//g, "\\");

  const winCareCmd = `@echo off
setlocal
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"
"%ROOT%\\${relExe}" "%ROOT%"
`;

  const adminCmd = `@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\\" set "ROOT=%ROOT:~0,-1%"
set "EXE=%ROOT%\\${relExe}"

if not exist "%EXE%" (
  echo [WinCare] WinCare.exe nao encontrado. Rode: npm run wincare:dev
  pause
  exit /b 1
)

net session >nul 2>&1
if not %errorLevel%==0 (
  set "VBS=%TEMP%\\wincare-admin-%RANDOM%.vbs"
  >"%VBS%" echo Set sh = CreateObject("Shell.Application")
  >>"%VBS%" echo sh.ShellExecute "%~f0", "", "", "runas", 1
  cscript //nologo "%VBS%"
  del "%VBS%" >nul 2>&1
  exit /b
)

cd /d "%ROOT%"
"%EXE%" "%ROOT%"
`;

  fs.writeFileSync(path.join(rootDir, "WinCare.cmd"), winCareCmd, "utf8");
  fs.writeFileSync(path.join(rootDir, "WinCare-Admin.cmd"), adminCmd, "utf8");
}

const exe = resolveExecutable();

if (process.argv.includes("--admin")) {
  const { spawn: spawnSync } = require("child_process");
  const adminCmd = path.join(root, "WinCare-Admin.cmd");
  if (!fs.existsSync(adminCmd)) {
    console.error("WinCare-Admin.cmd não encontrado. Rode npm run wincare:dev uma vez antes.");
    process.exit(1);
  }
  const child = spawnSync("cmd.exe", ["/c", adminCmd], { cwd: root, stdio: "inherit", env: process.env });
  process.exit(child.status ?? 0);
}

const child = spawn(exe, [root], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
