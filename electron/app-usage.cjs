/*
 * Quando cada programa foi aberto pela última vez — para apontar apps
 * "encostados". O Windows guarda isso por usuário no registro (UserAssist:
 * programas abertos pelo Iniciar, Explorador ou atalhos), com o nome em ROT13
 * e a data no fim do valor. Não precisa de administrador.
 *
 * Limite honesto: programa que só roda em segundo plano ou é aberto por
 * outro app pode não aparecer; nesse caso a tela diz "uso não registrado",
 * nunca "sem uso".
 */
const path = require("path");
const { psFileJson } = require("./powershell.cjs");

/** Pastas conhecidas que o UserAssist grava como GUID no começo do caminho. */
const KNOWN_FOLDERS = Object.freeze({
  "{6d809377-6af0-444b-8957-a3773f02200e}": "ProgramFiles",
  "{7c5a40ef-a0fb-4bfc-874a-c0f2e0b9fa8e}": "ProgramFiles(x86)",
  "{f38bf404-1d43-42f2-9305-67de0b28fc23}": "WINDIR",
  "{1ac14e77-02e7-4e5d-b744-2eb1ae5198b7}": "SYSTEM32",
  "{d65231b0-b2f1-4857-a4ce-a8e7c6ea7d27}": "SYSWOW64",
  "{a77f5d77-2e2b-44c3-a6a2-aba601054a51}": "PROGRAMS",
});

const rot13 = (text) =>
  String(text).replace(/[a-z]/gi, (ch) => {
    const base = ch <= "Z" ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });

/** "{6D80…}\Foo\foo.exe" → "C:\Program Files\Foo\foo.exe" (minúsculo). */
function expandKnownFolder(raw, env) {
  const value = String(raw || "");
  const match = /^(\{[0-9a-f-]{36}\})(\\.*)?$/i.exec(value);
  if (!match) return value.toLowerCase();
  const key = KNOWN_FOLDERS[match[1].toLowerCase()];
  let base = "";
  if (key === "SYSTEM32") base = env.WINDIR && path.win32.join(env.WINDIR, "System32");
  else if (key === "SYSWOW64") base = env.WINDIR && path.win32.join(env.WINDIR, "SysWOW64");
  else if (key === "PROGRAMS") {
    base =
      env.APPDATA && path.win32.join(env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs");
  } else if (key) base = env[key];
  if (!base) return value.toLowerCase();
  return `${base}${match[2] || ""}`.toLowerCase();
}

const normalize = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/\(.*?\)|x64|x86|64-bit|32-bit/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Último uso do programa: entradas cujo .exe fica na pasta de instalação ou
 * cujo atalho do Iniciar tem o nome do programa. Devolve ms ou null.
 */
function lastUsedFor(program, entries) {
  const location = String(program.installLocation || "")
    .toLowerCase()
    .replace(/\\+$/, "");
  const name = normalize(program.name);
  let latest = 0;
  for (const entry of entries) {
    const p = entry.path;
    const insideLocation = location.length > 3 && p.startsWith(`${location}\\`);
    const shortcut =
      p.endsWith(".lnk") && name.length >= 3 && normalize(path.win32.basename(p, ".lnk")) === name;
    if ((insideLocation || shortcut) && entry.lastRun > latest) latest = entry.lastRun;
  }
  return latest || null;
}

const USERASSIST_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$out = New-Object System.Collections.ArrayList
$root = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist'
foreach ($guid in (Get-ChildItem -LiteralPath $root)) {
  $count = Get-Item -LiteralPath (Join-Path $guid.PSPath 'Count')
  if (-not $count) { continue }
  foreach ($name in $count.GetValueNames()) {
    $data = $count.GetValue($name)
    if (-not ($data -is [byte[]]) -or $data.Length -lt 68) { continue }
    $ft = [BitConverter]::ToInt64($data, 60)
    if ($ft -le 0) { continue }
    try { $when = [DateTime]::FromFileTimeUtc($ft) } catch { continue }
    [void]$out.Add(@{ n = $name; t = [int64](($when - [DateTime]'1970-01-01').TotalMilliseconds) })
  }
}
ConvertTo-Json -Compress -InputObject @($out)
`;

/** Entradas { path (expandido, minúsculo), lastRun (ms) } do usuário atual. */
async function readUsageEntries(env = process.env) {
  if (process.platform !== "win32") return [];
  const rows = await psFileJson(USERASSIST_SCRIPT, 30000);
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  return list
    .map((row) => ({
      path: expandKnownFolder(rot13(row?.n), env),
      lastRun: Number(row?.t) || 0,
    }))
    .filter((e) => e.lastRun > 0);
}

module.exports = { expandKnownFolder, lastUsedFor, readUsageEntries, rot13 };
