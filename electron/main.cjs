const { app, BrowserWindow, ipcMain, shell, protocol, net, Menu, dialog } = require("electron");
const { spawn, exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const url = require("url");
const os = require("os");
const logger = require("./logger.cjs");
const updater = require("./updater.cjs");
const { enrichSystemInfo } = require("./system-metrics.cjs");

/** Espaço de uma unidade via Node (mais confiável que WMI no Electron). */
function readDriveSpace(rootPath) {
  try {
    const s = fs.statfsSync(rootPath);
    const total = Number(s.blocks) * Number(s.bsize);
    const free = Number(s.bfree) * Number(s.bsize);
    if (!Number.isFinite(total) || total <= 0) return null;
    return {
      totalBytes: total,
      freeBytes: free,
      usedPct: Math.round(((total - free) / total) * 100),
      freeGb: Math.round(free / 1024 ** 3),
      totalGb: Math.round(total / 1024 ** 3),
    };
  } catch {
    return null;
  }
}

function listFixedDriveLetters() {
  const letters = [];
  for (let i = 67; i <= 90; i++) {
    // C..Z
    const letter = String.fromCharCode(i);
    const root = `${letter}:\\`;
    try {
      if (fs.existsSync(root)) letters.push(letter);
    } catch {
      /* ignore */
    }
  }
  return letters;
}

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
              if (!info.ok) {
                logger.warn("updater", "Verificação sem release", info.message || info.reason);
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

function resolveAppIcon() {
  const ico = path.join(__dirname, "assets", "icon.ico");
  const png256 = path.join(__dirname, "assets", "icon-256.png");
  const png = path.join(__dirname, "assets", "icon.png");
  if (fs.existsSync(ico)) return ico;
  if (fs.existsSync(png256)) return png256;
  if (fs.existsSync(png)) return png;
  return undefined;
}

function createWindow() {
  const icon = resolveAppIcon() || (fs.existsSync(path.join(__dirname, "icon.ico"))
    ? path.join(__dirname, "icon.ico")
    : undefined);
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    backgroundColor: "#0d1117",
    title: APP_NAME,
    autoHideMenuBar: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (icon && process.platform === "win32") {
    try {
      mainWindow.setIcon(icon);
    } catch {
      /* ignore */
    }
  }

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
const LONG_REPAIR_TIMEOUT_MS = 30 * 60 * 1000;
const SPAWN_OPTS = { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] };

const commandTimeoutMs = (command, timeoutMs) => {
  if (typeof timeoutMs === "number" && timeoutMs > 0) return timeoutMs;
  if (/^tracert(\.exe)?\s/i.test(command)) return 90000;
  if (/^ping(\.exe)?\s/i.test(command)) return 15000;
  // SFC / DISM / CHKDSK — demoram muitos minutos; 60s padrão abortava no meio.
  if (/^(sfc|dism|chkdsk)(\.exe)?(\s|$)/i.test(command.trim())) return LONG_REPAIR_TIMEOUT_MS;
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
function runElevatedCommand(event, { command, runId, limitMs = LONG_REPAIR_TIMEOUT_MS }) {
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
    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      cleanupFiles([outFile, errFile, batFile]);
      resolve(payload);
    };

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
    const child = exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps.replace(/"/g, '\\"')}"`,
      { timeout: limitMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err) => {
        poll();

        const stdout = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8").trim() : "";
        const stderr = fs.existsSync(errFile) ? fs.readFileSync(errFile, "utf8").trim() : "";

        if (err && err.killed) {
          if (!event.sender.isDestroyed()) {
            event.sender.send("wincare:data", {
              runId,
              chunk: `[Tempo limite de ${Math.round(limitMs / 1000)}s atingido — comando encerrado.]\n`,
            });
          }
          finish({
            code: 1,
            result: `Comando encerrado após ${Math.round(limitMs / 1000)} segundos.`,
          });
          return;
        }

        if (!stdout && !stderr && err) {
          finish({ code: 1, result: "Permissão de administrador negada ou cancelada." });
          return;
        }

        const tail = (stdout || stderr).split(/\r?\n/).filter(Boolean).pop() || "";
        finish({
          code: err && !stdout ? 1 : 0,
          result:
            tail ||
            (err ? "Falha ao executar com privilégios elevados." : "Comando concluído com êxito."),
        });
      },
    );

    // Safety kill — Start-Process -Wait às vezes ignora o timeout do exec.
    const killTimer = setTimeout(() => {
      if (settled) return;
      try {
        if (child.pid && process.platform === "win32") {
          exec(`taskkill /PID ${child.pid} /T /F`, { windowsHide: true });
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        /* ignore */
      }
      if (!event.sender.isDestroyed()) {
        event.sender.send("wincare:data", {
          runId,
          chunk: `[Tempo limite de ${Math.round(limitMs / 1000)}s atingido — comando encerrado.]\n`,
        });
      }
      finish({
        code: 1,
        result: `Comando encerrado após ${Math.round(limitMs / 1000)} segundos.`,
      });
    }, limitMs + 1500);

    child.on("exit", () => clearTimeout(killTimer));
    pollTimer = setInterval(poll, 400);
  });
}

/** Runs a command through cmd.exe and streams stdout/stderr back to the renderer. */
ipcMain.handle("wincare:run", async (event, { command, runId, elevated, timeoutMs }) => {
  try {
    const limitMs = commandTimeoutMs(command, timeoutMs);

    if (elevated && process.platform === "win32") {
      return await runElevatedCommand(event, { command, runId, limitMs });
    }

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
      htmlUrl: `https://github.com/${updater.GITHUB_OWNER}/${updater.GITHUB_REPO}/releases`,
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

/** Scripts longos: evita escaping quebrado via arquivo .ps1 temporário. */
const psFileJson = (scriptBody, timeoutMs = 60000) =>
  new Promise((resolve, reject) => {
    const ps1 = path.join(os.tmpdir(), `wincare-ps-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
    fs.writeFileSync(ps1, scriptBody, "utf8");
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`,
      { maxBuffer: 1024 * 1024 * 16, timeout: timeoutMs, windowsHide: true },
      (err, stdout) => {
        try {
          fs.unlinkSync(ps1);
        } catch {
          /* ignore */
        }
        if (err && !stdout) {
          reject(err);
          return;
        }
        try {
          resolve(JSON.parse(String(stdout || "null").trim() || "null"));
        } catch (parseErr) {
          reject(parseErr);
        }
      },
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
          "$def = try { (Get-MpComputerStatus).RealTimeProtectionEnabled } catch { $null }; " +
          "$hf = try { (Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn.ToString('dd/MM/yyyy') } catch { 'Desconhecida' }; " +
          "@{ osName = $os.Caption; build = $os.BuildNumber; cpu = [int]$cpu; " +
          "defender = $def; lastUpdate = $hf } | ConvertTo-Json -Compress",
      )) || {};
  } catch {
    extra = {};
  }

  const totalMem = os.totalmem();
  const memoryUsage = Math.round(((totalMem - os.freemem()) / totalMem) * 100);
  const cDrive = readDriveSpace("C:\\");
  const diskUsage = cDrive?.usedPct ?? 0;
  const diskTotalGb = cDrive?.totalGb ?? 0;
  const cpuFromWmi = typeof extra.cpu === "number" ? extra.cpu : null;
  const cpuUsage = cpuFromWmi ?? 0;
  const health = Math.max(
    0,
    Math.round(100 - cpuUsage * 0.2 - memoryUsage * 0.2 - Math.max(0, diskUsage - 70) * 1.2),
  );

  const base = {
    hostname: os.hostname(),
    osName: extra.osName || `${os.type()} ${os.release()}`,
    build: extra.build || os.release(),
    cpuUsage,
    memoryUsage,
    memoryTotalGb: Math.round(totalMem / 1024 ** 3),
    diskUsage,
    diskTotalGb,
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

  try {
    return await enrichSystemInfo(base, { cpuFromWmi });
  } catch (error) {
    logger.warn("metrics", "Falha ao enriquecer métricas", error instanceof Error ? error.message : error);
    return base;
  }
});

ipcMain.handle("wincare:disks", async () => {
  const letters = listFixedDriveLetters();
  let driveMeta = [];
  try {
    const rows = await psJson(
      "Get-CimInstance Win32_DiskDrive | ForEach-Object { @{ model = $_.Model; status = $_.Status; size = [double]$_.Size } } | ConvertTo-Json -Compress",
    );
    driveMeta = Array.isArray(rows) ? rows : [rows].filter(Boolean);
  } catch {
    driveMeta = [];
  }

  return letters
    .map((letter, i) => {
      const space = readDriveSpace(`${letter}:\\`);
      if (!space || space.totalGb <= 0) return null;
      const meta = driveMeta[i] || driveMeta[0] || {};
      return {
        letter: `${letter}:`,
        model: meta.model || `Unidade ${letter}:`,
        type: /ssd|nvme/i.test(String(meta.model || "")) ? "SSD" : "HDD",
        smart: meta.status || "OK",
        freeGb: space.freeGb,
        totalGb: space.totalGb,
      };
    })
    .filter(Boolean);
});

/** Lista programas de inicialização (Run HKCU/HKLM + pasta Startup + desabilitados pelo WinCare). */
ipcMain.handle("wincare:listStartup", async () => {
  if (process.platform !== "win32") return [];
  try {
    const rows = await psFileJson(
      `
$ErrorActionPreference = 'SilentlyContinue'
$items = @()

function Add-RunKey($path, $location, $requiresAdmin) {
  if (-not (Test-Path $path)) { return }
  $props = Get-ItemProperty -Path $path
  foreach ($p in $props.PSObject.Properties) {
    if ($p.Name -match '^(PS|\\\\)') { continue }
    $items += [ordered]@{
      id = ($location + ':' + $p.Name)
      name = $p.Name
      command = [string]$p.Value
      location = $location
      enabled = $true
      requiresAdmin = [bool]$requiresAdmin
    }
  }
}

Add-RunKey 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' 'hkcu-run' $false
Add-RunKey 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' 'hklm-run' $true

$startup = [Environment]::GetFolderPath('Startup')
Get-ChildItem -LiteralPath $startup -Force | ForEach-Object {
  $enabled = -not $_.Name.ToLower().EndsWith('.disabled')
  $display = $_.Name
  if ($display.ToLower().EndsWith('.disabled')) { $display = $display.Substring(0, $display.Length - 9) }
  $display = [System.IO.Path]::GetFileNameWithoutExtension($display)
  $items += [ordered]@{
    id = ('startup-folder:' + $_.Name)
    name = $display
    command = $_.FullName
    location = 'startup-folder'
    enabled = $enabled
    requiresAdmin = $false
  }
}

$disabled = 'HKCU:\\Software\\WinCare\\DisabledStartup'
if (Test-Path $disabled) {
  $props = Get-ItemProperty -Path $disabled
  foreach ($p in $props.PSObject.Properties) {
    if ($p.Name -match '^(PS|\\\\)') { continue }
    $raw = [string]$p.Value
    $sep = $raw.IndexOf('||')
    $cmd = if ($sep -ge 0) { $raw.Substring($sep + 2) } else { $raw }
    $loc = if ($sep -ge 0) { $raw.Substring(0, $sep) } else { 'hkcu-run' }
    $items += [ordered]@{
      id = ($loc + ':' + $p.Name)
      name = $p.Name
      command = $cmd
      location = $loc
      enabled = $false
      requiresAdmin = ($loc -eq 'hklm-run')
    }
  }
}

,@($items) | ConvertTo-Json -Compress -Depth 4
`,
      45000,
    );
    const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
    return list;
  } catch (error) {
    logger.error("startup", "listStartup falhou", error instanceof Error ? error.message : error);
    return [];
  }
});

function getUserStartupDir() {
  return path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
  );
}

/** Resolve caminho do item da pasta Inicializar (nome do arquivo ou caminho absoluto legado). */
function resolveStartupFolderPath(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (/^[A-Za-z]:[\\/]/.test(value) || value.includes("/") || value.includes("\\")) {
    return value;
  }
  return path.join(getUserStartupDir(), value);
}

function regQueryValue(key, name) {
  return new Promise((resolve) => {
    exec(
      `reg query "${key}" /v "${name.replace(/"/g, "")}"`,
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const lines = String(stdout || "")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        for (const line of lines) {
          const m = line.match(/^(\S+)\s+REG_\w+\s+(.*)$/i);
          if (m && m[1].toLowerCase() === name.toLowerCase()) {
            resolve(m[2]);
            return;
          }
        }
        resolve(null);
      },
    );
  });
}

function regSetValue(key, name, value) {
  return new Promise((resolve, reject) => {
    const safeName = String(name).replace(/"/g, "");
    const safeValue = String(value).replace(/"/g, '\\"');
    exec(
      `reg add "${key}" /v "${safeName}" /t REG_SZ /d "${safeValue}" /f`,
      { windowsHide: true, timeout: 8000 },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

function regDeleteValue(key, name) {
  return new Promise((resolve) => {
    const safeName = String(name).replace(/"/g, "");
    exec(`reg delete "${key}" /v "${safeName}" /f`, { windowsHide: true, timeout: 8000 }, () =>
      resolve(),
    );
  });
}

function ensureRegKey(key) {
  return new Promise((resolve) => {
    exec(`reg add "${key}" /f`, { windowsHide: true, timeout: 8000 }, () => resolve());
  });
}

/** Ativa/desativa item de inicialização (HKCU e pasta Startup) em Node — sem PowerShell. */
ipcMain.handle("wincare:setStartupEnabled", async (_e, { id, enabled }) => {
  if (process.platform !== "win32") return { ok: false, reason: "not-windows" };
  try {
    const safeId = String(id || "");
    const wantEnabled = !!enabled;

    if (safeId.startsWith("startup-folder:")) {
      const raw = safeId.slice("startup-folder:".length);
      const target = resolveStartupFolderPath(raw);
      if (!target) return { ok: false, reason: "Caminho de inicializacao invalido." };

      const asDisabled = target.toLowerCase().endsWith(".disabled")
        ? target
        : `${target}.disabled`;
      const asEnabled = target.toLowerCase().endsWith(".disabled")
        ? target.slice(0, -".disabled".length)
        : target;

      if (wantEnabled) {
        const src = fs.existsSync(asDisabled)
          ? asDisabled
          : fs.existsSync(target) && target.toLowerCase().endsWith(".disabled")
            ? target
            : null;
        if (!src) {
          if (fs.existsSync(asEnabled)) return { ok: true };
          return { ok: false, reason: "Arquivo de inicializacao nao encontrado." };
        }
        fs.renameSync(src, asEnabled);
        return { ok: true };
      }

      const src = fs.existsSync(asEnabled)
        ? asEnabled
        : fs.existsSync(target) && !target.toLowerCase().endsWith(".disabled")
          ? target
          : null;
      if (!src) {
        if (fs.existsSync(asDisabled)) return { ok: true };
        return { ok: false, reason: "Arquivo de inicializacao nao encontrado." };
      }
      fs.renameSync(src, `${src}.disabled`);
      return { ok: true };
    }

    if (safeId.startsWith("hklm-run:")) {
      return {
        ok: false,
        reason: "Itens do sistema (HKLM) exigem administrador. Use Executar como admin.",
      };
    }

    if (!safeId.startsWith("hkcu-run:")) {
      return { ok: false, reason: "Tipo de item nao suportado." };
    }

    const name = safeId.slice("hkcu-run:".length);
    if (!name || /[\\/]/.test(name)) {
      return { ok: false, reason: "Nome de item invalido." };
    }

    const runKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    const disabledKey = "HKCU\\Software\\WinCare\\DisabledStartup";
    await ensureRegKey("HKCU\\Software\\WinCare");
    await ensureRegKey(disabledKey);

    if (wantEnabled) {
      const saved = await regQueryValue(disabledKey, name);
      if (!saved) {
        return { ok: false, reason: "Nao ha valor salvo para reativar este item." };
      }
      const cmd = saved.includes("||") ? saved.split("||").slice(1).join("||") : saved;
      await regSetValue(runKey, name, cmd);
      await regDeleteValue(disabledKey, name);
      return { ok: true };
    }

    const current = await regQueryValue(runKey, name);
    if (!current) {
      return { ok: false, reason: "Item ja nao esta na inicializacao do usuario." };
    }
    await regSetValue(disabledKey, name, `hkcu-run||${current}`);
    await regDeleteValue(runKey, name);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Falha ao alterar inicializacao.",
    };
  }
});

/** Processos com maior uso de CPU/memoria (amostra). */
ipcMain.handle("wincare:topProcesses", async () => {
  if (process.platform !== "win32") return [];
  try {
    const rows = await psJson(
      "Get-Process | Where-Object { $_.Name -ne 'Idle' -and $_.Name -ne 'System' } | Sort-Object -Property WorkingSet64 -Descending | Select-Object -First 10 @{N='name';E={$_.ProcessName}}, @{N='pid';E={$_.Id}}, @{N='cpu';E={[math]::Round(([double]($_.CPU)),1)}}, @{N='memMb';E={[math]::Round($_.WorkingSet64/1MB,0)}} | ConvertTo-Json -Compress",
    );
    const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
    return list.map((p) => ({
      name: String(p.name || "?"),
      pid: Number(p.pid) || 0,
      cpu: typeof p.cpu === "number" ? p.cpu : 0,
      memMb: typeof p.memMb === "number" ? p.memMb : 0,
    }));
  } catch {
    return [];
  }
});

/** Mede pastas que costumam ocupam espaço (C:) — timeouts curtos por pasta. */
ipcMain.handle("wincare:diskUsage", async () => {
  if (process.platform !== "win32") return [];
  try {
    const rows = await psFileJson(
      `
$ErrorActionPreference = 'SilentlyContinue'

function Get-DirSize([string]$path) {
  if (-not $path) { return 0 }
  if (-not (Test-Path -LiteralPath $path)) { return 0 }
  $sum = 0L
  try {
    Get-ChildItem -LiteralPath $path -Force -Recurse -File -ErrorAction SilentlyContinue |
      ForEach-Object { $sum += $_.Length }
  } catch {}
  return [double]$sum
}

$targets = @(
  @{ id = 'temp-user'; label = 'Temporários do usuário'; path = $env:TEMP; clearable = $true; hint = '%TEMP%' },
  @{ id = 'temp-win'; label = 'Temp do Windows'; path = (Join-Path $env:WINDIR 'Temp'); clearable = $true; hint = 'C:\\Windows\\Temp' },
  @{ id = 'downloads'; label = 'Downloads'; path = (Join-Path $env:USERPROFILE 'Downloads'); clearable = $false; hint = 'Revise manualmente antes de apagar' },
  @{ id = 'recycle'; label = 'Lixeira'; path = 'RecycleBin'; clearable = $true; hint = 'Itens na Lixeira' },
  @{ id = 'inet-cache'; label = 'Cache do Internet Explorer/Edge legado'; path = (Join-Path $env:LOCALAPPDATA 'Microsoft\\Windows\\INetCache'); clearable = $true },
  @{ id = 'thumb-cache'; label = 'Cache de miniaturas'; path = (Join-Path $env:LOCALAPPDATA 'Microsoft\\Windows\\Explorer'); clearable = $false; hint = 'Use Limpar cache do Windows na aba Limpeza' },
  @{ id = 'wu-download'; label = 'Download do Windows Update'; path = (Join-Path $env:WINDIR 'SoftwareDistribution\\Download'); clearable = $false; hint = 'Use Limpar cache do Windows Update' }
)

$result = @()
foreach ($t in $targets) {
  $size = 0
  if ($t.id -eq 'recycle') {
    try {
      $shell = New-Object -ComObject Shell.Application
      $ns = $shell.NameSpace(0xA)
      if ($ns) { foreach ($i in $ns.Items()) { $size += [double]$i.Size } }
    } catch { $size = 0 }
  } else {
    $size = Get-DirSize $t.path
  }
  $result += [ordered]@{
    id = $t.id
    label = $t.label
    path = $t.path
    sizeBytes = [double]$size
    clearable = [bool]$t.clearable
    hint = $t.hint
  }
}

,@($result) | ConvertTo-Json -Compress -Depth 4
`,
      120000,
    );
    const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
    return list;
  } catch (error) {
    logger.error("disk", "diskUsage falhou", error instanceof Error ? error.message : error);
    return [];
  }
});

const CLEARABLE_FOLDERS = new Set(["temp-user", "temp-win", "recycle", "inet-cache"]);

ipcMain.handle("wincare:clearDiskFolder", async (_e, { id }) => {
  if (process.platform !== "win32") return { ok: false, reason: "not-windows" };
  const folderId = String(id || "");
  if (!CLEARABLE_FOLDERS.has(folderId)) {
    return { ok: false, reason: "Esta pasta não pode ser limpa automaticamente." };
  }
  try {
    const result = await psFileJson(
      `
$ErrorActionPreference = 'SilentlyContinue'
$id = ${JSON.stringify(folderId)}
$freed = 0

function Clear-Dir([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return 0 }
  $before = 0L
  Get-ChildItem -LiteralPath $path -Force -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { $before += $_.Length }
  Get-ChildItem -LiteralPath $path -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  return [double]$before
}

switch ($id) {
  'temp-user' { $freed = Clear-Dir $env:TEMP }
  'temp-win' { $freed = Clear-Dir (Join-Path $env:WINDIR 'Temp') }
  'inet-cache' { $freed = Clear-Dir (Join-Path $env:LOCALAPPDATA 'Microsoft\\Windows\\INetCache') }
  'recycle' {
    try { Clear-RecycleBin -Force -ErrorAction Stop; $freed = 1 } catch { $freed = 0 }
  }
}

@{ ok = $true; freedBytes = [double]$freed } | ConvertTo-Json -Compress
`,
      90000,
    );
    if (result && typeof result === "object") return result;
    return { ok: true, freedBytes: 0 };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Falha ao limpar pasta.",
    };
  }
});

ipcMain.handle("wincare:saveTextFile", async (_e, { content, defaultName }) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const result = await dialog.showSaveDialog(win || undefined, {
    title: "Salvar relatório WinCare",
    defaultPath: defaultName || `WinCare-relatorio-${new Date().toISOString().slice(0, 10)}.txt`,
    filters: [
      { name: "Texto", extensions: ["txt"] },
      { name: "Todos", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePath) return { ok: false, reason: "cancelled" };
  try {
    fs.writeFileSync(result.filePath, String(content ?? ""), "utf8");
    return { ok: true, path: result.filePath };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Falha ao salvar arquivo.",
    };
  }
});
