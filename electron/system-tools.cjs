/*
 * Ferramentas de "por que está lento" e "como está a proteção":
 *  - processos com % de CPU real (diferença entre duas leituras) e encerrar
 *    um app travado — só PIDs da última lista e nunca processos do Windows;
 *  - proteção: Defender, firewall, UAC e antivírus de terceiros;
 *  - extensões de navegador (Chrome, Edge, Brave, Vivaldi, Opera, Firefox)
 *    com permissões amplas, para o usuário decidir o que revisar;
 *  - rede (velocidade atual, tipo de conexão, IP), Bluetooth e teste de
 *    velocidade — usados pelo painel da bandeja.
 * Tudo aqui só lê, exceto encerrar processo (confirmado na tela).
 */
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const logger = require("./logger.cjs");
const { psFileJson } = require("./powershell.cjs");

/* ------------------------------ Processos ------------------------------ */

/** Encerrar qualquer um destes derruba o Windows ou a sessão. */
const PROTECTED_PROCESSES = new Set(
  [
    "system",
    "idle",
    "registry",
    "smss",
    "csrss",
    "wininit",
    "winlogon",
    "services",
    "lsass",
    "lsaiso",
    "svchost",
    "dwm",
    "fontdrvhost",
    "memcompression",
    "memory compression",
    "secure system",
    "sihost",
    "ctfmon",
    "spoolsv",
    "audiodg",
    "msmpeng",
    "nissrv",
    "securityhealthservice",
    "wudfhost",
    "conhost",
    "explorer",
    "startmenuexperiencehost",
    "shellexperiencehost",
    "searchhost",
    "taskhostw",
    "runtimebroker",
  ].map((n) => n.toLowerCase()),
);

const isProtectedProcess = (name) => PROTECTED_PROCESSES.has(String(name || "").toLowerCase());

/** pid → { cpuSeconds, at } da leitura anterior. */
let lastSample = new Map();
/** PIDs que a tela pode pedir para encerrar (da última lista). */
let listedPids = new Map();

