/*
 * Segundo plano: ícone na bandeja, "manter na bandeja ao fechar", "abrir com o
 * Windows minimizado" e o monitor leve que avisa sobre problemas importantes.
 *
 * As regras (limites, quando avisar, menu) estão em alerts.cjs; aqui ficam a
 * leitura do sistema, as notificações do Windows, a bandeja e o IPC.
 *
 * Leve de propósito: roda no processo principal (sem janela), um timer por
 * minuto decide o que está na hora de verificar; disco a cada 5 min (statfs,
 * sem processo externo), temperatura a cada 3 min (aproveita a leitura do
 * Dashboard quando a janela está aberta), Defender a cada 30 min e Windows
 * Update a cada 6 h (PowerShell).
 */
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const { app, ipcMain, Menu, nativeImage, Notification, Tray } = require("electron");

const logger = require("./logger.cjs");
const alerts = require("./alerts.cjs");
const { psFileJson } = require("./powershell.cjs");
const { collectCpuTempC, collectGpuMetrics } = require("./system-metrics.cjs");
const { listProcesses } = require("./system-tools.cjs");
const history = require("./maintenance-history.cjs");
const { describeDigest, isDigestDue, weeklyDigest } = require("./weekly-report.cjs");
const { resolveSelfLaunch } = require("./scheduler.cjs");

/** Argumento da entrada "Abrir com o Windows": começa só na bandeja. */
const HIDDEN_ARG = "--hidden";
const LOGIN_ITEM_NAME = "WinCare";
const TICK_MS = 60_000;
const FIRST_CHECK_MS = 20_000;
const FIRST_CHECK_HIDDEN_MS = 60_000;
const RECENT_INFO_MS = 2 * 60_000;

/** Rotas que a bandeja/notificação podem abrir (nada vindo de fora). */
const ROUTES = new Set([
  "/",
  "/limpeza",
  "/historico",
  "/configuracoes",
  "/monitoramento",
  "/disco",
  "/programas",
  "/sistema",
  "/redes",
  "/inteligencia",
]);

const DEFAULT_SETTINGS = {
  closeToTray: false,
  monitor: {
    enabled: true,
    types: {
      disk: true,
      temperature: true,
      defender: true,
      windowsUpdate: true,
      diskGrowth: true,
      newProgram: true,
      windowsUpdateBusy: true,
    },
  },
  snoozeUntil: 0,
  trayHintShown: false,
  lastNotificationAt: 0,
  /** Verificação de versão nova com o app aberto (espelha "Verificar atualizações ao abrir"). */
  updates: { enabled: true, notifiedVersion: "" },
  /** Resumo semanal de saúde por notificação (segunda de manhã). */
  weeklyReport: { enabled: true, lastSentAt: 0 },
  /** Estado de cada alerta — persiste para não repetir aviso a cada reinício. */
  alerts: {},
};

let deps = null;
let settings = structuredClone(DEFAULT_SETTINGS);
let tray = null;
let timer = null;
let firstTimer = null;
let checking = null;
let startedAt = Date.now();
const lastRun = {};
const readings = {};
let lastCheckAt = 0;
let pendingCommand = null;
/** Notificações vivas: sem referência o clique pode se perder no Windows. */
const liveNotifications = new Set();

const settingsFile = () => path.join(app.getPath("userData"), "background.json");

