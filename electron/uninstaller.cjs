const { app, shell } = require("electron");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { measurePaths } = require("./file-walker.cjs");
const { isWindowsAdmin, psElevatedJson, psFileJson, psQuote } = require("./powershell.cjs");

const UNINSTALL_TIMEOUT_MS = 30 * 60 * 1000;

/* Nomes genéricos demais para concluir que a pasta pertence ao programa removido. */
const GENERIC_NAMES = new Set([
  "adobe",
  "app",
  "apps",
  "application",
  "applications",
  "bin",
  "cache",
  "common",
  "common files",
  "components",
  "config",
  "data",
  "default",
  "drivers",
  "files",
  "google",
  "intel",
  "local",
  "logs",
  "microsoft",
  "mozilla",
  "nvidia",
  "packages",
  "program",
  "programs",
  "roaming",
  "setup",
  "shared",
  "software",
  "system",
  "system32",
  "temp",
  "tools",
  "uninstall",
  "update",
  "updater",
  "users",
  "windows",
  "wow6432node",
]);

/* Componentes dos quais outros programas costumam depender. */
const CRITICAL_PROGRAM =
  /visual c\+\+|\.net( |$)|directx|windows (sdk|driver)|runtime|redistributable|driver/i;

const normalizeName = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

/** "7-Zip 23.01 (x64)" → "7-Zip". Remove versão, arquitetura e sufixos de edição. */
function stripVersionSuffix(name) {
  return String(name || "")
    .replace(/\s*\((x64|x86|64-bit|32-bit|[^)]*\d[^)]*)\)\s*/gi, " ")
    .replace(/\s+v?\d+(\.\d+)*\S*\s*$/i, "")
    .replace(/\s+(x64|x86|64-bit|32-bit)\s*$/i, "")
    .trim();
}

function nameVariants(name) {
  const stripped = stripVersionSuffix(name);
  const variants = [name, stripped, stripped.replace(/\s+/g, "")]
    .map((v) => String(v || "").trim())
    .filter((v) => v.length >= 3 && !GENERIC_NAMES.has(v.toLowerCase()) && !/[\\/:*?"<>|]/.test(v));
  return [...new Set(variants)];
}

function publisherVariants(publisher) {
  const base = String(publisher || "").trim();
  if (!base) return [];
  const short = base
    .replace(/[,.]?\s+(inc|llc|ltd|gmbh|corp|corporation|co|company|s\.?a\.?|ltda)\.?$/i, "")
    .trim();
  return [...new Set([base, short])].filter(
    (v) => v.length >= 3 && !GENERIC_NAMES.has(v.toLowerCase()) && !/[\\/:*?"<>|]/.test(v),
  );
}

const lowerResolve = (p) =>
  path.win32
    .normalize(String(p))
    .replace(/[\\/]+$/, "")
    .toLowerCase();

const isInside = (child, parent) => child === parent || child.startsWith(`${parent}\\`);

/** Pastas que nunca podem ser removidas, mesmo que correspondam ao nome de um programa. */
function isProtectedPath(target, env) {
  const p = lowerResolve(target);
  if (!/^[a-z]:\\.+/.test(p)) return true;
  const systemDrive = String(env.SystemDrive || "C:").toLowerCase();
  const depth = p.split("\\").length - 1;
  if (p.startsWith(systemDrive) && depth < 2) return true;

  const windowsDir = env.WINDIR && lowerResolve(env.WINDIR);
  if (windowsDir && isInside(p, windowsDir)) return true;
  if (/\\windowsapps(\\|$)/.test(p)) return true;

  const exact = [
    env.ProgramFiles,
    env["ProgramFiles(x86)"],
    env.ProgramW6432,
    env.ProgramData,
    env.USERPROFILE,
    env.PUBLIC,
    env.APPDATA,
    env.LOCALAPPDATA,
    env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, "Programs"),
    env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, "Temp"),
    env.APPDATA && path.win32.join(env.APPDATA, "Microsoft"),
    env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, "Microsoft"),
    env.ProgramData && path.win32.join(env.ProgramData, "Microsoft"),
    env.USERPROFILE && path.win32.join(env.USERPROFILE, "AppData"),
    env.USERPROFILE && path.win32.join(env.USERPROFILE, "Desktop"),
    env.USERPROFILE && path.win32.join(env.USERPROFILE, "Documents"),
    env.USERPROFILE && path.win32.join(env.USERPROFILE, "Downloads"),
    `${systemDrive}\\users`,
  ]
    .filter(Boolean)
    .map(lowerResolve);
  if (exact.includes(p)) return true;

  for (const root of [env.ProgramFiles, env["ProgramFiles(x86)"]].filter(Boolean)) {
    if (isInside(p, path.win32.join(lowerResolve(root), "common files"))) return true;
    if (isInside(p, path.win32.join(lowerResolve(root), "windows defender"))) return true;
  }
  return false;
}