const PROCESS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$list = Get-Process | Where-Object { $_.Id -gt 4 } | ForEach-Object {
  @{ n = $_.ProcessName; p = $_.Id; c = [double]$_.CPU; m = [int64]$_.WorkingSet64; t = [string]$_.MainWindowTitle }
}
ConvertTo-Json -Compress -InputObject @($list)
`;

/**
 * % de CPU de cada processo entre esta leitura e a anterior (0–100 do total
 * da máquina). Na primeira leitura não há base: cpuPct fica null.
 */
function computeCpuPct(rows, prev, now, cores) {
  const next = new Map();
  const list = rows.map((row) => {
    const pid = Number(row.p) || 0;
    const cpuSeconds = Number(row.c) || 0;
    next.set(pid, { cpuSeconds, at: now });
    const before = prev.get(pid);
    let cpuPct = null;
    if (before && now > before.at) {
      const used = Math.max(0, cpuSeconds - before.cpuSeconds);
      cpuPct = Math.min(100, (used / ((now - before.at) / 1000) / Math.max(1, cores)) * 100);
      cpuPct = Math.round(cpuPct * 10) / 10;
    }
    return {
      name: String(row.n || "?"),
      pid,
      cpu: Math.round(cpuSeconds * 10) / 10,
      cpuPct,
      memMb: Math.round((Number(row.m) || 0) / 1024 / 1024),
      hasWindow: !!String(row.t || "").trim(),
    };
  });
  return { list, sample: next };
}

async function listProcesses({ limit = 40 } = {}) {
  if (process.platform !== "win32") return [];
  const rows = await psFileJson(PROCESS_SCRIPT, 20000);
  const all = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const { list, sample } = computeCpuPct(all, lastSample, Date.now(), os.cpus().length);
  lastSample = sample;
  // Os que mais usam CPU + os que mais usam memória (sem repetir).
  const byCpu = [...list].sort((a, b) => (b.cpuPct ?? 0) - (a.cpuPct ?? 0)).slice(0, limit / 2);
  const byMem = [...list].sort((a, b) => b.memMb - a.memMb);
  const picked = new Map(byCpu.map((p) => [p.pid, p]));
  for (const p of byMem) {
    if (picked.size >= limit) break;
    picked.set(p.pid, p);
  }
  listedPids = new Map([...picked.values()].map((p) => [p.pid, p.name]));
  return [...picked.values()].map((p) => ({
    ...p,
    canEnd: !isProtectedProcess(p.name) && p.pid !== process.pid,
  }));
}

/** Encerra um processo da última lista (equivale a "Finalizar tarefa"). */
function endProcess({ pid } = {}) {
  const id = Number(pid);
  const name = listedPids.get(id);
  if (!Number.isInteger(id) || !name) {
    return { ok: false, reason: "Processo não está mais na lista. Atualize e tente de novo." };
  }
  if (isProtectedProcess(name) || id === process.pid || id === process.ppid) {
    return { ok: false, reason: `${name} é um processo do Windows e não pode ser encerrado aqui.` };
  }
  try {
    process.kill(id);
    listedPids.delete(id);
    logger.log("processes", "Processo encerrado", { pid: id, name });
    return { ok: true, name };
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : "";
    return {
      ok: false,
      name,
      reason:
        code === "EPERM"
          ? `${name} roda como administrador. Reabra o WinCare como administrador para encerrá-lo.`
          : code === "ESRCH"
            ? `${name} já tinha sido fechado.`
            : "Não foi possível encerrar o processo.",
    };
  }
}

/* ------------------------------ Proteção ------------------------------ */

const SECURITY_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$mp = $null
try { $mp = Get-MpComputerStatus -ErrorAction Stop } catch {}
$fw = @()
try {
  $fw = @(Get-NetFirewallProfile -ErrorAction Stop | ForEach-Object { @{ name = [string]$_.Name; enabled = [bool]$_.Enabled } })
} catch {}
$av = @()
try {
  $av = @(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction Stop | ForEach-Object {
    @{ name = [string]$_.displayName; on = (($_.productState -band 0x1000) -ne 0) }
  })
} catch {}
$lua = $null
try { $lua = [int](Get-ItemPropertyValue -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name EnableLUA) } catch {}
$ss = $null
try { $ss = [string](Get-ItemPropertyValue -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer' -Name SmartScreenEnabled) } catch {}
@{
  defender = if ($mp) { @{
    realtime = [bool]$mp.RealTimeProtectionEnabled
    antivirus = [bool]$mp.AntivirusEnabled
    tamper = [bool]$mp.IsTamperProtected
    signatureAgeDays = [int]$mp.AntivirusSignatureAge
    quickScanAgeDays = [int]$mp.QuickScanAge
  } } else { $null }
  firewall = $fw
  antivirus = $av
  uac = $lua
  smartScreen = $ss
} | ConvertTo-Json -Compress -Depth 4
`;

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** Firewall do Windows usa nomes em inglês; mostramos os da tela de Segurança. */
const FIREWALL_NAMES = {
  Domain: "Rede de domínio",
  Private: "Rede privada",
  Public: "Rede pública",
};

async function securityStatus() {
  if (process.platform !== "win32") return { ok: false, reason: "Disponível só no Windows." };
  const raw = await psFileJson(SECURITY_SCRIPT, 45000);
  if (!raw || typeof raw !== "object") return { ok: false, reason: "O Windows não respondeu." };
  const thirdParty = asList(raw.antivirus).filter((a) => a?.name && !/defender/i.test(a.name));
  return {
    ok: true,
    at: Date.now(),
    defender: raw.defender
      ? {
          realtime: !!raw.defender.realtime,
          antivirus: !!raw.defender.antivirus,
          tamper: !!raw.defender.tamper,
          signatureAgeDays: Number(raw.defender.signatureAgeDays) || 0,
          quickScanAgeDays:
            Number(raw.defender.quickScanAgeDays) >= 0
              ? Number(raw.defender.quickScanAgeDays)
              : null,
        }
      : null,
    firewall: asList(raw.firewall).map((f) => ({
      id: String(f.name || "").toLowerCase(),
      name: FIREWALL_NAMES[f.name] || String(f.name || "Perfil"),
      enabled: !!f.enabled,
    })),
    otherAntivirus: thirdParty.map((a) => ({ name: String(a.name), enabled: !!a.on })),
    uacEnabled: raw.uac === null || raw.uac === undefined ? null : Number(raw.uac) !== 0,
    smartScreen: typeof raw.smartScreen === "string" && raw.smartScreen ? raw.smartScreen : null,
  };
}

