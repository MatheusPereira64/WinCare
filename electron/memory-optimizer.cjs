const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const logger = require("./logger.cjs");

function snapshotRam() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  return {
    totalMb: Math.round(total / 1024 / 1024),
    usedMb: Math.round(used / 1024 / 1024),
    freeMb: Math.round(free / 1024 / 1024),
    usagePct: total > 0 ? Math.round((used / total) * 100) : 0,
  };
}

const PS_BODY = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "Add-Type -TypeDefinition @'",
  "using System;",
  "using System.Runtime.InteropServices;",
  "public static class WinCareRam {",
  "  const uint ACCESS = 0x1500;",
  "  [DllImport(\"psapi.dll\")] static extern bool EmptyWorkingSet(IntPtr h);",
  "  [DllImport(\"kernel32.dll\")] static extern IntPtr OpenProcess(uint a, bool i, int p);",
  "  [DllImport(\"kernel32.dll\")] static extern bool CloseHandle(IntPtr h);",
  "  [DllImport(\"kernel32.dll\")] static extern IntPtr GetCurrentProcess();",
  "  [DllImport(\"ntdll.dll\")] static extern int NtSetSystemInformation(int c, ref int i, int l);",
  "  [DllImport(\"advapi32.dll\", SetLastError=true)] static extern bool OpenProcessToken(IntPtr p, uint a, out IntPtr t);",
  "  [DllImport(\"advapi32.dll\", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool LookupPrivilegeValue(string s, string n, out LUID l);",
  "  [DllImport(\"advapi32.dll\", SetLastError=true)] static extern bool AdjustTokenPrivileges(IntPtr t, bool d, ref TOKEN_PRIVILEGES n, int bl, IntPtr p, IntPtr r);",
  "  [StructLayout(LayoutKind.Sequential)] struct LUID { public uint Low; public int High; }",
  "  [StructLayout(LayoutKind.Sequential)] struct TOKEN_PRIVILEGES { public int Count; public LUID Luid; public int Attr; }",
  "  public static bool Trim(int pid) {",
  "    IntPtr h = OpenProcess(ACCESS, false, pid);",
  "    if (h == IntPtr.Zero) return false;",
  "    bool ok = EmptyWorkingSet(h);",
  "    CloseHandle(h);",
  "    return ok;",
  "  }",
  "  static bool Priv(string name) {",
  "    IntPtr tok;",
  "    if (!OpenProcessToken(GetCurrentProcess(), 0x28, out tok)) return false;",
  "    LUID luid; TOKEN_PRIVILEGES tp = new TOKEN_PRIVILEGES();",
  "    tp.Count = 1; tp.Attr = 2;",
  "    if (!LookupPrivilegeValue(null, name, out luid)) { CloseHandle(tok); return false; }",
  "    tp.Luid = luid;",
  "    bool ok = AdjustTokenPrivileges(tok, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);",
  "    CloseHandle(tok);",
  "    return ok;",
  "  }",
  "  public static bool PurgeStandby() {",
  "    Priv(\"SeIncreaseQuotaPrivilege\");",
  "    Priv(\"SeProfileSingleProcessPrivilege\");",
  "    int cmd = 4;",
  "    return NtSetSystemInformation(80, ref cmd, 4) == 0;",
  "  }",
  "}",
  "'@",
  "$skip = [string[]]@('idle','system','registry','smss','csrss','wininit','services','lsass','winlogon','secure system','memory compression')",
  "$trimmed = 0; $skipped = 0",
  "Get-Process -ErrorAction SilentlyContinue | ForEach-Object {",
  "  $n = ([string]$_.ProcessName).ToLowerInvariant()",
  "  if ($skip -contains $n) { $skipped++; return }",
  "  try { if ([WinCareRam]::Trim($_.Id)) { $trimmed++ } else { $skipped++ } } catch { $skipped++ }",
  "}",
  "$standby = $false",
  "try { $standby = [WinCareRam]::PurgeStandby() } catch { $standby = $false }",
  "@{ trimmed = $trimmed; skipped = $skipped; standbyPurged = [bool]$standby } | ConvertTo-Json -Compress",
].join("\n");

function runPs(scriptBody, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ps1 = path.join(
      os.tmpdir(),
      `wincare-ram-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`,
    );
    fs.writeFileSync(ps1, scriptBody, "utf8");
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`,
      { maxBuffer: 1024 * 1024, timeout: timeoutMs, windowsHide: true },
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
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function optimizeMemory() {
  if (process.platform !== "win32") {
    return {
      ok: false,
      reason: "unsupported",
      message: "A otimização de memória só está disponível no Windows.",
    };
  }

  const before = snapshotRam();
  let trimmed = 0;
  let skipped = 0;
  let standbyPurged = false;

  try {
    const details = (await runPs(PS_BODY, 25000)) || {};
    trimmed = Number(details.trimmed) || 0;
    skipped = Number(details.skipped) || 0;
    standbyPurged = !!details.standbyPurged;
  } catch (error) {
    logger.error("memory", "optimizeMemory", error instanceof Error ? error.message : error);
    return {
      ok: false,
      reason: "failed",
      message: error instanceof Error ? error.message : "Falha ao otimizar a memória.",
      before,
      after: snapshotRam(),
      freedMb: 0,
      trimmed: 0,
      skipped: 0,
      standbyPurged: false,
    };
  }

  await delay(450);
  const after = snapshotRam();
  const freedMb = Math.max(0, before.usedMb - after.usedMb);

  logger.log("memory", "optimizeMemory ok", { freedMb, trimmed, standbyPurged });

  return {
    ok: true,
    before,
    after,
    freedMb,
    trimmed,
    skipped,
    standbyPurged,
    message:
      freedMb > 0
        ? `Liberou cerca de ${freedMb} MB de RAM.`
        : "Otimização concluída. A RAM em uso não caiu de forma visível neste momento.",
  };
}

module.exports = { optimizeMemory, snapshotRam };
