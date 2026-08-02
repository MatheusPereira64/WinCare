const { app, BrowserWindow, ipcMain, shell, protocol, net, Menu } = require("electron");
const { spawn, exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const url = require("url");
const os = require("os");
const logger = require("./logger.cjs");
const updater = require("./updater.cjs");

let mainWindow = null;

const DIST = path.join(__dirname, "..", "dist");

const APP_NAME = "WinCare";
const APP_ID = "com.wincare.desktop";

app.setName(APP_NAME);
process.title = APP_NAME;

if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function attachRendererConsoleLogger(webContents) {
  webContents.on("console-message", (details) => {
    const message = details.message ?? "";
    if (message.includes("Electron Security Warning")) return;
    const level = details.level ?? "info";
    if (level === "info" || level === "debug") return;
    const tag = level === "error" ? "error" : "warn";
    logger[tag](
      "renderer",
      `${message.slice(0, 500)} (${details.sourceId ?? "?"}:${details.lineNumber ?? "?"})`,
    );
  });
}

function clearRendererStorage() {
  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed()) return Promise.resolve({ ok: false });
  return contents.session
    .clearStorageData({ storages: ["localstorage"] })
    .then(() => ({ ok: true }))
    .catch(() => ({ ok: false }));
}

function buildAppMenu() {
  const { logDir, logFile } = logger.getLogPaths();
  const template = [
    {
      label: APP_NAME,
      submenu: [
        {
          label: "Limpar histórico local",
          click: async () => {
            await clearRendererStorage();
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.reload();
            }
          },
        },
        {
          label: "Abrir pasta de logs",
          click: () => {
            if (logDir) shell.openPath(logDir);
          },
        },
        {
          label: "Abrir arquivo de log",
          click: () => {
            if (logFile) shell.openPath(logFile);
          },
        },
        {
          label: "Verificar atualizações",
          click: async () => {
            try {
              const info = await updater.checkForUpdate();
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("wincare:updateAvailable", info);
              }
            } catch (error) {
              logger.error(
                "updater",
                "Falha ao verificar atualizações (menu)",
                error instanceof Error ? error.message : error,
              );
            }
          },
        },
        {
          label: "Abrir página de releases",
          click: async () => {
            try {
              await updater.openLatestReleasePage();
            } catch (error) {
              logger.error(
                "updater",
                "Falha ao abrir releases",
                error instanceof Error ? error.message : error,
              );
            }
          },
        },
        { type: "separator" },
        { role: "quit", label: "Sair" },
      ],
    },
    {
      label: "Exibir",
      submenu: [
        { role: "reload", label: "Recarregar" },
        { role: "forceReload", label: "Forçar recarregamento" },
        { type: "separator" },
        {
          label: "Ferramentas de desenvolvedor",
          accelerator: "F12",
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
        { type: "separator" },
        { role: "togglefullscreen", label: "Tela cheia" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    backgroundColor: "#0d1117",
    title: APP_NAME,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.key === "F12") {
      mainWindow.webContents.toggleDevTools();
    }
  });

  attachRendererConsoleLogger(mainWindow.webContents);

  mainWindow.webContents.on("did-fail-load", (_event, code, desc, url) => {
    logger.error("window", `Falha ao carregar ${url}`, { code, desc });
  });

  if (process.env.WINCARE_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.loadURL("app://wincare/index.html");
  logger.log("window", "Janela criada", { url: "app://wincare/index.html" });
}

// ES modules can't be loaded over file:// (blocked by CORS), so the built SPA
// is served through a custom app:// protocol instead.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (hasSingleInstanceLock) {
  app.whenReady().then(() => {
    logger.initLogger(app);
    logger.log("app", "WinCare iniciado", {
      userData: app.getPath("userData"),
      logFile: logger.getLogPaths().logFile,
    });
    buildAppMenu();
    protocol.handle("app", (request) => {
      const { pathname } = new URL(request.url);
      let filePath = path.join(DIST, decodeURIComponent(pathname));
      if (!filePath.startsWith(DIST)) {
        filePath = path.join(DIST, "index.html");
      } else {
        try {
          if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            filePath = path.join(DIST, "index.html");
          }
        } catch {
          filePath = path.join(DIST, "index.html");
        }
      }
      return net.fetch(url.pathToFileURL(filePath).toString());
    });
    createWindow();
  });
  app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
}