/* ------------------------------ Extensões ------------------------------ */

const BROAD_HOSTS = new Set(["<all_urls>", "*://*/*", "http://*/*", "https://*/*", "*://*/"]);

/** Permissões que dão acesso a dados pessoais ou ao tráfego do navegador. */
const SENSITIVE = Object.freeze({
  tabs: "ver as abas e endereços abertos",
  history: "ler o histórico",
  cookies: "ler e alterar cookies (sessões logadas)",
  webRequest: "ver o tráfego das páginas",
  webRequestBlocking: "alterar o tráfego das páginas",
  clipboardRead: "ler a área de transferência",
  nativeMessaging: "conversar com programas do PC",
  debugger: "controlar páginas como depurador",
  proxy: "mudar o proxy",
  management: "gerenciar outras extensões",
  downloads: "gerenciar downloads",
  privacy: "mudar configurações de privacidade",
  browsingData: "apagar dados de navegação",
  geolocation: "saber a localização",
  scripting: "injetar código nas páginas",
});

/** Avalia o que a extensão pode fazer. Pura (testada). */
function assessExtension({ permissions = [], hosts = [], contentMatches = [] }) {
  const all = [...permissions, ...hosts, ...contentMatches].map(String);
  const allSites = all.some((p) => BROAD_HOSTS.has(p));
  const sensitive = [...new Set(permissions.map(String))].filter((p) => SENSITIVE[p]);
  const reasons = [];
  if (allSites) reasons.push("ler e alterar dados em todos os sites");
  for (const p of sensitive) reasons.push(SENSITIVE[p]);
  const level =
    allSites && sensitive.length ? "high" : allSites || sensitive.length >= 2 ? "medium" : "low";
  return { level, allSites, reasons };
}

const CHROMIUM_BROWSERS = [
  { id: "chrome", name: "Google Chrome", dir: ["Google", "Chrome", "User Data"] },
  { id: "edge", name: "Microsoft Edge", dir: ["Microsoft", "Edge", "User Data"] },
  { id: "brave", name: "Brave", dir: ["BraveSoftware", "Brave-Browser", "User Data"] },
  { id: "vivaldi", name: "Vivaldi", dir: ["Vivaldi", "User Data"] },
  { id: "opera", name: "Opera", roaming: true, dir: ["Opera Software", "Opera Stable"] },
];

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
};

/** "__MSG_appName__" → texto do idioma padrão da extensão. */
function localizedName(dir, manifest) {
  const raw = String(manifest.name || "");
  const match = /^__MSG_(.+)__$/.exec(raw);
  if (!match) return raw;
  for (const locale of ["pt_BR", "pt", manifest.default_locale, "en", "en_US"].filter(Boolean)) {
    const messages = readJson(path.join(dir, "_locales", locale, "messages.json"));
    if (!messages) continue;
    const key = Object.keys(messages).find((k) => k.toLowerCase() === match[1].toLowerCase());
    if (key && messages[key]?.message) return String(messages[key].message);
  }
  return raw;
}

