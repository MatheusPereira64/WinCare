const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { measurePaths, removePaths } = require("./file-walker.cjs");

const SAMPLE_LIMIT = 20;
const SCHEDULED_TEMP_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/* Só dados descartáveis: senhas (Login Data), favoritos e extensões nunca entram aqui. */
const CHROMIUM_CACHE = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnCache",
  "DawnWebGPUCache",
  "DawnGraphiteCache",
  "Service Worker/CacheStorage",
  "Service Worker/ScriptCache",
];
const CHROMIUM_COOKIES = [
  "Network/Cookies",
  "Network/Cookies-journal",
  "Cookies",
  "Cookies-journal",
];
const CHROMIUM_HISTORY = ["History", "History-journal", "Visited Links", "Top Sites"];
const ELECTRON_APP_CACHE = ["Cache", "Code Cache", "GPUCache"];

const CHROMIUM_BROWSERS = [
  {
    id: "chrome",
    name: "Google Chrome",
    base: "LOCALAPPDATA",
    dir: "Google/Chrome/User Data",
    process: "chrome.exe",
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    base: "LOCALAPPDATA",
    dir: "Microsoft/Edge/User Data",
    process: "msedge.exe",
  },
  {
    id: "brave",
    name: "Brave",
    base: "LOCALAPPDATA",
    dir: "BraveSoftware/Brave-Browser/User Data",
    process: "brave.exe",
  },
  {
    id: "vivaldi",
    name: "Vivaldi",
    base: "LOCALAPPDATA",
    dir: "Vivaldi/User Data",
    process: "vivaldi.exe",
  },
];

const OPERA_BROWSERS = [
  { id: "opera", name: "Opera", dir: "Opera Software/Opera Stable", process: "opera.exe" },
  { id: "opera-gx", name: "Opera GX", dir: "Opera Software/Opera GX Stable", process: "opera.exe" },
];

const APP_CACHES = [
  {
    id: "discord",
    name: "Discord",
    base: "APPDATA",
    dir: "discord",
    entries: ELECTRON_APP_CACHE,
    process: "discord.exe",
  },
  {
    id: "slack",
    name: "Slack",
    base: "APPDATA",
    dir: "Slack",
    entries: ELECTRON_APP_CACHE,
    process: "slack.exe",
  },
  {
    id: "vscode",
    name: "Visual Studio Code",
    base: "APPDATA",
    dir: "Code",
    entries: [...ELECTRON_APP_CACHE, "CachedData"],
    process: "code.exe",
  },
  {
    id: "spotify",
    name: "Spotify",
    base: "LOCALAPPDATA",
    dir: "Spotify/Browser",
    entries: ELECTRON_APP_CACHE,
    process: "spotify.exe",
  },
  {
    id: "steam",
    name: "Steam",
    base: "LOCALAPPDATA",
    dir: "Steam",
    entries: ["htmlcache"],
    process: "steam.exe",
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    base: "LOCALAPPDATA",
    dir: "Packages/MSTeams_8wekyb3d8bbwe/LocalCache/Microsoft/MSTeams/EBWebView/Default",
    entries: ELECTRON_APP_CACHE,
    process: "ms-teams.exe",
  },
  {
    id: "teams-classic",
    name: "Microsoft Teams (clássico)",
    base: "APPDATA",
    dir: "Microsoft/Teams",
    entries: ELECTRON_APP_CACHE,
    process: "teams.exe",
  },
];

const safeReaddir = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

const joinAll = (base, entries) => entries.map((entry) => path.win32.join(base, entry));

/** Nome amigável dos perfis Chromium (arquivo Local State); cai no nome da pasta. */
function readChromiumProfileNames(userDataDir) {
  try {
    const raw = fs.readFileSync(path.win32.join(userDataDir, "Local State"), "utf8");
    const cache = JSON.parse(raw)?.profile?.info_cache ?? {};
    return Object.fromEntries(Object.entries(cache).map(([key, value]) => [key, value?.name]));
  } catch {
    return {};
  }
}