const MAX_STREAM_LINES = 300;
const DEFAULT_RUN_TIMEOUT_MS = 60000;
const SPAWN_OPTS = { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] };

const commandTimeoutMs = (command, timeoutMs) => {
  if (typeof timeoutMs === "number" && timeoutMs > 0) return timeoutMs;
  if (/^tracert(\.exe)?\s/i.test(command)) return 90000;
  if (/^ping(\.exe)?\s/i.test(command)) return 15000;
  return DEFAULT_RUN_TIMEOUT_MS;
};

const isBufferedCommand = (command) => {
  const trimmed = command.trim();
  return /^(ping|nslookup|ipconfig|tracert|netsh|wmic|powershell|cmd)\b/i.test(trimmed);
};

const toText = (chunk) => {
  if (!chunk) return "";
  return Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
};

const decodeOutput = (stdout, stderr) => `${toText(stdout)}${toText(stderr)}`;

const tailLine = (text) => text.trim().split(/\r?\n/).filter(Boolean).pop() || "";

const MAX_OUTPUT_CHARS = 50000;

/** Executa um comando e devolve saída completa na resposta IPC (sem streaming). */
function execBuffered(command, limitMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      logger.log("exec", "Concluído", {
        command: command.slice(0, 120),
        code: payload.code,
        result: payload.result?.slice(0, 160),
      });
      resolve(payload);
    };

    logger.log("exec", "Iniciando", { command: command.slice(0, 160), limitMs });

    const child = exec(
      command,
      {
        timeout: limitMs,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
        shell: process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : true,
      },
      (err, stdout, stderr) => {
        const output = decodeOutput(stdout, stderr).slice(0, MAX_OUTPUT_CHARS);
        const tail = tailLine(output);

        if (err && err.killed) {
          logger.warn("exec", "Timeout", { command: command.slice(0, 120) });
          finish({
            code: 1,
            result: `Comando encerrado após ${Math.round(limitMs / 1000)} segundos.`,
            output,
          });
          return;
        }

        finish({
          code: typeof err?.code === "number" ? err.code : err ? 1 : 0,
          result: tail || (err ? err.message : "Comando concluído com êxito."),
          output,
        });
      },
    );

    // Safety kill — alguns comandos (nslookup/ipconfig) ignoram o timeout do exec.
    const killTimer = setTimeout(() => {
      if (settled) return;
      try {
        if (process.platform === "win32") {
          exec(`taskkill /PID ${child.pid} /T /F`, { windowsHide: true });
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        /* ignore */
      }
      finish({
        code: 1,
        result: `Comando encerrado após ${Math.round(limitMs / 1000)} segundos.`,
        output: "",
      });
    }, limitMs + 1500);

    child.on("exit", () => clearTimeout(killTimer));
  });
}

/** Short diagnostic commands — one exec, no streaming pipe issues. */
function runBufferedCommand(_event, { command, limitMs }) {
  return execBuffered(command, limitMs);
}

const isWindowsAdmin = () =>
  new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => resolve(false), 8000);
    exec(
      'powershell -NoProfile -Command "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"',
      { timeout: 7000, windowsHide: true },
      (err, stdout) => {
        clearTimeout(timer);
        resolve(!err && stdout.trim().toLowerCase() === "true");
      },
    );
  });

const cleanupFiles = (files) => {
  for (const file of files) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
};

