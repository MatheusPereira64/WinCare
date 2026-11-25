/*
 * Tempo de inicialização do Windows, lido dos logs de eventos (sem admin):
 *  - System / Kernel-General 12: o Windows começou a carregar;
 *  - System / Winlogon 7001: o usuário entrou (login);
 *  - Shell-Core/Operational 9706: terminou de abrir os programas das chaves
 *    Run (é a fase que os programas de inicialização deixam lenta).
 * Compara os boots antes e depois da última mudança feita na tela
 * Inicialização (gravada no histórico como startup-enable/startup-disable).
 * As partes puras são testadas em electron/tests/features.test.cjs.
 */
const { ipcMain } = require("electron");
const { psFileJson } = require("./powershell.cjs");
const history = require("./maintenance-history.cjs");

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
/** Mais que isso entre ligar e o login = PC ficou parado na tela de bloqueio. */
const MAX_TO_LOGON = 10 * MINUTE;
/** Janela depois do login para os programas de inicialização terminarem. */
const MAX_TO_READY = 15 * MINUTE;
const LOOKBACK_DAYS = 60;
const MAX_BOOTS = 20;
/** Quantos boots de cada lado entram na média antes/depois. */
const COMPARE_BOOTS = 5;

const SCRIPT = `
$since = (Get-Date).AddDays(-${LOOKBACK_DAYS})
function Get-Times($filter) {
  try {
    @(Get-WinEvent -FilterHashtable $filter -ErrorAction Stop |
      ForEach-Object { [int64](([DateTimeOffset]$_.TimeCreated).ToUnixTimeMilliseconds()) })
  } catch { @() }
}
$boots = Get-Times @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-General'; Id = 12; StartTime = $since }
$logons = Get-Times @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Winlogon'; Id = 7001; StartTime = $since }
$ready = Get-Times @{ LogName = 'Microsoft-Windows-Shell-Core/Operational'; Id = 9706; StartTime = $since }
[pscustomobject]@{ boots = $boots; logons = $logons; ready = $ready } | ConvertTo-Json -Compress -Depth 3
`;

const nums = (list) =>
  (Array.isArray(list) ? list : [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

/**
 * Junta os três tipos de evento em boots: { ts, logonMs, readyMs|null }.
 * `readyMs` = do login até os programas de inicialização terminarem.
 * Mais recente primeiro.
 */
function pairBoots(raw) {
  const boots = nums(raw?.boots);
  const logons = nums(raw?.logons);
  const ready = nums(raw?.ready);
  const out = [];
  boots.forEach((ts, i) => {
    const next = boots[i + 1] ?? Infinity;
    const logon = logons.find((t) => t > ts && t < next && t - ts <= MAX_TO_LOGON);
    if (logon === undefined) return;
    const done = ready.filter((t) => t > logon && t < next && t - logon <= MAX_TO_READY);
    out.push({
      ts,
      logonMs: logon - ts,
      readyMs: done.length ? done[done.length - 1] - logon : null,
    });
  });
  return out.reverse().slice(0, MAX_BOOTS);
}

/** Última mudança na Inicialização feita pelo WinCare (histórico). */
function lastStartupChange(events) {
  let best = null;
  for (const e of Array.isArray(events) ? events : []) {
    if (e?.ok === false) continue;
    if (e?.action !== "startup-disable" && e?.action !== "startup-enable") continue;
    if (!best || e.ts > best.ts) best = e;
  }
  return best ? { ts: best.ts, action: best.action, subject: best.subject || null } : null;
}

const avg = (list) =>
  list.length ? Math.round(list.reduce((n, v) => n + v, 0) / list.length) : null;

/** Médias (em ms) dos boots antes e depois da mudança. */
function compareBoots(boots, changeTs) {
  if (!changeTs) return null;
  const withReady = boots.filter((b) => b.readyMs !== null);
  const after = withReady.filter((b) => b.ts > changeTs).slice(0, COMPARE_BOOTS);
  const before = withReady.filter((b) => b.ts <= changeTs).slice(0, COMPARE_BOOTS);
  return {
    beforeMs: avg(before.map((b) => b.readyMs)),
    afterMs: avg(after.map((b) => b.readyMs)),
    beforeCount: before.length,
    afterCount: after.length,
  };
}

async function readBootTimes(now = Date.now()) {
  if (process.platform !== "win32") return { supported: false, boots: [] };
  let raw = null;
  try {
    raw = await psFileJson(SCRIPT, 45000);
  } catch {
    raw = null;
  }
  const boots = pairBoots(raw).filter((b) => b.ts >= now - LOOKBACK_DAYS * DAY);
  const change = lastStartupChange(history.readHistory().events);
  return {
    supported: true,
    boots,
    lastChange: change,
    comparison: change ? compareBoots(boots, change.ts) : null,
  };
}

function initBootTimes() {
  ipcMain.handle("wincare:bootTimes", () => readBootTimes());
}

module.exports = { compareBoots, initBootTimes, lastStartupChange, pairBoots };
