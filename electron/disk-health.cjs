/*
 * Saúde dos discos físicos.
 * - Sem admin: Get-PhysicalDisk (status geral do Windows) + letras de cada disco.
 * - Com admin (botão "Ver detalhes"): contadores SMART do Windows
 *   (Get-StorageReliabilityCounter: temperatura, desgaste, horas ligado,
 *   erros) e o aviso de falha prevista (MSStorageDriver_FailurePredictStatus).
 * A avaliação (assessDisk) é pura e testada em electron/tests/features.test.cjs.
 */
const { psAdminJson, psFileJson } = require("./powershell.cjs");

const BASIC_SCRIPT = `
$letters = @{}
try {
  Get-Partition -ErrorAction Stop | Where-Object { $_.DriveLetter } | ForEach-Object {
    $k = [string]$_.DiskNumber
    if (-not $letters.ContainsKey($k)) { $letters[$k] = @() }
    $letters[$k] += "$($_.DriveLetter):"
  }
} catch {}
@(Get-PhysicalDisk | ForEach-Object {
  [pscustomobject]@{
    id = [string]$_.DeviceId
    model = [string]$_.FriendlyName
    media = [string]$_.MediaType
    bus = [string]$_.BusType
    health = [string]$_.HealthStatus
    operational = @($_.OperationalStatus | ForEach-Object { [string]$_ }) -join ', '
    sizeBytes = [double]$_.Size
    letters = @($letters[[string]$_.DeviceId])
  }
}) | ConvertTo-Json -Compress -Depth 3
`;

const DETAIL_SCRIPT = `
$counters = @(Get-PhysicalDisk | ForEach-Object {
  $d = $_
  try {
    $r = $d | Get-StorageReliabilityCounter -ErrorAction Stop
    [pscustomobject]@{
      id = [string]$d.DeviceId
      temperature = $r.Temperature
      temperatureMax = $r.TemperatureMax
      wear = $r.Wear
      powerOnHours = $r.PowerOnHours
      readErrors = $r.ReadErrorsUncorrected
      writeErrors = $r.WriteErrorsUncorrected
      startStops = $r.StartStopCycleCount
    }
  } catch { [pscustomobject]@{ id = [string]$d.DeviceId } }
})
$predict = 0
try {
  $predict = @(Get-CimInstance -Namespace root\\wmi -ClassName MSStorageDriver_FailurePredictStatus -ErrorAction Stop |
    Where-Object { $_.PredictFailure }).Count
} catch {}
[pscustomobject]@{ ok = $true; counters = $counters; predictFailures = $predict } | ConvertTo-Json -Compress -Depth 4
`;

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Último resultado com detalhes (fica até o app fechar: pedir UAC uma vez só). */
let lastDetail = null;

function normalizeBasic(raw) {
  return asList(raw).map((d) => {
    const media =
      /ssd/i.test(d.media) || /nvme/i.test(d.bus) ? "SSD" : /hdd/i.test(d.media) ? "HDD" : null;
    return {
      id: String(d.id ?? ""),
      model: String(d.model || "Disco").trim(),
      media,
      bus: d.bus ? String(d.bus) : null,
      health: String(d.health || "Unknown"),
      operational: d.operational ? String(d.operational) : null,
      sizeBytes: num(d.sizeBytes) ?? 0,
      letters: asList(d.letters)
        .map(String)
        .filter((l) => /^[A-Z]:$/.test(l)),
    };
  });
}

function mergeDetail(disks, detail) {
  if (!detail?.ok) return disks;
  const byId = new Map(asList(detail.counters).map((c) => [String(c.id), c]));
  return disks.map((d) => {
    const c = byId.get(d.id);
    if (!c) return d;
    return {
      ...d,
      smart: {
        temperature: num(c.temperature) || null, // 0 = sem sensor
        temperatureMax: num(c.temperatureMax) || null,
        wear: num(c.wear),
        powerOnHours: num(c.powerOnHours),
        readErrors: num(c.readErrors),
        writeErrors: num(c.writeErrors),
      },
    };
  });
}

/**
 * Avalia um disco: { level: "good" | "warn" | "bad" | "unknown", notes: [] }.
 * `predictFailure`: o Windows avisou que algum disco vai falhar.
 */
function assessDisk(disk, { predictFailure = false } = {}) {
  const notes = [];
  let level = "good";
  const raise = (to, note) => {
    const rank = { good: 0, unknown: 0, warn: 1, bad: 2 };
    if (rank[to] > rank[level]) level = to;
    notes.push({ level: to, text: note });
  };
  const health = String(disk.health || "").toLowerCase();
  if (health === "unhealthy") {
    raise("bad", "O Windows marcou este disco como com defeito. Faça backup agora.");
  } else if (health === "warning") {
    raise("warn", "O Windows encontrou problemas neste disco. Faça backup e acompanhe.");
  } else if (health !== "healthy") {
    level = "unknown";
  }
  if (predictFailure) {
    raise("bad", "O autodiagnóstico (SMART) prevê falha em um disco. Faça backup agora.");
  }
  const s = disk.smart;
  if (s) {
    if (s.wear !== null && s.wear !== undefined) {
      if (s.wear >= 90) raise("bad", `SSD com ${s.wear}% da vida útil usada. Planeje a troca.`);
      else if (s.wear >= 70) raise("warn", `SSD com ${s.wear}% da vida útil usada.`);
    }
    if (s.temperature) {
      const hot = disk.media === "HDD" ? 55 : 70;
      if (s.temperature >= hot) {
        raise("warn", `Temperatura alta (${s.temperature} °C). Verifique a ventilação do PC.`);
      }
    }
    const errors = (s.readErrors || 0) + (s.writeErrors || 0);
    if (errors > 0) {
      raise(
        errors >= 10 ? "bad" : "warn",
        `${errors.toLocaleString("pt-BR")} ${errors === 1 ? "erro de leitura/gravação não corrigido" : "erros de leitura/gravação não corrigidos"}.`,
      );
    }
    if (disk.media === "HDD" && s.powerOnHours >= 40000) {
      raise("warn", "HD com mais de 40 mil horas ligado: já é um disco antigo.");
    }
  }
  return { level, notes };
}

async function diskHealth({ details = false } = {}) {
  if (process.platform !== "win32") return { ok: false, reason: "not-windows", disks: [] };
  let disks = [];
  try {
    disks = normalizeBasic(await psFileJson(BASIC_SCRIPT, 30000));
  } catch {
    return { ok: false, reason: "read-failed", disks: [] };
  }
  if (details) {
    const detail = await psAdminJson(DETAIL_SCRIPT, 60000).catch(() => null);
    if (detail?.ok) lastDetail = detail;
    else if (detail?.reason === "cancelled") {
      // Mantém o que já tinha; só avisa que o UAC foi recusado.
      const out = withAssessment(mergeDetail(disks, lastDetail));
      return { ...out, cancelled: true };
    }
  }
  return withAssessment(mergeDetail(disks, lastDetail));
}

function withAssessment(disks) {
  const predictFailure = (lastDetail?.predictFailures || 0) > 0;
  return {
    ok: true,
    hasDetails: !!lastDetail,
    predictFailure,
    disks: disks.map((d) => ({ ...d, assessment: assessDisk(d, { predictFailure }) })),
  };
}

module.exports = { assessDisk, diskHealth, mergeDetail, normalizeBasic };