/** Executa comando elevado e retorna saída completa (sem streaming IPC). */
function runElevatedBuffered(command, limitMs = 120000) {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const outFile = path.join(os.tmpdir(), `wincare-${id}.out.log`);
    const errFile = path.join(os.tmpdir(), `wincare-${id}.err.log`);
    const batFile = path.join(os.tmpdir(), `wincare-${id}.cmd`);
    const escaped = command.replace(/"/g, '""');
    const bat = `@echo off\r\n(${escaped}) 1>"${outFile}" 2>"${errFile}"\r\nexit /b %ERRORLEVEL%\r\n`;
    fs.writeFileSync(batFile, bat, "utf8");

    const ps = `Start-Process -FilePath '${batFile.replace(/'/g, "''")}' -Verb RunAs -Wait -WindowStyle Hidden`;
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps.replace(/"/g, '\\"')}"`,
      { timeout: limitMs, windowsHide: true },
      (err) => {
        const stdout = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : "";
        const stderr = fs.existsSync(errFile) ? fs.readFileSync(errFile, "utf8") : "";
        cleanupFiles([outFile, errFile, batFile]);

        if (!stdout && !stderr && err) {
          resolve({
            code: 1,
            result: "Permissão de administrador negada ou cancelada.",
            output: "",
          });
          return;
        }

        const output = `${stdout}${stderr}`.slice(0, MAX_OUTPUT_CHARS);
        resolve({
          code: err && !stdout ? 1 : 0,
          result:
            tailLine(output) ||
            (err ? "Falha ao executar com privilégios elevados." : "Comando concluído com êxito."),
          output,
        });
      },
    );
  });
}