function chromiumProfiles(userData) {
  try {
    return fs
      .readdirSync(userData, { withFileTypes: true })
      .filter((d) => d.isDirectory() && (d.name === "Default" || /^Profile \d+$/.test(d.name)))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function chromiumExtensions(browser) {
  const base = browser.roaming ? process.env.APPDATA : process.env.LOCALAPPDATA;
  if (!base) return [];
  const userData = path.join(base, ...browser.dir);
  const profiles = browser.roaming ? ["."] : chromiumProfiles(userData);
  const out = [];
  for (const profile of profiles) {
    const profileDir = path.join(userData, profile);
    const prefs =
      readJson(path.join(profileDir, "Secure Preferences")) ||
      readJson(path.join(profileDir, "Preferences"));
    const settings = prefs?.extensions?.settings || {};
    let ids = [];
    try {
      ids = fs.readdirSync(path.join(profileDir, "Extensions"));
    } catch {
      continue;
    }
    for (const extId of ids) {
      if (!/^[a-p]{32}$/.test(extId)) continue;
      let versions = [];
      try {
        versions = fs.readdirSync(path.join(profileDir, "Extensions", extId));
      } catch {
        continue;
      }
      const version = versions.sort().pop();
      if (!version) continue;
      const dir = path.join(profileDir, "Extensions", extId, version);
      const manifest = readJson(path.join(dir, "manifest.json"));
      if (!manifest) continue;
      const state = settings[extId];
      // Componentes internos do navegador (não aparecem na página de extensões).
      if (state && state.location === 5) continue;
      const disabled = state ? state.state === 0 || !!state.disable_reasons : null;
      const assessment = assessExtension({
        permissions: asList(manifest.permissions).filter((p) => typeof p === "string"),
        hosts: [
          ...asList(manifest.host_permissions),
          ...asList(manifest.permissions).filter((p) => typeof p === "string" && p.includes("/")),
        ],
        contentMatches: asList(manifest.content_scripts).flatMap((c) => asList(c?.matches)),
      });
      out.push({
        id: `${browser.id}:${profile}:${extId}`,
        browser: browser.name,
        profile: profile === "." ? "Padrão" : profile === "Default" ? "Padrão" : profile,
        name: localizedName(dir, manifest) || extId,
        version: String(manifest.version || version),
        enabled: disabled === null ? null : !disabled,
        ...assessment,
      });
    }
  }
  return out;
}

function firefoxExtensions() {
  const root =
    process.env.APPDATA && path.join(process.env.APPDATA, "Mozilla", "Firefox", "Profiles");
  if (!root) return [];
  let profiles = [];
  try {
    profiles = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out = [];
  for (const profile of profiles) {
    const data = readJson(path.join(root, profile, "extensions.json"));
    for (const addon of asList(data?.addons)) {
      if (addon?.type !== "extension" || addon.location !== "app-profile") continue;
      const perms = addon.userPermissions || {};
      out.push({
        id: `firefox:${profile}:${addon.id}`,
        browser: "Mozilla Firefox",
        profile: profile.replace(/^[a-z0-9]+\./, ""),
        name: String(addon.defaultLocale?.name || addon.id),
        version: String(addon.version || ""),
        enabled: addon.active !== false,
        ...assessExtension({
          permissions: asList(perms.permissions),
          hosts: asList(perms.origins),
          contentMatches: [],
        }),
      });
    }
  }
  return out;
}

function browserExtensions() {
  const items = [...CHROMIUM_BROWSERS.flatMap(chromiumExtensions), ...firefoxExtensions()];
  const order = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => order[a.level] - order[b.level] || a.name.localeCompare(b.name, "pt-BR"));
  return { ok: true, items };
}

/* ------------------------------ Rede ------------------------------ */

function run(file, args, timeoutMs = 6000) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: timeoutMs }, (err, stdout) =>
      resolve(err ? "" : String(stdout || "")),
    );
  });
}

/** `netstat -e`: linha "Bytes" com recebidos e enviados (igual em pt-BR e en). */
function parseNetstatBytes(text) {
  const line = String(text)
    .split(/\r?\n/)
    .find((l) => /^\s*bytes\s/i.test(l));
  if (!line) return null;
  const numbers = line.match(/\d[\d.,]*/g);
  if (!numbers || numbers.length < 2) return null;
  const toNum = (s) => Number(s.replace(/[.,]/g, ""));
  return { received: toNum(numbers[0]), sent: toNum(numbers[1]) };
}