function sanitize(raw) {
  const out = structuredClone(DEFAULT_SETTINGS);
  if (!raw || typeof raw !== "object") return out;
  out.closeToTray = raw.closeToTray === true;
  if (raw.monitor && typeof raw.monitor === "object") {
    out.monitor.enabled = raw.monitor.enabled !== false;
    for (const type of alerts.ALERT_TYPES) {
      out.monitor.types[type] = raw.monitor.types?.[type] !== false;
    }
  }
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  out.snoozeUntil = num(raw.snoozeUntil);
  out.lastNotificationAt = num(raw.lastNotificationAt);
  out.trayHintShown = raw.trayHintShown === true;
  if (raw.weeklyReport && typeof raw.weeklyReport === "object") {
    out.weeklyReport.enabled = raw.weeklyReport.enabled !== false;
    out.weeklyReport.lastSentAt = num(raw.weeklyReport.lastSentAt);
  }
  if (raw.updates && typeof raw.updates === "object") {
    out.updates.enabled = raw.updates.enabled !== false;
    out.updates.notifiedVersion =
      typeof raw.updates.notifiedVersion === "string"
        ? raw.updates.notifiedVersion.slice(0, 40)
        : "";
  }
  if (raw.alerts && typeof raw.alerts === "object") {
    for (const type of alerts.ALERT_TYPES) {
      const a = raw.alerts[type];
      if (!a || typeof a !== "object") continue;
      out.alerts[type] = {
        active: a.active === true,
        since: num(a.since),
        lastNotifiedAt: num(a.lastNotifiedAt),
        episodeNotified: a.episodeNotified === true,
        streak: Math.max(0, Math.round(num(a.streak))),
        detail: a.detail && typeof a.detail === "object" ? a.detail : {},
      };
    }
  }
  return out;
}

function loadSettings() {
  try {
    settings = sanitize(JSON.parse(fs.readFileSync(settingsFile(), "utf8")));
  } catch {
    settings = structuredClone(DEFAULT_SETTINGS);
  }
}

function saveSettings() {
  try {
    const file = settingsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), "utf8");
    try {
      fs.renameSync(tmp, file);
    } catch {
      fs.writeFileSync(file, JSON.stringify(settings, null, 2), "utf8");
    }
  } catch (error) {
    logger.warn("background", "Falha ao salvar", error instanceof Error ? error.message : error);
  }
}

const enabledTypes = () =>
  settings.monitor.enabled ? alerts.ALERT_TYPES.filter((t) => settings.monitor.types[t]) : [];

/* ------------------------------ Notificações ------------------------------ */

/**
 * App portátil (ZIP, sem atalho no Menu Iniciar): o Windows só mostra a
 * notificação de um AppUserModelID registrado. Registra nome e ícone em
 * HKCU\Software\Classes\AppUserModelId (idempotente, sem administrador).
 */
function ensureNotificationIdentity() {
  if (process.platform !== "win32" || !deps.appId) return;
  const key = `HKCU\\Software\\Classes\\AppUserModelId\\${deps.appId}`;
  const values = [["DisplayName", "WinCare"]];
  if (deps.badgeSourcePath) values.push(["IconUri", deps.badgeSourcePath]);
  for (const [name, data] of values) {
    execFile(
      "reg.exe",
      ["add", key, "/v", name, "/t", "REG_SZ", "/d", data, "/f"],
      { windowsHide: true, timeout: 10000 },
      (err) => {
        if (err) logger.warn("background", `Registro de notificação (${name})`, err.message);
      },
    );
  }
}

/* ------------------------------ Abrir com o Windows ------------------------------ */

function loginLaunch() {
  const launch = resolveSelfLaunch();
  return { path: launch.exe, args: [...launch.args, HIDDEN_ARG], name: LOGIN_ITEM_NAME };
}

function loginItemState() {
  if (process.platform !== "win32") return { supported: false, enabled: false };
  try {
    const { path: exe, args } = loginLaunch();
    const info = app.getLoginItemSettings({ path: exe, args });
    return {
      supported: true,
      enabled: !!info.openAtLogin,
      // Desativado em Configurações → Aplicativos → Inicialização (ou Gerenciador de Tarefas).
      blockedByWindows: !!info.openAtLogin && info.executableWillLaunchAtLogin === false,
    };
  } catch (error) {
    logger.warn(
      "background",
      "getLoginItemSettings",
      error instanceof Error ? error.message : error,
    );
    return { supported: true, enabled: false };
  }
}