/** Runs a single command elevated via UAC and streams output from temp log files. */
function runElevatedCommand(event, { command, runId }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const outFile = path.join(os.tmpdir(), `wincare-${id}.out.log`);
  const errFile = path.join(os.tmpdir(), `wincare-${id}.err.log`);
  const batFile = path.join(os.tmpdir(), `wincare-${id}.cmd`);
  const escaped = command.replace(/"/g, '""');
  const bat = `@echo off\r\n(${escaped}) 1>"${outFile}" 2>"${errFile}"\r\nexit /b %ERRORLEVEL%\r\n`;
  fs.writeFileSync(batFile, bat, "utf8");

  return new Promise((resolve) => {
    let lastOutLen = 0;
    let lastErrLen = 0;
    let pollTimer = null;
    let sentLines = 0;
    let truncated = false;

    const streamFile = (file, getLast, setLast) => {
      if (!fs.existsSync(file)) return;
      const content = fs.readFileSync(file, "utf8");
      const lastLen = getLast();
      if (content.length <= lastLen) return;
      const chunk = content.slice(lastLen);
      setLast(content.length);

      for (const line of chunk.split(/\r?\n/)) {
        if (!line) continue;
        if (sentLines >= MAX_STREAM_LINES) {
          if (!truncated && !event.sender.isDestroyed()) {
            truncated = true;
            event.sender.send("wincare:data", {
              runId,
              chunk: "[... saida truncada para manter a interface responsiva ...]\n",
            });
          }
          continue;
        }
        sentLines++;
        if (!event.sender.isDestroyed()) {
          event.sender.send("wincare:data", { runId, chunk: `${line}\n` });
        }
      }
    };

    const poll = () => {
      streamFile(
        outFile,
        () => lastOutLen,
        (n) => {
          lastOutLen = n;
        },
      );
      streamFile(
        errFile,
        () => lastErrLen,
        (n) => {
          lastErrLen = n;
        },
      );
    };

    const ps = `Start-Process -FilePath '${batFile.replace(/'/g, "''")}' -Verb RunAs -Wait -WindowStyle Hidden`;
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps.replace(/"/g, '\\"')}"`,
      (err) => {
        if (pollTimer) clearInterval(pollTimer);
        poll();

        const stdout = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8").trim() : "";
        const stderr = fs.existsSync(errFile) ? fs.readFileSync(errFile, "utf8").trim() : "";
        cleanupFiles([outFile, errFile, batFile]);

        if (!stdout && !stderr && err) {
          resolve({ code: 1, result: "Permissão de administrador negada ou cancelada." });
          return;
        }

        const tail = (stdout || stderr).split(/\r?\n/).filter(Boolean).pop() || "";
        resolve({
          code: err && !stdout ? 1 : 0,
          result:
            tail ||
            (err ? "Falha ao executar com privilégios elevados." : "Comando concluído com êxito."),
        });
      },
    );

    pollTimer = setInterval(poll, 400);
  });
}

/** Runs a command through cmd.exe and streams stdout/stderr back to the renderer. */
ipcMain.handle("wincare:run", async (event, { command, runId, elevated, timeoutMs }) => {
  try {
    if (elevated && process.platform === "win32") {
      return await runElevatedCommand(event, { command, runId });
    }

    const limitMs = commandTimeoutMs(command, timeoutMs);

    if (isBufferedCommand(command)) {
      return await runBufferedCommand(event, { command, runId, limitMs });
    }

    return await new Promise((resolve) => {
      const child = spawn(
        process.platform === "win32" ? "cmd.exe" : "sh",
        [process.platform === "win32" ? "/c" : "-c", command],
        SPAWN_OPTS,
      );

      let tail = "";
      let pending = "";
      let sentLines = 0;
      let truncated = false;
      let flushTimer = null;
      let settled = false;

      const finish = (code, result) => {
        if (settled) return;
        settled = true;
        if (flushTimer) clearTimeout(flushTimer);
        clearTimeout(killTimer);
        resolve({ code, result });
      };

      const killTimer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
        if (!event.sender.isDestroyed()) {
          event.sender.send("wincare:data", {
            runId,
            chunk: `[Tempo limite de ${Math.round(limitMs / 1000)}s atingido — comando encerrado.]\n`,
          });
        }
        finish(1, `Comando encerrado após ${Math.round(limitMs / 1000)} segundos.`);
      }, limitMs);

      const flush = () => {
        flushTimer = null;
        if (!pending || event.sender.isDestroyed()) return;

        const parts = pending.split(/\r?\n/);
        pending = parts.pop() ?? "";

        for (const line of parts) {
          if (!line) continue;
          if (sentLines >= MAX_STREAM_LINES) {
            if (!truncated) {
              truncated = true;
              event.sender.send("wincare:data", {
                runId,
                chunk: "[... saida truncada para manter a interface responsiva ...]\n",
              });
            }
            continue;
          }
          sentLines++;
          tail = line;
          event.sender.send("wincare:data", { runId, chunk: `${line}\n` });
        }
      };

      const scheduleFlush = () => {
        if (flushTimer) return;
        flushTimer = setTimeout(flush, 40);
      };

      const ingest = (chunk) => {
        pending += chunk.toString("utf8");
        scheduleFlush();
      };

      child.stdout.on("data", ingest);
      child.stderr.on("data", ingest);
      child.on("error", (err) => finish(1, err.message));
      child.on("close", (code) => {
        if (flushTimer) clearTimeout(flushTimer);
        if (pending.trim() && sentLines < MAX_STREAM_LINES) {
          tail = pending.trim();
          event.sender.send("wincare:data", { runId, chunk: `${pending.trim()}\n` });
        }
        finish(
          code ?? 0,
          code === 0
            ? tail.trim().split(/\r?\n/).filter(Boolean).pop() || "Comando concluído com êxito."
            : `O comando terminou com o código ${code}.`,
        );
      });
    });
  } catch (error) {
    return {
      code: 1,
      result: error instanceof Error ? error.message : "Falha ao executar o comando.",
    };
  }
});

ipcMain.handle("wincare:getLogPath", () => logger.getLogPaths());

ipcMain.handle("wincare:getAppVersion", () => updater.getAppVersion());

ipcMain.handle("wincare:checkForUpdate", async () => {
  try {
    return await updater.checkForUpdate();
  } catch (error) {
    logger.error("updater", "checkForUpdate", error instanceof Error ? error.message : error);
    return {
      ok: false,
      currentVersion: updater.getAppVersion(),
      latestVersion: "",
      updateAvailable: false,
      canAutoUpdate: false,
      packaged: updater.isReleaseBuild(),
      reason: "failed",
      message: error instanceof Error ? error.message : "Falha ao consultar o GitHub.",
    };
  }
});

ipcMain.handle("wincare:applyUpdate", async (event) => {
  const sendProgress = (payload) => {
    try {
      event.sender.send("wincare:updateProgress", payload);
    } catch {
      /* ignore */
    }
  };
  return updater.downloadAndApplyUpdate(sendProgress);
});

