const { app, BrowserWindow, ipcMain, shell, protocol, net } = require("electron");
const { spawn, exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const url = require("url");
const os = require("os");

let mainWindow = null;

const DIST = path.join(__dirname, "..", "dist");

// ES modules can't be loaded over file:// (blocked by CORS), so the built SPA
// is served through a custom app:// protocol instead.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    backgroundColor: "#0d1117",
    title: "WinCare",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL("app://wincare/index.html");
}

app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url);
    const filePath = path.join(DIST, decodeURIComponent(pathname));
    const safePath = filePath.startsWith(DIST) ? filePath : path.join(DIST, "index.html");
    return net.fetch(url.pathToFileURL(safePath).toString());
  });
  createWindow();
});
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());


const MAX_STREAM_LINES = 300;

const isWindowsAdmin = () =>
  new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve(false);
      return;
    }
    exec(
      'powershell -NoProfile -Command "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"',
      (err, stdout) => resolve(!err && stdout.trim().toLowerCase() === "true"),
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
      streamFile(outFile, () => lastOutLen, (n) => {
        lastOutLen = n;
      });
      streamFile(errFile, () => lastErrLen, (n) => {
        lastErrLen = n;
      });
    };

    const ps = `Start-Process -FilePath '${batFile.replace(/'/g, "''")}' -Verb RunAs -Wait -WindowStyle Hidden`;
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps.replace(/"/g, '\\"')}"`, (err) => {
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
        result: tail || (err ? "Falha ao executar com privilégios elevados." : "Comando concluído com êxito."),
      });
    });

    pollTimer = setInterval(poll, 400);
  });
}

/** Runs a command through cmd.exe and streams stdout/stderr back to the renderer. */
ipcMain.handle("wincare:run", async (event, { command, runId, elevated }) => {
  if (elevated && process.platform === "win32") {
    return runElevatedCommand(event, { command, runId });
  }

  return new Promise((resolve) => {
    const child = spawn(process.platform === "win32" ? "cmd.exe" : "sh", [
      process.platform === "win32" ? "/c" : "-c",
      command,
    ]);

    let tail = "";
    let pending = "";
    let sentLines = 0;
    let truncated = false;
    let flushTimer = null;

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
    child.on("error", (err) => resolve({ code: 1, result: err.message }));
    child.on("close", (code) => {
      if (flushTimer) clearTimeout(flushTimer);
      if (pending.trim() && sentLines < MAX_STREAM_LINES) {
        tail = pending.trim();
        event.sender.send("wincare:data", { runId, chunk: `${pending.trim()}\n` });
      }
      resolve({
        code: code ?? 0,
        result:
          code === 0
            ? tail.trim().split(/\r?\n/).filter(Boolean).pop() || "Comando concluído com êxito."
            : `O comando terminou com o código ${code}.`,
      });
    });
  });
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

ipcMain.handle("wincare:isElevated", () => isWindowsAdmin());

ipcMain.handle("wincare:restartAsAdmin", async () => {
  if (process.platform !== "win32") return { ok: false, reason: "not-windows" };

  const already = await isWindowsAdmin();
  if (already) return { ok: true, reason: "already-elevated" };

  const exe = process.execPath.replace(/'/g, "''");
  let ps;
  if (app.isPackaged) {
    ps = `Start-Process -FilePath '${exe}' -Verb RunAs`;
  } else {
    const cwd = process.cwd().replace(/'/g, "''");
    ps = `Start-Process -FilePath '${exe}' -ArgumentList '.','--wincare-admin' -WorkingDirectory '${cwd}' -Verb RunAs`;
  }

  return new Promise((resolve) => {
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, (err) => {
      if (err) {
        resolve({ ok: false, reason: err.message });
        return;
      }
      resolve({ ok: true });
      setTimeout(() => app.quit(), 400);
    });
  });
});

const psJson = (script) =>
  new Promise((resolve, reject) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`,
      { maxBuffer: 1024 * 1024 * 8 },
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
      extra.defender === true ? "Ativo e atualizado" : extra.defender === false ? "Desativado" : "Desconhecido",
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