function setOpenAtLogin(enabled) {
  if (process.platform !== "win32") return;
  const launch = loginLaunch();
  app.setLoginItemSettings({ openAtLogin: !!enabled, ...launch });
  logger.log("background", "Abrir com o Windows", { enabled: !!enabled, path: launch.path });
}

/* ------------------------------ Leituras ------------------------------ */

function readSystemDrive() {
  const drive = process.platform === "win32" ? process.env.SystemDrive || "C:" : "/";
  const root = process.platform === "win32" ? `${drive}\\` : drive;
  const s = fs.statfsSync(root);
  return {
    drive: process.platform === "win32" ? drive.toUpperCase() : drive,
    totalBytes: Number(s.blocks) * Number(s.bsize),
    freeBytes: Number(s.bavail ?? s.bfree) * Number(s.bsize),
  };
}

async function readTemperature() {
  // Janela aberta: o Dashboard já lê a cada poucos segundos; não roda outro processo.
  const recent = deps.getRecentSystemInfo?.();
  if (recent && Date.now() - recent.at < RECENT_INFO_MS) {
    return { cpu: recent.info.cpuTemperature ?? null, gpu: recent.info.gpuTemperature ?? null };
  }
  const [cpu, gpu] = await Promise.all([collectCpuTempC(), collectGpuMetrics()]);
  return { cpu: cpu ?? null, gpu: gpu?.temperature ?? null };
}

const DEFENDER_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$rt = $null
try { $rt = [bool](Get-MpComputerStatus -ErrorAction Stop).RealTimeProtectionEnabled } catch {}
$others = @()
try {
  Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction Stop | ForEach-Object {
    $on = (($_.productState -band 0x1000) -ne 0)
    if ($on -and ([string]$_.displayName) -notmatch 'Defender') { $others += [string]$_.displayName }
  }
} catch {}
@{ realtime = $rt; otherAntivirus = @($others) } | ConvertTo-Json -Compress
`;

async function readDefender() {
  if (process.platform !== "win32") return null;
  const out = await psFileJson(DEFENDER_SCRIPT, 30000);
  if (!out || typeof out !== "object") return null;
  const others = Array.isArray(out.otherAntivirus)
    ? out.otherAntivirus
    : out.otherAntivirus
      ? [out.otherAntivirus]
      : [];
  return {
    realtime: typeof out.realtime === "boolean" ? out.realtime : null,
    otherAntivirus: others.map(String),
  };
}

const UPDATE_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$d = $null
try {
  $h = Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1
  if ($h) { $d = $h.InstalledOn.ToString('o') }
} catch {}
@{ lastInstalled = $d } | ConvertTo-Json -Compress
`;

async function readWindowsUpdate() {
  if (process.platform !== "win32") return null;
  const out = await psFileJson(UPDATE_SCRIPT, 60000);
  return out && typeof out.lastInstalled === "string" ? { lastInstalled: out.lastInstalled } : null;
}

/** Uso de cada unidade fixa (statfs, sem processo externo). */
function readDriveUsage() {
  const drives = [];
  for (let code = 67; code <= 90; code++) {
    const drive = `${String.fromCharCode(code)}:`;
    try {
      if (!fs.existsSync(`${drive}\\`)) continue;
      const s = fs.statfsSync(`${drive}\\`);
      const total = Number(s.blocks) * Number(s.bsize);
      if (!(total > 0)) continue;
      drives.push({ drive, usedBytes: total - Number(s.bavail ?? s.bfree) * Number(s.bsize) });
    } catch {
      /* unidade sem mídia */
    }
  }
  return { drives };
}