ipcMain.handle("wincare:openReleasePage", async () => {
  try {
    return await updater.openLatestReleasePage();
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Não foi possível abrir a página.",
    };
  }
});

/** Opens a native Windows console/app (devmgmt.msc, regedit, ms-settings:, ...). */
ipcMain.handle("wincare:open", async (_e, target) => {
  if (target.startsWith("ms-settings:")) {
    await shell.openExternal(target);
    return { code: 0, result: "Configurações abertas." };
  }
  exec(`start "" ${target}`, { shell: "cmd.exe" });
  return { code: 0, result: `${target} aberto.` };
});

ipcMain.handle("wincare:clearStorage", () => clearRendererStorage());

ipcMain.handle("wincare:isElevated", () => isWindowsAdmin());

ipcMain.handle("wincare:restartAsAdmin", async () => {
  if (process.platform !== "win32") return { ok: false, reason: "not-windows" };

  const already = await isWindowsAdmin();
  if (already) return { ok: true, reason: "already-elevated" };

  try {
    const projectRoot = path.resolve(path.join(__dirname, ".."));
    const brandedExe = path.join(projectRoot, ".electron-dev", "WinCare.exe");
    const realAsar = path.join(path.dirname(process.execPath), "resources", "app.asar");
    // .electron-dev copia o Electron com default_app.asar — app.isPackaged fica true
    // mesmo em desenvolvimento. Só o app.asar de release é pacote real.
    const isReleaseBuild = fs.existsSync(realAsar);
    const exe =
      !isReleaseBuild && fs.existsSync(brandedExe) ? brandedExe : process.execPath;
    const args = isReleaseBuild ? [] : [projectRoot];
    const cwd = isReleaseBuild ? path.dirname(process.execPath) : projectRoot;

    logger.log("admin", "Preparando elevação", {
      isPackaged: app.isPackaged,
      isReleaseBuild,
      exe,
      args,
    });

    await elevateProcess(exe, args, cwd, { delayMs: 1200 });
    setTimeout(() => app.quit(), 200);
    return { ok: true };
  } catch (error) {
    logger.error("admin", "Falha ao elevar", error instanceof Error ? error.message : error);
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Falha ao solicitar administrador.",
    };
  }
});

/**
 * Eleva um processo no Windows (seguro com espaços no path, ex.: LAB ITEGAM).
 * 1) Gera um .cmd com paths absolutos entre aspas
 * 2) Eleva esse .cmd via Shell.Application (VBS) — evita ArgumentList quebrado
 * 3) O .cmd espera um pouco para a instância atual liberar o single-instance lock
 */
function elevateProcess(exePath, args, workingDirectory, options = {}) {
  const delaySec = Math.max(2, Math.ceil((options.delayMs || 800) / 1000) + 1);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const batFile = path.join(os.tmpdir(), `wincare-elevate-${id}.cmd`);
  const vbsFile = path.join(os.tmpdir(), `wincare-elevate-${id}.vbs`);

  const quotedArgs = args.map((a) => `"${String(a).replace(/"/g, "")}"`).join(" ");
  const bat = [
    "@echo off",
    `ping -n ${delaySec} 127.0.0.1 >nul`,
    `cd /d "${workingDirectory}"`,
    `"${exePath}" ${quotedArgs}`.trim(),
    'del "%~f0" >nul 2>&1',
    "",
  ].join("\r\n");
  fs.writeFileSync(batFile, bat, "utf8");

  // ShellExecute runas — FileName é o .cmd; parâmetros vazios (paths já estão no .cmd).
  const vbs = [
    'Set sh = CreateObject("Shell.Application")',
    `sh.ShellExecute "${batFile.replace(/"/g, '""')}", "", "", "runas", 0`,
    "",
  ].join("\r\n");
  fs.writeFileSync(vbsFile, vbs, "utf8");

  logger.log("admin", "Elevando via UAC", { exe: exePath, args, batFile });

  return new Promise((resolve, reject) => {
    exec(`cscript //nologo "${vbsFile}"`, { windowsHide: true }, (err) => {
      try {
        fs.unlinkSync(vbsFile);
      } catch {
        /* ignore */
      }
      if (err) {
        try {
          fs.unlinkSync(batFile);
        } catch {
          /* ignore */
        }
        reject(err);
        return;
      }
      resolve();
    });
  });
}