/** Chaves de registro nunca removidas: raízes e árvores do Windows/Microsoft. */
function isProtectedRegistryKey(key) {
  const k = String(key).replace(/\\+$/, "").toLowerCase();
  const match = k.match(/^(hkcu|hklm)\\software(?:\\wow6432node)?\\(.+)$/);
  if (!match) return true;
  const segments = match[2].split("\\");
  if (segments.some((s) => !s || s === "..")) return true;
  if (k.includes("\\microsoft\\windows\\currentversion\\uninstall\\")) return false;
  if (GENERIC_NAMES.has(segments[0]) && segments.length === 1) return true;
  return segments[0] === "microsoft" || segments[0] === "classes" || segments[0] === "policies";
}

/** Separa executável e argumentos de um UninstallString. */
function parseCommandLine(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.startsWith('"')) {
    const end = value.indexOf('"', 1);
    if (end <= 1) return null;
    return { file: value.slice(1, end), args: value.slice(end + 1).trim() };
  }
  const match = value.match(/^(.*?\.(?:exe|cmd|bat|com))(?:\s+(.*))?$/i);
  if (match) return { file: match[1], args: (match[2] || "").trim() };
  const [file, ...rest] = value.split(/\s+/);
  return { file, args: rest.join(" ") };
}

/** Candidatos conservadores: só correspondência exata de nome (ou Fabricante\Nome). */
function buildLeftoverCandidates(program, env) {
  const names = nameVariants(program.name);
  const publishers = publisherVariants(program.publisher);
  const folders = new Map();
  const keys = new Map();

  const roots = [
    { base: env.ProgramFiles, admin: true },
    { base: env["ProgramFiles(x86)"], admin: true },
    { base: env.ProgramData, admin: true },
    { base: env.LOCALAPPDATA, admin: false },
    { base: env.APPDATA, admin: false },
    { base: env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, "Programs"), admin: false },
    {
      base: env.APPDATA && path.win32.join(env.APPDATA, "Microsoft/Windows/Start Menu/Programs"),
      admin: false,
    },
    {
      base:
        env.ProgramData &&
        path.win32.join(env.ProgramData, "Microsoft/Windows/Start Menu/Programs"),
      admin: true,
    },
  ].filter((r) => r.base);

  for (const root of roots) {
    for (const name of names) {
      const direct = path.win32.join(root.base, name);
      folders.set(direct.toLowerCase(), {
        path: direct,
        requiresAdmin: root.admin,
        reason: "Pasta com o nome do programa",
      });
      for (const publisher of publishers) {
        const nested = path.win32.join(root.base, publisher, name);
        folders.set(nested.toLowerCase(), {
          path: nested,
          requiresAdmin: root.admin,
          reason: "Pasta do fabricante",
        });
      }
    }
  }

  if (program.installLocation) {
    const location = path.win32.normalize(program.installLocation);
    const base = normalizeName(path.win32.basename(location));
    const matches = names.some((n) => {
      const norm = normalizeName(n);
      return base.length >= 3 && (base.includes(norm) || norm.includes(base));
    });
    if (matches) {
      folders.set(location.toLowerCase().replace(/\\+$/, ""), {
        path: location.replace(/\\+$/, ""),
        requiresAdmin: isAdminFolder(location, env),
        reason: "Pasta de instalação informada pelo programa",
      });
    }
  }

  const hives = ["HKCU\\Software", "HKLM\\Software", "HKLM\\Software\\WOW6432Node"];
  for (const hive of hives) {
    for (const name of names) {
      const direct = `${hive}\\${name}`;
      keys.set(direct.toLowerCase(), {
        path: direct,
        requiresAdmin: hive.startsWith("HKLM"),
        reason: "Configurações do programa",
      });
      for (const publisher of publishers) {
        const nested = `${hive}\\${publisher}\\${name}`;
        keys.set(nested.toLowerCase(), {
          path: nested,
          requiresAdmin: hive.startsWith("HKLM"),
          reason: "Configurações do programa",
        });
      }
    }
  }

  return { folders: [...folders.values()], keys: [...keys.values()] };
}

