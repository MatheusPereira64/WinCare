/**
 * Coleta de métricas de CPU / memória / GPU para o dashboard e Monitoramento.
 * GPU AMD: contadores Windows + ADL PMLog (atiadlxx.dll) via collect-gpu.ps1
 * GPU NVIDIA: nvidia-smi (PATH ou pastas padrão)
 */
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let lastCpuSample = null;

function readCpuUsagePercent() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  if (!lastCpuSample || total <= lastCpuSample.total) {
    lastCpuSample = { idle, total };
    return null;
  }
  const idleDelta = idle - lastCpuSample.idle;
  const totalDelta = total - lastCpuSample.total;
  lastCpuSample = { idle, total };
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - idleDelta / totalDelta))));
}

function runCmd(file, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 4 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        resolve(String(stdout || "").trim());
      },
    );
  });
}

function runPowerShellFile(scriptPath, timeoutMs = 12000) {
  return runCmd(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    timeoutMs,
  );
}

function runPowerShellEncoded(script, timeoutMs = 8000) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return runCmd(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    timeoutMs,
  );
}

async function collectCpuTempC() {
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    "$row = Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation | Select-Object -First 1",
    "if ($null -eq $row) { '' } else {",
    "  $raw = if ($row.HighPrecisionTemperature -gt 0) { $row.HighPrecisionTemperature / 10.0 } else { [double]$row.Temperature }",
    "  # Contador Windows: valor tipicamente em décimos de Kelvin",
    "  $c = [math]::Round($raw - 273.15)",
    "  if ($c -lt 1 -or $c -gt 120) { '' } else { $c }",
    "}",
  ].join("\n");
  const out = await runPowerShellEncoded(script);
  if (!out) return null;
  const n = Number(String(out).trim());
  if (!Number.isFinite(n) || n < 1 || n > 120) return null;
  return Math.round(n);
}

function resolveNvidiaSmi() {
  const candidates = [
    "nvidia-smi",
    path.join(process.env.ProgramFiles || "C:\\Program Files", "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"),
    path.join(process.env.SystemRoot || "C:\\Windows", "System32", "nvidia-smi.exe"),
  ];
  for (const candidate of candidates) {
    if (candidate === "nvidia-smi") continue;
    if (fs.existsSync(candidate)) return candidate;
  }
  return "nvidia-smi";
}

async function collectNvidiaGpu() {
  const smi = resolveNvidiaSmi();
  const out = await runCmd(smi, [
    "--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total",
    "--format=csv,noheader,nounits",
  ]);
  if (!out) return null;
  const line = out.split(/\r?\n/).find(Boolean);
  if (!line) return null;
  const parts = line.split(",").map((p) => p.trim());
  if (parts.length < 5) return null;
  const usage = Number(parts[1]);
  const temp = Number(parts[2]);
  const memUsed = Number(parts[3]);
  const memTotal = Number(parts[4]);
  return {
    name: parts[0] || "NVIDIA GPU",
    usage: Number.isFinite(usage) ? Math.max(0, Math.min(100, Math.round(usage))) : null,
    temperature: Number.isFinite(temp) && temp > 0 ? Math.round(temp) : null,
    memoryUsedMb: Number.isFinite(memUsed) ? Math.round(memUsed) : null,
    memoryTotalMb: Number.isFinite(memTotal) && memTotal > 0 ? Math.round(memTotal) : null,
  };
}

function parseGpuJson(raw) {
  if (!raw) return null;
  // Pode vir com BOM / lixo CLIXML — pega o último objeto JSON da saída.
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed || (parsed.name == null && parsed.usage == null && parsed.temperature == null)) {
      return null;
    }
    return {
      name: parsed.name || "GPU",
      usage:
        typeof parsed.usage === "number"
          ? Math.max(0, Math.min(100, Math.round(parsed.usage)))
          : null,
      temperature:
        typeof parsed.temperature === "number" && parsed.temperature > 0
          ? Math.round(parsed.temperature)
          : null,
      memoryUsedMb:
        typeof parsed.memoryUsedMb === "number" ? Math.round(parsed.memoryUsedMb) : null,
      memoryTotalMb:
        typeof parsed.memoryTotalMb === "number" && parsed.memoryTotalMb > 0
          ? Math.round(parsed.memoryTotalMb)
          : null,
    };
  } catch {
    return null;
  }
}

async function collectAmdOrWindowsGpu() {
  const scriptPath = path.join(__dirname, "collect-gpu.ps1");
  if (!fs.existsSync(scriptPath)) return null;
  const out = await runPowerShellFile(scriptPath, 15000);
  return parseGpuJson(out);
}

async function collectGpuMetrics() {
  const nvidia = await collectNvidiaGpu();
  if (nvidia && (nvidia.usage != null || nvidia.temperature != null || nvidia.name)) {
    // Preferir NVIDIA se nvidia-smi responder; senão tenta AMD/Windows.
    if (nvidia.temperature != null || nvidia.usage != null) return nvidia;
  }
  const windowsOrAmd = await collectAmdOrWindowsGpu();
  if (windowsOrAmd) return windowsOrAmd;
  return nvidia;
}

/**
 * Complementa SystemInfo com uso/temperatura de CPU/GPU e memória usada.
 * @param {object} base
 * @param {{ cpuFromWmi?: number|null }} [opts]
 */
async function enrichSystemInfo(base, opts = {}) {
  const cpuFromNode = readCpuUsagePercent();
  const cpuUsage =
    typeof cpuFromNode === "number"
      ? cpuFromNode
      : typeof opts.cpuFromWmi === "number"
        ? opts.cpuFromWmi
        : base.cpuUsage ?? 0;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memoryUsedGb = Math.round(((totalMem - freeMem) / 1024 ** 3) * 10) / 10;
  const memoryTotalGb =
    typeof base.memoryTotalGb === "number"
      ? base.memoryTotalGb
      : Math.round(totalMem / 1024 ** 3);
  const memoryUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);

  const [cpuTemperature, gpu] = await Promise.all([collectCpuTempC(), collectGpuMetrics()]);

  const gpuMemoryUsage =
    gpu?.memoryUsedMb != null && gpu?.memoryTotalMb
      ? Math.round((gpu.memoryUsedMb / gpu.memoryTotalMb) * 100)
      : null;

  const next = {
    ...base,
    cpuUsage,
    memoryUsage,
    memoryTotalGb,
    memoryUsedGb,
    cpuTemperature: cpuTemperature ?? null,
    memoryTemperature: null,
    gpuName: gpu?.name ?? null,
    gpuUsage: gpu?.usage ?? null,
    gpuTemperature: gpu?.temperature ?? null,
    gpuMemoryUsedMb: gpu?.memoryUsedMb ?? null,
    gpuMemoryTotalMb: gpu?.memoryTotalMb ?? null,
    gpuMemoryUsage,
  };

  const diskUsage = typeof next.diskUsage === "number" ? next.diskUsage : 0;
  next.health = Math.max(
    0,
    Math.round(
      100 -
        next.cpuUsage * 0.2 -
        next.memoryUsage * 0.2 -
        Math.max(0, diskUsage - 70) * 1.2 -
        (typeof next.gpuUsage === "number" ? next.gpuUsage * 0.05 : 0),
    ),
  );

  return next;
}

module.exports = {
  readCpuUsagePercent,
  collectCpuTempC,
  collectGpuMetrics,
  enrichSystemInfo,
};