const psJson = (script, timeoutMs = 20000) =>
  new Promise((resolve, reject) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`,
      { maxBuffer: 1024 * 1024 * 8, timeout: timeoutMs, windowsHide: true },
      (err, stdout) => (err ? reject(err) : resolve(JSON.parse(stdout || "null"))),
    );
  });

ipcMain.handle("wincare:systemInfo", async () => {
  const uptimeSec = os.uptime();
  const days = Math.floor(uptimeSec / 86400);
  const hours = String(Math.floor((uptimeSec % 86400) / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((uptimeSec % 3600) / 60)).padStart(2, "0");

  let extra = {};
  try {
    extra =
      (await psJson(
        "$os = Get-CimInstance Win32_OperatingSystem; " +
          "$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average; " +
          "$disk = Get-CimInstance Win32_LogicalDisk -Filter \\\"DeviceID='C:'\\\"; " +
          "$def = try { (Get-MpComputerStatus).RealTimeProtectionEnabled } catch { $null }; " +
          "$hf = try { (Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn.ToString('dd/MM/yyyy') } catch { 'Desconhecida' }; " +
          "@{ osName = $os.Caption; build = $os.BuildNumber; cpu = [int]$cpu; " +
          "diskFree = [double]$disk.FreeSpace; diskSize = [double]$disk.Size; defender = $def; lastUpdate = $hf } | ConvertTo-Json -Compress",
      )) || {};
  } catch {
    extra = {};
  }

  const totalMem = os.totalmem();
  const memoryUsage = Math.round(((totalMem - os.freemem()) / totalMem) * 100);
  const diskUsage = extra.diskSize
    ? Math.round(((extra.diskSize - extra.diskFree) / extra.diskSize) * 100)
    : 0;
  const cpuUsage = typeof extra.cpu === "number" ? extra.cpu : 0;
  const health = Math.max(
    0,
    Math.round(100 - cpuUsage * 0.2 - memoryUsage * 0.2 - Math.max(0, diskUsage - 70) * 1.2),
  );

  return {
    hostname: os.hostname(),
    osName: extra.osName || `${os.type()} ${os.release()}`,
    build: extra.build || os.release(),
    cpuUsage,
    memoryUsage,
    memoryTotalGb: Math.round(totalMem / 1024 ** 3),
    diskUsage,
    diskTotalGb: extra.diskSize ? Math.round(extra.diskSize / 1024 ** 3) : 0,
    uptime: `${days} dias, ${hours}:${minutes}`,
    defenderStatus:
      extra.defender === true
        ? "Ativo e atualizado"
        : extra.defender === false
          ? "Desativado"
          : "Desconhecido",
    lastUpdate: extra.lastUpdate || "Desconhecida",
    health,
    simulated: false,
  };
});

ipcMain.handle("wincare:disks", async () => {
  try {
    const rows = await psJson(
      "Get-CimInstance Win32_DiskDrive | ForEach-Object { @{ model = $_.Model; status = $_.Status; size = [double]$_.Size } } | ConvertTo-Json -Compress",
    );
    const volumes = await psJson(
      "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { @{ letter = $_.DeviceID; free = [double]$_.FreeSpace; size = [double]$_.Size } } | ConvertTo-Json -Compress",
    );
    const vols = Array.isArray(volumes) ? volumes : [volumes].filter(Boolean);
    const drives = Array.isArray(rows) ? rows : [rows].filter(Boolean);

    return vols.map((v, i) => ({
      letter: v.letter,
      model: drives[i]?.model ?? "Unidade",
      type: /ssd|nvme/i.test(drives[i]?.model ?? "") ? "SSD" : "HDD",
      smart: drives[i]?.status ?? "OK",
      freeGb: Math.round(v.free / 1024 ** 3),
      totalGb: Math.round(v.size / 1024 ** 3),
    }));
  } catch {
    return [];
  }
});