let lastNet = null;
let adapterCache = { at: 0, value: null };

const ADAPTER_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$a = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and -not $_.Virtual } | Sort-Object -Property ifIndex | Select-Object -First 1
$ssid = $null
if ($a -and ($a.PhysicalMediaType -match '802.11' -or $a.Name -match 'Wi-?Fi|Wireless|WLAN')) {
  $line = (netsh wlan show interfaces) | Where-Object { $_ -match '^\\s*SSID\\s*:' } | Select-Object -First 1
  if ($line) { $ssid = ($line -split ':', 2)[1].Trim() }
}
$ip = $null
if ($a) { $ip = (Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 | Select-Object -First 1).IPAddress }
@{
  name = if ($a) { [string]$a.Name } else { $null }
  description = if ($a) { [string]$a.InterfaceDescription } else { $null }
  media = if ($a) { [string]$a.PhysicalMediaType } else { $null }
  speed = if ($a) { [string]$a.LinkSpeed } else { $null }
  ssid = $ssid
  ip = $ip
} | ConvertTo-Json -Compress
`;

async function readAdapter() {
  if (adapterCache.value && Date.now() - adapterCache.at < 60_000) return adapterCache.value;
  const raw =
    process.platform === "win32" ? await psFileJson(ADAPTER_SCRIPT, 20000).catch(() => null) : null;
  const wifi = !!raw?.ssid || /802\.11|wi-?fi|wireless|wlan/i.test(`${raw?.media} ${raw?.name}`);
  const value = raw?.name
    ? {
        connected: true,
        kind: wifi ? "wifi" : "ethernet",
        name: String(raw.name),
        description: String(raw.description || ""),
        ssid: raw.ssid ? String(raw.ssid) : null,
        ip: raw.ip ? String(raw.ip) : null,
        linkSpeed: raw.speed ? String(raw.speed) : null,
      }
    : {
        connected: false,
        kind: "none",
        name: null,
        description: "",
        ssid: null,
        ip: null,
        linkSpeed: null,
      };
  adapterCache = { at: Date.now(), value };
  return value;
}

/** Velocidade atual (bytes/s) desde a leitura anterior + totais desde que o PC ligou. */
async function networkStatus() {
  const [stat, adapter] = await Promise.all([
    process.platform === "win32" ? run("netstat", ["-e"]).then(parseNetstatBytes) : null,
    readAdapter(),
  ]);
  const now = Date.now();
  let downBps = null;
  let upBps = null;
  if (stat && lastNet && now > lastNet.at) {
    const secs = (now - lastNet.at) / 1000;
    downBps = Math.max(0, (stat.received - lastNet.received) / secs);
    upBps = Math.max(0, (stat.sent - lastNet.sent) / secs);
  }
  if (stat) lastNet = { ...stat, at: now };
  return {
    ok: true,
    at: now,
    adapter,
    downBps,
    upBps,
    totalReceived: stat?.received ?? null,
    totalSent: stat?.sent ?? null,
  };
}

/* ------------------------------ Teste de velocidade ------------------------------ */

const SPEED_HOST = "https://speed.cloudflare.com";
let speedRunning = null;

async function timed(fn) {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

/** Latência (mediana de 5), download de 25 MB e upload de 8 MB na Cloudflare. */
function speedTest() {
  if (speedRunning) return speedRunning;
  speedRunning = (async () => {
    const latencies = [];
    for (let i = 0; i < 5; i++) {
      latencies.push(
        await timed(async () => {
          const res = await fetch(`${SPEED_HOST}/__down?bytes=0`, { cache: "no-store" });
          await res.arrayBuffer();
        }),
      );
    }
    latencies.sort((a, b) => a - b);
    const downBytes = 25_000_000;
    const downMs = await timed(async () => {
      const res = await fetch(`${SPEED_HOST}/__down?bytes=${downBytes}`, { cache: "no-store" });
      await res.arrayBuffer();
    });
    const upBytes = 8_000_000;
    const upMs = await timed(async () => {
      const res = await fetch(`${SPEED_HOST}/__up`, {
        method: "POST",
        body: new Uint8Array(upBytes),
        headers: { "Content-Type": "application/octet-stream" },
      });
      await res.arrayBuffer();
    });
    const mbps = (bytes, ms) => Math.round(((bytes * 8) / (ms / 1000) / 1_000_000) * 10) / 10;
    return {
      ok: true,
      at: Date.now(),
      latencyMs: Math.round(latencies[2]),
      downloadMbps: mbps(downBytes, downMs),
      uploadMbps: mbps(upBytes, upMs),
      server: "Cloudflare",
    };
  })()
    .catch((error) => ({
      ok: false,
      reason:
        error instanceof Error && /fetch failed/i.test(error.message)
          ? "Sem conexão com a internet."
          : "O teste de velocidade falhou.",
    }))
    .finally(() => {
      speedRunning = null;
    });
  return speedRunning;
}

/* ------------------------------ Bluetooth ------------------------------ */

const BLUETOOTH_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$radio = @(Get-PnpDevice -Class Bluetooth -PresentOnly | Where-Object { $_.InstanceId -match '^USB\\\\|^PCI\\\\' -or $_.FriendlyName -match 'Adapter|Radio|Wireless Bluetooth' }).Count -gt 0
$devices = @(Get-PnpDevice -Class Bluetooth | Where-Object { $_.InstanceId -match '^BTH(ENUM|LE)\\\\DEV_' } | ForEach-Object {
  $c = $null
  try { $c = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName '{83DA6326-97A6-4088-9453-A1923F573B29} 15' -ErrorAction Stop).Data } catch {}
  @{ name = [string]$_.FriendlyName; connected = [bool]$c; id = [string]$_.InstanceId }
})
@{ radio = $radio; devices = $devices } | ConvertTo-Json -Compress -Depth 3
`;

