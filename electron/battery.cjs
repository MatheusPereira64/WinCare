/**
 * Bateria e energia: lê o relatório do Windows (`powercfg /batteryreport`).
 *
 * O XML (`/xml`) traz as baterias (capacidade de projeto, carga total atual,
 * ciclos), o histórico de capacidade por período, a estimativa de autonomia e
 * o uso recente (na tomada ou na bateria). O parser é puro e testado em
 * electron/tests/battery.test.cjs; aqui não há nada que o usuário controle no
 * comando — o caminho de saída é sempre gerado por nós.
 */
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { psFileJson } = require("./powershell.cjs");

/** Pontos no gráfico de capacidade (um por mês, os mais recentes). */
const MAX_HISTORY_POINTS = 24;

const decodeEntities = (text) =>
  String(text)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** XML bruto dentro do primeiro `<name>…</name>`. */
function block(xml, name) {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(String(xml || ""));
  return m ? m[1] : "";
}

/** Texto do primeiro `<name>…</name>`. */
const tagText = (xml, name) => decodeEntities(block(xml, name).trim());

/** Blocos `<name …>…</name>` ou `<name … />`: atributos + filhos simples num só objeto. */
function elements(xml, name) {
  const out = [];
  const re = new RegExp(`<${name}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${name}>)`, "g");
  let m;
  while ((m = re.exec(String(xml || "")))) {
    const fields = {};
    const attrRe = /([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g;
    let a;
    while ((a = attrRe.exec(m[1] || ""))) fields[a[1]] = decodeEntities(a[2]);
    const childRe = /<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
    let c;
    while ((c = childRe.exec(m[2] || ""))) fields[c[1]] = decodeEntities(c[2].trim());
    out.push(fields);
  }
  return out;
}

const toInt = (value) => {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
};

/** Duração ISO 8601 do relatório ("P2DT19H16M10S", "PT6H2M") em segundos. */
function parseIsoDuration(value) {
  const m =
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
      String(value || "").trim(),
    );
  if (!m) return null;
  const [, d, h, min, s] = m.map((v) => Number(v || 0));
  return Math.round(d * 86400 + h * 3600 + min * 60 + s);
}

/**
 * Histórico de capacidade: só períodos com bateria medida, a partir da última
 * troca de bateria, um ponto por mês (o último medido no mês).
 */
function capacityHistory(xml) {
  const entries = elements(block(xml, "History"), "HistoryEntry");
  let start = 0;
  entries.forEach((e, i) => {
    if (e.BatteryChanged === "1") start = i;
  });
  const byMonth = new Map();
  for (const e of entries.slice(start)) {
    const fullChargeMwh = toInt(e.FullChargeCapacity);
    const designMwh = toInt(e.DesignCapacity);
    const date = String(e.LocalEndDate || e.EndDate || "").slice(0, 10);
    if (!fullChargeMwh || !designMwh || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    byMonth.set(date.slice(0, 7), { date, fullChargeMwh, designMwh });
  }
  return [...byMonth.values()].slice(-MAX_HISTORY_POINTS);
}

/** Parte do tempo ativo recente passada na tomada (0–1); null sem dados. */
function acShare(xml) {
  const usage = elements(xml, "UsageEntry");
  let ac = 0;
  let total = 0;
  for (let i = 0; i < usage.length; i++) {
    const e = usage[i];
    if (e.EntryType !== "Active") continue;
    const next = usage[i + 1];
    /* `Duration` não é confiável entre versões; a distância até a próxima entrada é. */
    const startMs = Date.parse(e.Timestamp);
    const endMs = next ? Date.parse(next.Timestamp) : NaN;
    const span = Number.isFinite(startMs) && Number.isFinite(endMs) ? endMs - startMs : 0;
    if (span <= 0) continue;
    total += span;
    if (e.Ac === "1") ac += span;
  }
  return total > 0 ? Math.round((ac / total) * 100) / 100 : null;
}

/** Converte o XML do `powercfg /batteryreport /xml` no formato do app (BatteryReport). */
function parseBatteryReportXml(xml) {
  const text = String(xml || "");
  if (!/<BatteryReport[\s>]/.test(text)) throw new Error("Relatório de bateria inválido.");

  const batteries = elements(block(text, "Batteries"), "Battery")
    .map((b) => ({
      name: b.Id || "Bateria",
      manufacturer: b.Manufacturer || "",
      chemistry: b.Chemistry || "",
      designMwh: toInt(b.DesignCapacity),
      fullChargeMwh: toInt(b.FullChargeCapacity),
      cycleCount:
        b.CycleCount !== undefined && toInt(b.CycleCount) > 0 ? toInt(b.CycleCount) : null,
    }))
    .filter((b) => b.designMwh > 0);

  const estimates = block(text, "RuntimeEstimates");
  const runtimeOf = (name) => {
    const seconds = parseIsoDuration(tagText(block(estimates, name), "ActiveRuntime"));
    return seconds && seconds > 0 ? seconds : null;
  };

  return {
    ok: true,
    hasBattery: batteries.length > 0,
    scannedAt: tagText(text, "ScanTime") || new Date().toISOString(),
    platformRole: tagText(text, "PlatformRole") || null,
    batteries,
    history: batteries.length ? capacityHistory(text) : [],
    runtime: {
      fullChargeSec: runtimeOf("FullChargeCapacity"),
      designSec: runtimeOf("DesignCapacity"),
    },
    acShare: batteries.length ? acShare(text) : null,
  };
}

function runPowerCfgReport(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile("powercfg.exe", args, { windowsHide: true, timeout: timeoutMs }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Gera o XML num arquivo temporário, lê e apaga — inclusive quando o powercfg
 * ou a leitura falham. `run` e `tmpDir` existem para os testes.
 */
async function readBatteryReport({
  timeoutMs = 30000,
  run = runPowerCfgReport,
  tmpDir = os.tmpdir(),
  platform = process.platform,
} = {}) {
  if (platform !== "win32") {
    return { ok: false, reason: "not-windows", hasBattery: false, batteries: [], history: [] };
  }
  const file = path.join(
    tmpDir,
    `wincare-battery-${Date.now()}-${Math.random().toString(36).slice(2)}.xml`,
  );
  try {
    await run(["/batteryreport", "/xml", "/output", file], timeoutMs);
    return parseBatteryReportXml(fs.readFileSync(file, "utf8"));
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {
      /* não foi criado */
    }
  }
}

/**
 * Quantas baterias o Windows enxerga (CIM Win32_Battery). Em desktop dá 0 e o
 * relatório (mais lento) nem é gerado. null quando a consulta falha.
 */
async function countBatteries() {
  if (process.platform !== "win32") return 0;
  try {
    const count = await psFileJson(
      "@(Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue).Count | ConvertTo-Json",
      15000,
    );
    return Number.isFinite(Number(count)) ? Number(count) : null;
  } catch {
    return null;
  }
}

/** Relatório HTML completo do Windows em `dir` (pasta de dados do app). Devolve o caminho. */
async function writeFullBatteryReport(dir, { timeoutMs = 30000 } = {}) {
  if (process.platform !== "win32") throw new Error("Disponível só no Windows.");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "battery-report.html");
  await runPowerCfgReport(["/batteryreport", "/output", file], timeoutMs);
  if (!fs.existsSync(file)) throw new Error("O Windows não gerou o relatório.");
  return file;
}

module.exports = {
  MAX_HISTORY_POINTS,
  countBatteries,
  parseBatteryReportXml,
  parseIsoDuration,
  readBatteryReport,
  writeFullBatteryReport,
};
