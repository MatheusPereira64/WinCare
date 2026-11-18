const test = require("node:test");
const assert = require("node:assert/strict");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  MAX_HISTORY_POINTS,
  parseBatteryReportXml,
  parseIsoDuration,
  readBatteryReport,
} = require("../battery.cjs");

/* Amostras no formato completo do `powercfg /batteryreport /xml` (CRLF, como o Windows grava). */
const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

/* Recorte no formato real do `powercfg /batteryreport /xml` (Windows 11). */
const historyEntry = (end, full, design = 56000, changed = 0) => `
    <HistoryEntry
      StartDate="${end}T00:00:00Z"
      LocalStartDate="${end}T00:00:00"
      EndDate="${end}T12:00:00Z"
      LocalEndDate="${end}T09:00:00"
      DesignCapacity="${design}"
      FullChargeCapacity="${full}"
      CycleCount="0"
      ActiveAcTime="P2DT19H16M10S"
      BatteryChanged="${changed}"
      />`;

const usage = (ts, ac, type = "Active") => `
    <UsageEntry Timestamp="${ts}" LocalTimestamp="${ts}" Duration="1" Ac="${ac}" EntryType="${type}" ChargeCapacity="0" Discharge="0" FullChargeCapacity="0" IsNextOnBattery="0" />`;