let bluetoothCache = { at: 0, value: null };

async function bluetoothDevices() {
  if (process.platform !== "win32") return { ok: true, available: false, devices: [] };
  if (bluetoothCache.value && Date.now() - bluetoothCache.at < 30_000) return bluetoothCache.value;
  const raw = await psFileJson(BLUETOOTH_SCRIPT, 30000).catch(() => null);
  const seen = new Set();
  const devices = asList(raw?.devices)
    .filter((d) => d?.name)
    .filter((d) => {
      const key = d.name.toLowerCase();
      if (seen.has(key) && !d.connected) return false;
      seen.add(key);
      return true;
    })
    .map((d) => ({ name: String(d.name), connected: !!d.connected }))
    .sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name));
  const value = { ok: true, available: !!raw?.radio || devices.length > 0, devices };
  bluetoothCache = { at: Date.now(), value };
  return value;
}

/* ------------------------------ CPU ------------------------------ */

let lastCpuTimes = null;

/** Divisão do processador: usuário, sistema e livre (%), como no Gerenciador de Tarefas. */
function cpuBreakdown() {
  const totals = os.cpus().reduce(
    (acc, cpu) => {
      acc.user += cpu.times.user + cpu.times.nice;
      acc.sys += cpu.times.sys + cpu.times.irq;
      acc.idle += cpu.times.idle;
      return acc;
    },
    { user: 0, sys: 0, idle: 0 },
  );
  const prev = lastCpuTimes;
  lastCpuTimes = totals;
  if (!prev) return null;
  const user = totals.user - prev.user;
  const sys = totals.sys - prev.sys;
  const idle = totals.idle - prev.idle;
  const sum = user + sys + idle;
  if (sum <= 0) return null;
  return {
    userPct: Math.round((user / sum) * 100),
    systemPct: Math.round((sys / sum) * 100),
    idlePct: Math.round((idle / sum) * 100),
  };
}

module.exports = {
  assessExtension,
  bluetoothDevices,
  browserExtensions,
  computeCpuPct,
  cpuBreakdown,
  endProcess,
  isProtectedProcess,
  listProcesses,
  networkStatus,
  parseNetstatBytes,
  securityStatus,
  speedTest,
};