function isAdminFolder(folder, env) {
  const p = lowerResolve(folder);
  const userRoots = [env.LOCALAPPDATA, env.APPDATA, env.USERPROFILE]
    .filter(Boolean)
    .map(lowerResolve);
  return !userRoots.some((root) => isInside(p, root));
}

/** Pasta compartilhada com outro programa ainda instalado não é resíduo. */
function isUsedByOtherProgram(folder, program, others) {
  const p = lowerResolve(folder);
  const baseName = normalizeName(path.win32.basename(p));
  return others.some((other) => {
    if (other.id === program.id) return false;
    if (normalizeName(stripVersionSuffix(other.name)) === baseName) return true;
    if (!other.installLocation) return false;
    const location = lowerResolve(other.installLocation);
    return isInside(location, p) || isInside(p, location);
  });
}

let programsById = new Map();
let leftoversById = new Map();

const LIST_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$roots = @(
  @{ hive = 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'; path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'; scope = 'machine' },
  @{ hive = 'HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; path = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; scope = 'machine' },
  @{ hive = 'HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall'; path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'; scope = 'user' }
)
$items = @()
foreach ($root in $roots) {
  foreach ($key in (Get-ChildItem -Path $root.path)) {
    $p = Get-ItemProperty -LiteralPath $key.PSPath
    if (-not $p.DisplayName -or -not $p.UninstallString) { continue }
    if ($p.SystemComponent -eq 1 -or $p.ParentKeyName) { continue }
    if ($p.ReleaseType -match 'Update|Hotfix') { continue }
    $items += [ordered]@{
      registryKey = ($root.hive + '\' + $key.PSChildName)
      name = [string]$p.DisplayName
      publisher = [string]$p.Publisher
      version = [string]$p.DisplayVersion
      installDate = [string]$p.InstallDate
      sizeKb = [double]$p.EstimatedSize
      installLocation = [string]$p.InstallLocation
      displayIcon = [string]$p.DisplayIcon
      uninstallString = [string]$p.UninstallString
      scope = $root.scope
    }
  }
}
,@($items) | ConvertTo-Json -Compress -Depth 3
`;

function formatInstallDate(raw) {
  const m = String(raw || "").match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

async function loadIcon(displayIcon) {
  const iconPath = String(displayIcon || "")
    .replace(/^"|"$/g, "")
    .replace(/,-?\d+$/, "")
    .replace(/^"|"$/g, "");
  if (!/\.(exe|ico|dll)$/i.test(iconPath) || !fs.existsSync(iconPath)) return null;
  try {
    const icon = await app.getFileIcon(iconPath, { size: "normal" });
    return icon.isEmpty() ? null : icon.toDataURL();
  } catch {
    return null;
  }
}

async function listInstalledPrograms() {
  const rows = await psFileJson(LIST_SCRIPT, 60000);
  const seen = new Set();
  const next = new Map();
  const list = [];
  for (const row of Array.isArray(rows) ? rows : rows ? [rows] : []) {
    if (!row?.name || !row.registryKey) continue;
    const dedupe = `${row.name}|${row.version}`.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const program = {
      id: row.registryKey,
      name: row.name,
      publisher: row.publisher || "",
      version: row.version || "",
      installDate: formatInstallDate(row.installDate),
      sizeBytes: Math.max(0, Number(row.sizeKb) || 0) * 1024,
      installLocation: row.installLocation || "",
      scope: row.scope === "user" ? "user" : "machine",
      critical: CRITICAL_PROGRAM.test(row.name),
      displayIcon: row.displayIcon || "",
      uninstallString: row.uninstallString,
      registryKey: row.registryKey,
    };
    next.set(program.id, program);
    list.push(program);
  }
  programsById = next;

  const publicList = [];
  for (let i = 0; i < list.length; i += 8) {
    const batch = list.slice(i, i + 8);
    const icons = await Promise.all(batch.map((p) => loadIcon(p.displayIcon)));
    batch.forEach((program, index) => publicList.push(toPublicProgram(program, icons[index])));
  }
  return publicList.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function toPublicProgram(program, icon) {
  return {
    id: program.id,
    name: program.name,
    publisher: program.publisher,
    version: program.version,
    installDate: program.installDate,
    sizeBytes: program.sizeBytes,
    installLocation: program.installLocation,
    scope: program.scope,
    critical: program.critical,
    icon: icon || null,
  };
}

const registryKeyExists = (key) =>
  new Promise((resolve) => {
    exec(
      `reg query "${String(key).replace(/"/g, "")}" /ve`,
      { windowsHide: true, timeout: 8000 },
      (err) => resolve(!err),
    );
  });