const PROGRAMS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$roots = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
)
$out = foreach ($r in $roots) {
  Get-ChildItem -LiteralPath $r | ForEach-Object {
    $p = Get-ItemProperty -LiteralPath $_.PSPath
    if ($p.DisplayName -and -not $p.SystemComponent -and -not $p.ParentKeyName) {
      @{ key = [string]$_.Name; name = [string]$p.DisplayName }
    }
  }
}
ConvertTo-Json -Compress -InputObject @($out)
`;

async function readPrograms() {
  if (process.platform !== "win32") return null;
  const rows = await psFileJson(PROGRAMS_SCRIPT, 60000);
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const programs = list.filter((p) => p && p.key && p.name);
  return programs.length ? { programs } : null;
}

const WINDOWS_UPDATE_PROCESSES = new Set(["tiworker", "trustedinstaller", "mousocoreworker"]);

/** CPU do Windows Update desde a leitura anterior (a 1ª leitura só prepara a base). */
async function readWindowsUpdateBusy() {
  if (process.platform !== "win32") return null;
  const list = await listProcesses({ limit: 80 });
  const wu = list.filter((p) => WINDOWS_UPDATE_PROCESSES.has(String(p.name).toLowerCase()));
  if (!wu.length) return { cpuPct: 0, name: null };
  if (wu.every((p) => p.cpuPct === null)) return null;
  const top = [...wu].sort((a, b) => (b.cpuPct ?? 0) - (a.cpuPct ?? 0))[0];
  return { cpuPct: wu.reduce((n, p) => n + (p.cpuPct ?? 0), 0), name: top.name };
}

const READERS = {
  windowsUpdateBusy: readWindowsUpdateBusy,
  disk: async () => readSystemDrive(),
  diskGrowth: async () => readDriveUsage(),
  newProgram: readPrograms,
  temperature: readTemperature,
  defender: readDefender,
  windowsUpdate: readWindowsUpdate,
};

function evaluate(type, reading, prev, now) {
  switch (type) {
    case "disk":
      return alerts.evaluateDisk(reading, !!prev.active);
    case "temperature":
      return alerts.evaluateTemperature(reading, prev);
    case "defender":
      return alerts.evaluateDefender(reading);
    case "windowsUpdate":
      return alerts.evaluateWindowsUpdate(reading, now);
    case "diskGrowth":
      return alerts.evaluateDiskGrowth(reading, prev, now);
    case "newProgram":
      return alerts.evaluateNewProgram(reading, prev, now);
    case "windowsUpdateBusy":
      return alerts.evaluateWindowsUpdateBusy(reading, prev);
    default:
      return null;
  }
}

/** Texto curto do que foi lido (tela de Configurações: "o que está sendo vigiado"). */
function summarize(type, reading, result) {
  if (!reading) return "Não foi possível ler agora";
  const gb = (b) =>
    `${(Math.round((b / 1024 ** 3) * 10) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;
  switch (type) {
    case "disk":
      return `${reading.drive}: ${gb(reading.freeBytes)} livres (${Math.round(result?.detail.usedPct ?? 0)}% usado)`;
    case "temperature": {
      const parts = [];
      if (typeof reading.cpu === "number") parts.push(`CPU ${reading.cpu} °C`);
      if (typeof reading.gpu === "number") parts.push(`GPU ${reading.gpu} °C`);
      return parts.length ? parts.join(" · ") : "Sem sensor de temperatura disponível";
    }
    case "defender":
      if (reading.realtime === true) return "Proteção em tempo real ligada";
      if (reading.realtime === false && reading.otherAntivirus.length) {
        return `Defender desligado; protegido por ${reading.otherAntivirus.join(", ")}`;
      }
      if (reading.realtime === false) return "Proteção em tempo real desligada";
      return "Não foi possível ler o Defender";
    case "windowsUpdate":
      return result
        ? `Última atualização há ${result.detail.days} ${result.detail.days === 1 ? "dia" : "dias"}`
        : "Não foi possível ler o Windows Update";
    case "diskGrowth":
      return `${reading.drives.length} ${reading.drives.length === 1 ? "unidade vigiada" : "unidades vigiadas"} (aviso com +1 GB em 30 min)`;
    case "newProgram":
      return `${reading.programs.length.toLocaleString("pt-BR")} programas conhecidos`;
    case "windowsUpdateBusy":
      return reading.name
        ? `${reading.name}: ${Math.round(reading.cpuPct)}% do processador agora`
        : "Windows Update parado";
    default:
      return "";
  }
}

/* ------------------------------ Verificação ------------------------------ */

function applyResult(type, result, now) {
  settings.alerts[type] = alerts.nextAlertState(settings.alerts[type], result, now);
}

function activeAlerts() {
  const types = enabledTypes();
  return alerts.ALERT_TYPES.filter((t) => types.includes(t) && settings.alerts[t]?.active).map(
    (type) => {
      const a = settings.alerts[type];
      return {
        type,
        since: a.since,
        route: alerts.ALERT_ROUTE[type],
        ...alerts.describeAlert(type, a.detail),
      };
    },
  );
}

function windowInFocus() {
  const win = deps.getWindow();
  return !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused();
}

function showNotification({ title, body, route, onClick }) {
  if (!Notification.isSupported()) return false;
  const notification = new Notification({ title, body, icon: deps.iconPath || undefined });
  liveNotifications.add(notification);
  const release = () => liveNotifications.delete(notification);
  notification.on("click", () => {
    release();
    if (onClick) onClick();
    else deps.openApp({ to: route });
  });
  notification.on("close", release);
  notification.show();
  return true;
}

function notifyDue(now) {
  const { due } = alerts.dueNotifications(settings.alerts, {
    now,
    enabledTypes: enabledTypes(),
    snoozeUntil: settings.snoozeUntil,
    startedAt,
    graceMs: deps.launchedHidden ? alerts.LOGIN_GRACE_MS : alerts.STARTUP_GRACE_MS,
    lastNotificationAt: settings.lastNotificationAt,
  });
  if (!due.length) return;
  for (const type of due) {
    settings.alerts[type].lastNotifiedAt = now;
    settings.alerts[type].episodeNotified = true;
  }
  // Com a janela em foco o painel de recomendações já mostra: não interrompe.
  if (windowInFocus()) {
    logger.log("alerts", "Alerta visto no app (janela em foco)", { due });
    return;
  }
  const details = Object.fromEntries(due.map((t) => [t, settings.alerts[t].detail]));
  const message = alerts.composeNotification(due, details);
  if (showNotification(message)) {
    settings.lastNotificationAt = now;
    logger.log("alerts", "Notificação", { due, title: message.title });
  }
}

/** Roda as verificações que estão na hora (ou todas, com `force`). */
function runChecks({ force = false } = {}) {
  if (checking) return checking;
  checking = (async () => {
    const now = Date.now();
    const before = JSON.stringify(settings.alerts);
    for (const type of enabledTypes()) {
      if (!force && lastRun[type] && now - lastRun[type] < alerts.CHECK_EVERY_MS[type]) continue;
      lastRun[type] = now;
      let reading = null;
      try {
        reading = await READERS[type]();
      } catch (error) {
        logger.warn(
          "alerts",
          `Leitura ${type} falhou`,
          error instanceof Error ? error.message : error,
        );
      }
      const prev = settings.alerts[type] || {};
      const result = evaluate(type, reading, prev, now);
      applyResult(type, result, now);
      readings[type] = { at: now, summary: summarize(type, reading, result), ok: !!result };
    }
    lastCheckAt = now;
    notifyDue(Date.now());
    if (JSON.stringify(settings.alerts) !== before || settings.lastNotificationAt === now) {
      saveSettings();
    }
    refreshTray();
    emitChanged();
  })().finally(() => {
    checking = null;
  });
  return checking;
}

function startMonitor() {
  stopMonitor();
  if (!settings.monitor.enabled) return;
  firstTimer = setTimeout(
    () => void runChecks(),
    deps.launchedHidden ? FIRST_CHECK_HIDDEN_MS : FIRST_CHECK_MS,
  );
  timer = setInterval(() => void runChecks(), TICK_MS);
}

function stopMonitor() {
  if (timer) clearInterval(timer);
  if (firstTimer) clearTimeout(firstTimer);
  timer = null;
  firstTimer = null;
}

/* ------------------------------ Bandeja ------------------------------ */

let baseIcon = null;
let alertIcon = null;

function trayIcons() {
  if (baseIcon) return { baseIcon, alertIcon };
  baseIcon = nativeImage.createFromPath(deps.iconPath);
  try {
    // Ponto âmbar no canto quando há alerta ativo (desenhado sobre o ícone em 32 px).
    const size = 32;
    const source = nativeImage
      .createFromPath(deps.badgeSourcePath || deps.iconPath)
      .resize({ width: size, height: size, quality: "best" });
    const painted = alerts.paintAlertDot(source.toBitmap(), size);
    alertIcon = nativeImage.createFromBitmap(painted, {
      width: size,
      height: size,
      scaleFactor: 2,
    });
  } catch (error) {
    logger.warn("background", "Ícone de alerta", error instanceof Error ? error.message : error);
    alertIcon = baseIcon;
  }
  return { baseIcon, alertIcon };
}

function handleCommand(command) {
  switch (command?.type) {
    case "open":
      deps.openApp({ to: command.to });
      break;
    case "quick-checkup":
      deps.openApp({ to: "/", command: { type: "quick-checkup" } });
      break;
    case "toggle-monitor":
      updateSettings({ monitorEnabled: !settings.monitor.enabled });
      break;
    case "snooze":
      snooze(24);
      break;
    case "unsnooze":
      snooze(0);
      break;
    case "quit":
      deps.quit();
      break;
    default:
      break;
  }
}

function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  const active = activeAlerts();
  const model = alerts.trayMenuModel({
    active,
    monitorEnabled: settings.monitor.enabled,
    snoozeUntil: settings.snoozeUntil,
    now: Date.now(),
    lastCheckAt,
  });
  const template = model.map((item) =>
    item.type === "separator"
      ? { type: "separator" }
      : {
          label: item.label,
          type: item.type === "checkbox" ? "checkbox" : "normal",
          checked: item.checked,
          enabled: item.enabled !== false,
          click: item.command ? () => handleCommand(item.command) : undefined,
        },
  );
  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(alerts.trayTooltip(active));
  const icons = trayIcons();
  tray.setImage(active.length ? icons.alertIcon : icons.baseIcon);
}