function laptopXml({ batteries, history = "", usageEntries = "", runtime = "PT4H10M" }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<BatteryReport xmlns="http://schemas.microsoft.com/battery/2012">
  <ReportInformation><ScanTime>2026-11-18T18:22:28Z</ScanTime></ReportInformation>
  <SystemInformation><PlatformRole>Mobile</PlatformRole></SystemInformation>
  <Batteries>${batteries}
  </Batteries>
  <RuntimeEstimates>
    <DesignCapacity><Capacity>56000</Capacity><ActiveRuntime>PT4H47M</ActiveRuntime></DesignCapacity>
    <FullChargeCapacity><Capacity>48740</Capacity><ActiveRuntime>${runtime}</ActiveRuntime></FullChargeCapacity>
  </RuntimeEstimates>
  <RecentUsage>${usageEntries}
  </RecentUsage>
  <History>${history}
  </History>
</BatteryReport>`;
}

const battery = (design, full, cycles = 412, id = "DELL 7FHHV") => `
    <Battery>
      <Id>${id}</Id>
      <Manufacturer>SMP &amp; Co</Manufacturer>
      <SerialNumber>123</SerialNumber>
      <Chemistry>LiP</Chemistry>
      <LongTerm>1</LongTerm>
      <DesignCapacity>${design}</DesignCapacity>
      <FullChargeCapacity>${full}</FullChargeCapacity>
      <CycleCount>${cycles}</CycleCount>
    </Battery>`;

test("duração ISO 8601 do relatório vira segundos", () => {
  assert.equal(parseIsoDuration("PT4H10M"), 15000);
  assert.equal(parseIsoDuration("P2DT19H16M10S"), 242170);
  assert.equal(parseIsoDuration("PT0S"), 0);
  assert.equal(parseIsoDuration("PT1.5S"), 2);
  assert.equal(parseIsoDuration("lixo"), null);
  assert.equal(parseIsoDuration(""), null);
});

test("desktop: relatório sem baterias", () => {
  const xml = laptopXml({ batteries: "", history: historyEntry("2026-01-10", 0, 0) });
  const report = parseBatteryReportXml(xml.replace("Mobile", "Desktop"));
  assert.equal(report.ok, true);
  assert.equal(report.hasBattery, false);
  assert.deepEqual(report.batteries, []);
  assert.deepEqual(report.history, []);
  assert.equal(report.acShare, null);
  assert.equal(report.platformRole, "Desktop");
});

test("notebook: lê capacidade, ciclos, química e autonomia", () => {
  const report = parseBatteryReportXml(laptopXml({ batteries: battery(56000, 48740) }));
  assert.equal(report.hasBattery, true);
  assert.deepEqual(report.batteries, [
    {
      name: "DELL 7FHHV",
      manufacturer: "SMP & Co",
      chemistry: "LiP",
      designMwh: 56000,
      fullChargeMwh: 48740,
      cycleCount: 412,
    },
  ]);
  assert.equal(report.runtime.fullChargeSec, 15000);
  assert.equal(report.runtime.designSec, 17220);
  assert.equal(report.scannedAt, "2026-11-18T18:22:28Z");
});

test("ciclos 0 (firmware não informa) viram null", () => {
  const report = parseBatteryReportXml(laptopXml({ batteries: battery(56000, 50000, 0) }));
  assert.equal(report.batteries[0].cycleCount, null);
});

test("histórico: ignora períodos sem medição e fica com um ponto por mês", () => {
  const history = [
    historyEntry("2026-01-05", 0, 0),
    historyEntry("2026-01-10", 55000),
    historyEntry("2026-01-24", 54800),
    historyEntry("2026-02-14", 54100),
    historyEntry("2026-03-01", 53000),
  ].join("");
  const report = parseBatteryReportXml(laptopXml({ batteries: battery(56000, 53000), history }));
  assert.deepEqual(report.history, [
    { date: "2026-01-24", fullChargeMwh: 54800, designMwh: 56000 },
    { date: "2026-02-14", fullChargeMwh: 54100, designMwh: 56000 },
    { date: "2026-03-01", fullChargeMwh: 53000, designMwh: 56000 },
  ]);
});

test("histórico: recomeça depois da troca de bateria", () => {
  const history = [
    historyEntry("2025-01-10", 30000),
    historyEntry("2025-02-10", 29000),
    historyEntry("2025-03-10", 56000, 56000, 1),
    historyEntry("2025-04-10", 55800),
  ].join("");
  const report = parseBatteryReportXml(laptopXml({ batteries: battery(56000, 55800), history }));
  assert.deepEqual(
    report.history.map((p) => p.date),
    ["2025-03-10", "2025-04-10"],
  );
});

test("histórico: limita aos meses mais recentes", () => {
  const history = Array.from({ length: 40 }, (_, i) => {
    const year = 2023 + Math.floor(i / 12);
    const month = String((i % 12) + 1).padStart(2, "0");
    return historyEntry(`${year}-${month}-15`, 56000 - i * 100);
  }).join("");
  const report = parseBatteryReportXml(laptopXml({ batteries: battery(56000, 52100), history }));
  assert.equal(report.history.length, MAX_HISTORY_POINTS);
  assert.equal(report.history.at(-1).date, "2026-04-15");
});

test("uso recente: parte do tempo ativo na tomada", () => {
  const usageEntries = [
    usage("2026-11-11T10:00:00Z", 1),
    usage("2026-11-11T13:00:00Z", 0),
    usage("2026-11-11T14:00:00Z", 1, "Suspend"),
    usage("2026-11-11T20:00:00Z", 1),
    usage("2026-11-11T22:00:00Z", 1, "ReportGenerated"),
  ].join("");
  const report = parseBatteryReportXml(
    laptopXml({ batteries: battery(56000, 50000), usageEntries }),
  );
  // Ativo: 3 h na tomada + 1 h na bateria + 2 h na tomada (suspensão não conta).
  assert.equal(report.acShare, 0.83);
});

test("relatório inválido é rejeitado", () => {
  assert.throws(() => parseBatteryReportXml("<html></html>"), /inválido/);
  assert.throws(() => parseBatteryReportXml(""), /inválido/);
});

test("amostra: notebook saudável", () => {
  const report = parseBatteryReportXml(fixture("battery-healthy.xml"));
  assert.equal(report.hasBattery, true);
  assert.equal(report.platformRole, "Mobile");
  const [bat] = report.batteries;
  assert.equal(bat.designMwh, 52000);
  assert.equal(bat.fullChargeMwh, 51135);
  assert.equal(bat.cycleCount, 120);
  assert.equal(report.runtime.fullChargeSec, 6 * 3600 + 14 * 60);
  assert.equal(report.history.length, 13, "um ponto por mês em ~1 ano");
  assert.ok(report.history.every((p) => p.designMwh === 52000));
  assert.ok(report.acShare > 0.4 && report.acShare < 0.8, "uso misto");
});

test("amostra: notebook desgastado (com troca de bateria no histórico)", () => {
  const report = parseBatteryReportXml(fixture("battery-worn.xml"));
  const [bat] = report.batteries;
  assert.equal(bat.chemistry, "Li-I");
  assert.equal(bat.cycleCount, 1012);
  assert.equal(Math.round((bat.fullChargeMwh / bat.designMwh) * 100), 57);
  assert.equal(report.runtime.fullChargeSec, 110 * 60);
  // jan/2024 a nov/2025, a partir da troca de bateria: 23 meses.
  assert.equal(report.history.length, 23);
  assert.ok(report.history.length <= MAX_HISTORY_POINTS);
  assert.equal(report.history[0].date, "2024-01-31");
  assert.ok(
    report.history.every((p) => p.date >= "2024-01"),
    "dez/2023 (antes da troca de bateria) fica de fora",
  );
  assert.ok(report.history[0].fullChargeMwh > report.history.at(-1).fullChargeMwh);
  assert.ok(report.acShare > 0.9, "quase sempre na tomada");
});

test("amostra: desktop sem bateria", () => {
  const report = parseBatteryReportXml(fixture("battery-desktop.xml"));
  assert.equal(report.hasBattery, false);
  assert.deepEqual(report.history, []);
  assert.equal(report.runtime.fullChargeSec, null);
});

/* Nenhum arquivo temporário fica para trás — nem quando o powercfg ou a leitura falham. */
function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wincare-battery-test-"));
  return fn(dir).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

const writes = (content) => async (args) => {
  fs.writeFileSync(args[args.indexOf("/output") + 1], content, "utf8");
};

test("relatório lido: o XML temporário é apagado", () =>
  withTmpDir(async (dir) => {
    const report = await readBatteryReport({
      tmpDir: dir,
      platform: "win32",
      run: writes(fixture("battery-healthy.xml")),
    });
    assert.equal(report.hasBattery, true);
    assert.deepEqual(fs.readdirSync(dir), []);
  }));

test("XML inválido: falha e mesmo assim apaga o temporário", () =>
  withTmpDir(async (dir) => {
    await assert.rejects(
      readBatteryReport({ tmpDir: dir, platform: "win32", run: writes("<html/>") }),
      /inválido/,
    );
    assert.deepEqual(fs.readdirSync(dir), []);
  }));

test("powercfg falhou depois de criar o arquivo: apaga o temporário", () =>
  withTmpDir(async (dir) => {
    const run = async (args) => {
      await writes("parcial")(args);
      throw new Error("powercfg saiu com código 1");
    };
    await assert.rejects(readBatteryReport({ tmpDir: dir, platform: "win32", run }), /código 1/);
    assert.deepEqual(fs.readdirSync(dir), []);
  }));

test("fora do Windows: não roda nada", async () => {
  let called = false;
  const report = await readBatteryReport({
    platform: "linux",
    run: async () => {
      called = true;
    },
  });
  assert.equal(report.reason, "not-windows");
  assert.equal(called, false);
});