function resolveUninstaller(program) {
  const parsed = parseCommandLine(program.uninstallString);
  if (!parsed) return null;
  const file = parsed.file.replace(/%([^%]+)%/g, (whole, name) => process.env[name] ?? whole);
  return { file, args: parsed.args };
}

/** Abre o desinstalador do próprio programa e aguarda terminar. Nunca usa modo silencioso. */
async function runUninstaller(id) {
  const program = programsById.get(String(id));
  if (!program) return { ok: false, reason: "not-found" };
  const command = resolveUninstaller(program);
  if (!command) return { ok: false, reason: "no-uninstaller" };

  const onPath = !/[\\/]/.test(command.file);
  if (!onPath && !fs.existsSync(command.file)) {
    return { ok: false, reason: "uninstaller-missing" };
  }

  const elevate = program.scope === "machine" && !(await isWindowsAdmin());
  const args = command.args ? `-ArgumentList ${psQuote(command.args)}` : "";
  const script = `
$ErrorActionPreference = 'Stop'
try {
  $p = Start-Process -FilePath ${psQuote(command.file)} ${args} ${elevate ? "-Verb RunAs" : ""} -Wait -PassThru
  @{ ok = $true; exitCode = $p.ExitCode } | ConvertTo-Json -Compress
} catch {
  @{ ok = $false; reason = 'cancelled'; message = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
  const out = await psFileJson(script, UNINSTALL_TIMEOUT_MS).catch((error) => ({
    ok: false,
    reason: "failed",
    message: error instanceof Error ? error.message : "Falha ao abrir o desinstalador.",
  }));
  return { ...out, stillInstalled: await registryKeyExists(program.registryKey) };
}

/** Só procura resíduos depois que o programa saiu do registro (ou o desinstalador sumiu). */
async function scanLeftovers(id, env = process.env) {
  const program = programsById.get(String(id));
  if (!program) return { ok: false, reason: "not-found", items: [] };

  const keyExists = await registryKeyExists(program.registryKey);
  const command = resolveUninstaller(program);
  const uninstallerMissing =
    !command || (/[\\/]/.test(command.file) && !fs.existsSync(command.file));
  if (keyExists && !uninstallerMissing) {
    return { ok: false, reason: "still-installed", items: [] };
  }

  const others = [...programsById.values()];
  const candidates = buildLeftoverCandidates(program, env);
  const items = [];
  const next = new Map();
  const add = (item) => {
    const id = `lo-${next.size + 1}`;
    next.set(id, item);
    items.push({ id, ...item });
  };

  for (const folder of candidates.folders) {
    if (isProtectedPath(folder.path, env)) continue;
    if (!fs.existsSync(folder.path)) continue;
    if (isUsedByOtherProgram(folder.path, program, others)) continue;
    const measured = await measurePaths([folder.path]);
    add({
      kind: "folder",
      ...folder,
      sizeBytes: measured.sizeBytes,
      fileCount: measured.fileCount,
    });
  }

  for (const key of candidates.keys) {
    if (isProtectedRegistryKey(key.path)) continue;
    if (await registryKeyExists(key.path)) {
      add({ kind: "registry", ...key, sizeBytes: 0, fileCount: 0 });
    }
  }

  if (keyExists) {
    add({
      kind: "registry",
      path: program.registryKey,
      requiresAdmin: program.registryKey.startsWith("HKLM"),
      reason: "Entrada órfã na lista de programas",
      sizeBytes: 0,
      fileCount: 0,
    });
  }

  leftoversById = next;
  return { ok: true, items };
}

const backupDir = () => path.join(app.getPath("userData"), "registry-backups");

/** Pasta do usuário → Lixeira; pasta de sistema → elevada e permanente; registro → .reg de backup antes. */
async function removeLeftovers(ids, env = process.env) {
  const selected = (Array.isArray(ids) ? ids : [])
    .map((id) => leftoversById.get(String(id)))
    .filter(Boolean);
  const result = { ok: true, removed: 0, freedBytes: 0, failed: [], backupDir: null };
  const admin = await isWindowsAdmin();
  const elevatedScript = [];

  fs.mkdirSync(backupDir(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = (index) => path.join(backupDir(), `${stamp}-${index}.reg`);

  let index = 0;
  for (const item of selected) {
    index += 1;
    if (item.kind === "folder") {
      if (isProtectedPath(item.path, env)) {
        result.failed.push({ path: item.path, reason: "Pasta protegida" });
        continue;
      }
      if (item.requiresAdmin && !admin) {
        elevatedScript.push(
          `try { Remove-Item -LiteralPath ${psQuote(item.path)} -Recurse -Force -ErrorAction Stop; $done += ${psQuote(item.path)} } catch { $fail += @{ path = ${psQuote(item.path)}; reason = $_.Exception.Message } }`,
        );
        continue;
      }
      try {
        await shell.trashItem(item.path);
        result.removed += 1;
        result.freedBytes += item.sizeBytes;
      } catch (error) {
        result.failed.push({
          path: item.path,
          reason: error instanceof Error ? error.message : "Falha",
        });
      }
      continue;
    }

    if (isProtectedRegistryKey(item.path)) {
      result.failed.push({ path: item.path, reason: "Chave protegida" });
      continue;
    }
    const backup = psQuote(backupFile(index));
    const key = psQuote(item.path);
    const deletion = `& reg.exe export ${key} ${backup} /y | Out-Null; if ($LASTEXITCODE -ne 0) { $fail += @{ path = ${key}; reason = 'Backup do registro falhou' } } else { & reg.exe delete ${key} /f | Out-Null; if ($LASTEXITCODE -eq 0) { $done += ${key} } else { $fail += @{ path = ${key}; reason = 'Falha ao remover a chave' } } }`;
    if (item.requiresAdmin && !admin) {
      elevatedScript.push(deletion);
    } else {
      const out = await psFileJson(
        `$done = @(); $fail = @(); ${deletion}\r\n@{ done = $done.Count; fail = @($fail) } | ConvertTo-Json -Compress -Depth 3`,
        30000,
      ).catch(() => ({ done: 0, fail: [{ path: item.path, reason: "Falha ao remover a chave" }] }));
      result.removed += Number(out.done) || 0;
      result.failed.push(...(Array.isArray(out.fail) ? out.fail : out.fail ? [out.fail] : []));
    }
  }

  if (elevatedScript.length) {
    const body = `$done = @(); $fail = @()\r\n${elevatedScript.join("\r\n")}\r\n@{ ok = $true; done = @($done); fail = @($fail) } | ConvertTo-Json -Compress -Depth 3`;
    const out = await psElevatedJson(body, 300000);
    if (out?.ok) {
      const done = Array.isArray(out.done) ? out.done : out.done ? [out.done] : [];
      result.removed += done.length;
      const donePaths = new Set(done);
      result.freedBytes += selected
        .filter((i) => i.kind === "folder" && donePaths.has(i.path))
        .reduce((sum, i) => sum + i.sizeBytes, 0);
      result.failed.push(...(Array.isArray(out.fail) ? out.fail : out.fail ? [out.fail] : []));
    } else {
      result.failed.push({
        path: "Itens de sistema",
        reason: "Permissão de administrador negada ou cancelada.",
      });
    }
  }

  if (selected.some((i) => i.kind === "registry")) result.backupDir = backupDir();
  result.ok = result.failed.length === 0;
  return result;
}

module.exports = {
  buildLeftoverCandidates,
  isProtectedPath,
  isProtectedRegistryKey,
  isUsedByOtherProgram,
  listInstalledPrograms,
  nameVariants,
  parseCommandLine,
  removeLeftovers,
  runUninstaller,
  scanLeftovers,
  stripVersionSuffix,
};