function createTray() {
  if (tray || !deps.iconPath) return;
  try {
    tray = new Tray(trayIcons().baseIcon);
    // Clique: painel da bandeja (disco, CPU, memória, rede…); duplo clique: o app.
    tray.on("click", (_event, bounds) =>
      deps.onTrayClick ? deps.onTrayClick(bounds) : deps.openApp({}),
    );
    tray.on("double-click", () =>
      deps.onTrayDoubleClick ? deps.onTrayDoubleClick() : deps.openApp({}),
    );
    refreshTray();
  } catch (error) {
    tray = null;
    logger.error(
      "background",
      "Falha ao criar a bandeja",
      error instanceof Error ? error.message : error,
    );
  }
}

/* ------------------------------ Estado / IPC ------------------------------ */

function snooze(hours) {
  settings.snoozeUntil = hours > 0 ? Date.now() + hours * 3_600_000 : 0;
  saveSettings();
  refreshTray();
  emitChanged();
}

function publicState() {
  return {
    ok: true,
    supported: {
      tray: !!tray,
      notifications: Notification.isSupported(),
      openAtLogin: process.platform === "win32",
    },
    closeToTray: settings.closeToTray,
    weeklyReport: settings.weeklyReport.enabled,
    openAtLogin: loginItemState(),
    launchedHidden: !!deps?.launchedHidden,
    monitor: {
      enabled: settings.monitor.enabled,
      types: { ...settings.monitor.types },
      snoozeUntil: settings.snoozeUntil > Date.now() ? settings.snoozeUntil : 0,
      lastCheckAt,
      checks: Object.fromEntries(
        alerts.ALERT_TYPES.map((t) => [t, readings[t] ? { ...readings[t] } : null]),
      ),
      active: activeAlerts(),
    },
  };
}