function buildCleanerTargets(
  env,
  readdir = safeReaddir,
  readProfileNames = readChromiumProfileNames,
) {
  const targets = [];
  const add = (app, profile, category, paths) =>
    targets.push({
      id: `${app.id}|${profile}|${category}`,
      appId: app.id,
      appName: app.name,
      appKind: app.kind,
      process: app.process,
      profile,
      category,
      paths,
    });

  for (const browser of CHROMIUM_BROWSERS) {
    if (!env[browser.base]) continue;
    const userData = path.win32.join(env[browser.base], browser.dir);
    const names = readProfileNames(userData);
    const profiles = readdir(userData)
      .filter((d) => d.isDirectory() && /^(Default|Profile \d+)$/.test(d.name))
      .map((d) => d.name);
    const app = { ...browser, kind: "browser" };
    for (const profile of profiles) {
      const dir = path.win32.join(userData, profile);
      const label = names[profile] || profile;
      add(app, label, "cache", joinAll(dir, CHROMIUM_CACHE));
      add(app, label, "cookies", joinAll(dir, CHROMIUM_COOKIES));
      add(app, label, "history", joinAll(dir, CHROMIUM_HISTORY));
    }
  }

  for (const browser of OPERA_BROWSERS) {
    if (!env.APPDATA) continue;
    const app = { ...browser, kind: "browser" };
    const roaming = path.win32.join(env.APPDATA, browser.dir);
    if (env.LOCALAPPDATA) {
      add(
        app,
        "Padrão",
        "cache",
        joinAll(path.win32.join(env.LOCALAPPDATA, browser.dir), CHROMIUM_CACHE),
      );
    }
    add(app, "Padrão", "cookies", joinAll(roaming, CHROMIUM_COOKIES));
    add(app, "Padrão", "history", joinAll(roaming, CHROMIUM_HISTORY));
  }

  /* Firefox: places.sqlite guarda histórico E favoritos, então não é apagado. */
  if (env.APPDATA) {
    const app = { id: "firefox", name: "Mozilla Firefox", kind: "browser", process: "firefox.exe" };
    const profilesDir = path.win32.join(env.APPDATA, "Mozilla/Firefox/Profiles");
    for (const entry of readdir(profilesDir)) {
      if (!entry.isDirectory()) continue;
      const label = entry.name.split(".").slice(1).join(".") || entry.name;
      if (env.LOCALAPPDATA) {
        const local = path.win32.join(env.LOCALAPPDATA, "Mozilla/Firefox/Profiles", entry.name);
        add(app, label, "cache", joinAll(local, ["cache2", "startupCache", "thumbnails"]));
      }
      const roaming = path.win32.join(profilesDir, entry.name);
      add(
        app,
        label,
        "cookies",
        joinAll(roaming, ["cookies.sqlite", "cookies.sqlite-wal", "cookies.sqlite-shm"]),
      );
    }
  }

  for (const source of APP_CACHES) {
    if (!env[source.base]) continue;
    const app = { id: source.id, name: source.name, kind: "app", process: source.process };
    add(app, "", "cache", joinAll(path.win32.join(env[source.base], source.dir), source.entries));
  }

  return targets;
}

function listRunningProcesses() {
  return new Promise((resolve) => {
    exec(
      "tasklist /FO CSV /NH",
      { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 * 4 },
      (err, stdout) => {
        if (err) {
          resolve(new Set());
          return;
        }
        const names = String(stdout)
          .split(/\r?\n/)
          .map((line) => line.match(/^"([^"]+)"/)?.[1]?.toLowerCase())
          .filter(Boolean);
        resolve(new Set(names));
      },
    );
  });
}

/** Resultado da última varredura: apagar só aceita IDs daqui, nunca caminhos vindos da UI. */
let lastScan = new Map();

async function scanCleanerTargets(env = process.env) {
  const running = await listRunningProcesses();
  const items = [];
  const next = new Map();
  for (const target of buildCleanerTargets(env)) {
    const measured = await measurePaths(target.paths, { sampleLimit: SAMPLE_LIMIT });
    if (measured.sizeBytes <= 0) continue;
    next.set(target.id, target);
    items.push({
      id: target.id,
      appId: target.appId,
      appName: target.appName,
      appKind: target.appKind,
      profile: target.profile,
      category: target.category,
      sizeBytes: measured.sizeBytes,
      fileCount: measured.fileCount,
      samples: measured.samples,
      running: running.has(target.process),
    });
  }
  lastScan = next;
  return items;
}

/** Cookies e histórico são bancos SQLite: apagar com o app aberto pode corrompê-los. */
const requiresClosedApp = (category) => category !== "cache";

async function cleanCleanerTargets(ids) {
  const running = await listRunningProcesses();
  const summary = { ok: true, freedBytes: 0, removed: 0, skipped: 0, blocked: [] };
  for (const id of Array.isArray(ids) ? ids : []) {
    const target = lastScan.get(String(id));
    if (!target) continue;
    if (requiresClosedApp(target.category) && running.has(target.process)) {
      summary.blocked.push(target.appName);
      continue;
    }
    const out = await removePaths(target.paths);
    summary.freedBytes += out.freedBytes;
    summary.removed += out.removed;
    summary.skipped += out.skipped;
  }
  summary.blocked = [...new Set(summary.blocked)];
  return summary;
}

/** Limpeza desassistida: só temporários antigos e caches. Cookies/histórico ficam de fora. */
async function runScheduledCleanup(env = process.env, { dryRun = false } = {}) {
  const totals = { freedBytes: 0, removed: 0, skipped: 0 };
  const merge = (out) => {
    totals.freedBytes += out.freedBytes;
    totals.removed += out.removed;
    totals.skipped += out.skipped;
  };

  const tempDirs = [env.TEMP, env.WINDIR && path.win32.join(env.WINDIR, "Temp")].filter(Boolean);
  merge(await removePaths(tempDirs, { olderThanMs: SCHEDULED_TEMP_MIN_AGE_MS, dryRun }));

  const running = await listRunningProcesses();
  for (const target of buildCleanerTargets(env)) {
    if (target.category !== "cache" || running.has(target.process)) continue;
    merge(await removePaths(target.paths, { dryRun }));
  }
  return totals;
}

module.exports = {
  buildCleanerTargets,
  cleanCleanerTargets,
  requiresClosedApp,
  runScheduledCleanup,
  scanCleanerTargets,
};