function emitChanged() {
  const win = deps?.getWindow();
  if (win && !win.isDestroyed()) win.webContents.send("wincare:backgroundChanged", publicState());
}

/** Muda preferências vindas da tela de Configurações ou da bandeja. */
function updateSettings(patch = {}) {
  if (typeof patch.closeToTray === "boolean") settings.closeToTray = patch.closeToTray;
  if (typeof patch.openAtLogin === "boolean") setOpenAtLogin(patch.openAtLogin);
  if (typeof patch.checkUpdates === "boolean") settings.updates.enabled = patch.checkUpdates;
  if (typeof patch.weeklyReport === "boolean") settings.weeklyReport.enabled = patch.weeklyReport;
  let restart = false;
  if (
    typeof patch.monitorEnabled === "boolean" &&
    patch.monitorEnabled !== settings.monitor.enabled
  ) {
    settings.monitor.enabled = patch.monitorEnabled;
    restart = true;
  }
  if (patch.types && typeof patch.types === "object") {
    for (const type of alerts.ALERT_TYPES) {
      if (typeof patch.types[type] === "boolean") settings.monitor.types[type] = patch.types[type];
    }
  }
  saveSettings();
  if (restart) startMonitor();
  refreshTray();
  emitChanged();
  return publicState();
}

function registerIpc() {
  ipcMain.handle("wincare:backgroundState", () => publicState());
  ipcMain.handle("wincare:setBackgroundSettings", (_e, patch) => updateSettings(patch || {}));
  ipcMain.handle("wincare:checkAlertsNow", async () => {
    await runChecks({ force: true });
    return publicState();
  });
  ipcMain.handle("wincare:snoozeAlerts", (_e, payload) => {
    const hours = Number(payload?.hours);
    snooze(Number.isFinite(hours) && hours > 0 ? Math.min(hours, 24 * 7) : 0);
    return publicState();
  });
  ipcMain.handle("wincare:testNotification", () => ({
    ok: showNotification({
      title: "Notificação de teste do WinCare",
      body: "É assim que o WinCare avisa quando algo importante acontecer. Clique para abrir.",
      route: "/configuracoes",
    }),
  }));
  ipcMain.handle("wincare:takeTrayCommand", () => {
    const command = pendingCommand;
    pendingCommand = null;
    return command;
  });
}

/* ------------------------------ API para o main.cjs ------------------------------ */

/**
 * @param {object} options
 * @param {() => Electron.BrowserWindow | null} options.getWindow
 * @param {(req: { to?: string, command?: object }) => void} options.openApp
 * @param {() => void} options.quit
 * @param {string} options.iconPath
 * @param {string} [options.badgeSourcePath] PNG grande para desenhar o ponto de alerta
 * @param {boolean} options.launchedHidden
 * @param {string} [options.appId] AppUserModelID (nome e ícone das notificações)
 * @param {() => ({ at: number, info: object } | null)} [options.getRecentSystemInfo]
 * @param {() => Promise<object>} [options.checkForUpdate] consulta o GitHub (updater.cjs)
 * @param {(info: object) => void} [options.promptUpdate] abre o app no aviso de atualização
 * @param {(bounds: Electron.Rectangle) => void} [options.onTrayClick]
 * @param {() => void} [options.onTrayDoubleClick]
 */
function initBackground(options) {
  deps = options;
  startedAt = Date.now();
  loadSettings();
  registerIpc();
  ensureNotificationIdentity();
  createTray();
  startMonitor();
  startUpdateWatch();
  weeklyTimer = setInterval(checkWeeklyReport, 30 * 60_000);
  setTimeout(checkWeeklyReport, 5 * 60_000);
}

/* ------------------------------ Resumo semanal ------------------------------ */

let weeklyTimer = null;

/** Segunda de manhã: notificação com a semana (clique → Histórico). */
function checkWeeklyReport() {
  if (!settings.weeklyReport.enabled) return;
  if (settings.snoozeUntil > Date.now()) return;
  const now = Date.now();
  const { due, mark } = isDigestDue(settings.weeklyReport.lastSentAt, now);
  if (mark) {
    settings.weeklyReport.lastSentAt = now;
    saveSettings();
    return;
  }
  if (!due) return;
  settings.weeklyReport.lastSentAt = now;
  saveSettings();
  try {
    const digest = weeklyDigest(history.readHistory(), now);
    if (!digest.hasData) return;
    const message = describeDigest(digest);
    showNotification({ ...message, route: "/historico" });
    logger.log("weekly", "Resumo semanal enviado", { body: message.body });
  } catch (error) {
    logger.warn("weekly", "Resumo semanal", error instanceof Error ? error.message : error);
  }
}

/* ------------------------------ Versão nova ------------------------------ */

/** Com o app aberto (inclusive só na bandeja), procura versão nova de tempos em tempos. */
const UPDATE_FIRST_CHECK_MS = 30 * 60_000;
const UPDATE_EVERY_MS = 6 * 60 * 60_000;
let updateTimers = [];

function startUpdateWatch() {
  if (!deps.checkForUpdate) return;
  stopUpdateWatch();
  updateTimers = [
    setTimeout(() => void checkUpdateInBackground(), UPDATE_FIRST_CHECK_MS),
    setInterval(() => void checkUpdateInBackground(), UPDATE_EVERY_MS),
  ];
}

function stopUpdateWatch() {
  for (const t of updateTimers) {
    clearTimeout(t);
    clearInterval(t);
  }
  updateTimers = [];
}

/**
 * Avisa uma vez por versão: com a janela em foco abre o aviso dentro do app;
 * senão, notificação do Windows (clique → abre o app no aviso de atualização).
 */
async function checkUpdateInBackground() {
  if (!settings.updates.enabled) return;
  if (settings.snoozeUntil > Date.now()) return;
  let info;
  try {
    info = await deps.checkForUpdate();
  } catch (error) {
    logger.warn("updater", "Verificação periódica", error instanceof Error ? error.message : error);
    return;
  }
  if (!info?.ok || !info.updateAvailable || !info.latestVersion) return;
  if (settings.updates.notifiedVersion === info.latestVersion) return;
  settings.updates.notifiedVersion = info.latestVersion;
  saveSettings();
  logger.log("updater", "Versão nova encontrada com o app aberto", { version: info.latestVersion });
  if (windowInFocus()) {
    deps.promptUpdate(info);
    return;
  }
  showNotification({
    title: `WinCare ${info.latestVersion} disponível`,
    body: "Clique para ver o que mudou e atualizar. Leva menos de um minuto.",
    onClick: () => deps.promptUpdate(info),
  });
}

/** Fechar a janela só esconde: com a opção ligada ou quando o app abriu com o Windows. */
const keepInTray = () => !!tray && (settings.closeToTray || !!deps?.launchedHidden);

/** Primeira vez que a janela some para a bandeja: explica onde o app ficou. */
function onHiddenToTray() {
  if (settings.trayHintShown) return;
  settings.trayHintShown = true;
  saveSettings();
  showNotification({
    title: "O WinCare continua na bandeja",
    body: "Ele avisa se algo importante acontecer. Para fechar de vez, clique com o botão direito no ícone e escolha Sair.",
  });
}

/** Comando que a janela nova ainda não recebeu (ela pede ao montar). */
function setPendingCommand(command) {
  pendingCommand = command || null;
}

function disposeBackground() {
  stopMonitor();
  stopUpdateWatch();
  if (weeklyTimer) clearInterval(weeklyTimer);
  weeklyTimer = null;
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}

const isAllowedRoute = (to) => typeof to === "string" && ROUTES.has(to);

module.exports = {
  HIDDEN_ARG,
  disposeBackground,
  initBackground,
  isAllowedRoute,
  keepInTray,
  onHiddenToTray,
  setPendingCommand,
};
