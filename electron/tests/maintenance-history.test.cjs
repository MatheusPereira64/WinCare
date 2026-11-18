const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  HEALTH_SAMPLE_GAP_MS,
  LIMITS,
  createHistoryStore,
  eventForCommand,
  localDay,
  normalizeData,
  parseFreedMb,
  sanitizeEvent,
} = require("../maintenance-history.cjs");

function tempStore(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wincare-history-"));
  const file = path.join(dir, "maintenance-history.json");
  const legacyFile = path.join(dir, "schedule-history.json");
  let clock = options.start ?? Date.parse("2026-11-03T10:00:00");
  let changes = 0;
  const store = createHistoryStore({
    file,
    legacyFile,
    now: () => clock,
    onChange: () => {
      changes += 1;
    },
  });
  return {
    dir,
    file,
    legacyFile,
    store,
    advance: (ms) => {
      clock += ms;
    },
    changes: () => changes,
  };
}

test("histórico: registra o evento com id e horário do processo principal", () => {
  const h = tempStore();
  const event = h.store.record({
    kind: "cleanup",
    action: "cleaner",
    title: "Navegadores e apps limpos",
    freedBytes: 1_500_000_000,
  });
  assert.ok(event.id);
  assert.equal(event.ts, Date.parse("2026-11-03T10:00:00"));
  assert.equal(event.source, "manual");
  assert.equal(event.ok, true);
  const saved = JSON.parse(fs.readFileSync(h.file, "utf8"));
  assert.equal(saved.version, 1);
  assert.equal(saved.events.length, 1);
  assert.equal(saved.events[0].freedBytes, 1_500_000_000);
  assert.equal(h.changes(), 1);
});

test("histórico: o mais novo vem primeiro e ids não se repetem", () => {
  const h = tempStore();
  const a = h.store.record({ kind: "repair", title: "SFC" });
  h.advance(1000);
  const b = h.store.record({ kind: "repair", title: "DISM" });
  assert.notEqual(a.id, b.id);
  const { events } = h.store.read();
  assert.deepEqual(
    events.map((e) => e.title),
    ["DISM", "SFC"],
  );
});

test("histórico: rejeita tipo desconhecido, sem título ou horário inválido", () => {
  assert.equal(sanitizeEvent({ ts: 1, kind: "hack", title: "x" }), null);
  assert.equal(sanitizeEvent({ ts: 1, kind: "cleanup", title: "   " }), null);
  assert.equal(sanitizeEvent({ ts: "ontem", kind: "cleanup", title: "x" }), null);
  const h = tempStore();
  assert.equal(h.store.record({ kind: "rm -rf", title: "x" }), null);
  assert.equal(fs.existsSync(h.file), false);
});

test("histórico: textos longos são cortados e números negativos descartados", () => {
  const event = sanitizeEvent({
    ts: 10,
    kind: "cleanup",
    title: "a".repeat(500),
    detail: "b".repeat(900),
    freedBytes: -5,
    durationMs: Number.NaN,
  });
  assert.equal(event.title.length, LIMITS.maxTitle);
  assert.equal(event.detail.length, LIMITS.maxDetail);
  assert.equal(event.freedBytes, undefined);
  assert.equal(event.durationMs, undefined);
});

test("histórico: nunca passa do limite de eventos", () => {
  const h = tempStore();
  const data = {
    version: 1,
    events: Array.from({ length: LIMITS.maxEvents + 40 }, (_, i) => ({
      id: `e${i}`,
      ts: 1_000_000 + i,
      kind: "optimize",
      title: `Evento ${i}`,
    })),
    health: [],
  };
  fs.writeFileSync(h.file, JSON.stringify(data));
  h.store.record({ kind: "repair", title: "Novo" });
  const saved = JSON.parse(fs.readFileSync(h.file, "utf8"));
  assert.equal(saved.events.length, LIMITS.maxEvents);
  assert.equal(saved.events[0].title, "Novo");
  // Os mais antigos saem primeiro.
  assert.equal(saved.events.at(-1).id, `e${40 + 1}`);
});

test("histórico: nunca passa do limite de tamanho do arquivo", () => {
  const h = tempStore();
  const data = {
    version: 1,
    events: Array.from({ length: LIMITS.maxEvents }, (_, i) => ({
      id: `e${i}`,
      ts: 1_000_000 + i,
      kind: "cleanup",
      title: "t".repeat(LIMITS.maxTitle),
      detail: "d".repeat(LIMITS.maxDetail),
      freedBytes: 123456789,
    })),
    health: [],
  };
  fs.writeFileSync(h.file, JSON.stringify(data));
  h.store.record({ kind: "repair", title: "Novo" });
  const size = fs.statSync(h.file).size;
  assert.ok(size <= LIMITS.maxBytes, `arquivo com ${size} bytes`);
  const saved = JSON.parse(fs.readFileSync(h.file, "utf8"));
  assert.equal(saved.events[0].title, "Novo");
  assert.ok(saved.events.length < LIMITS.maxEvents);
});

test("histórico: arquivo corrompido não derruba — recomeça vazio", () => {
  const h = tempStore();
  fs.writeFileSync(h.file, "{ isto não é json");
  assert.deepEqual(h.store.read().events, []);
  h.store.record({ kind: "repair", title: "SFC" });
  assert.equal(h.store.read().events.length, 1);
});

test("histórico: na primeira vez importa as rotinas agendadas que já rodaram", () => {
  const h = tempStore();
  fs.writeFileSync(
    h.legacyFile,
    JSON.stringify([
      {
        id: "cleanup-1",
        job: "cleanup",
        label: "Limpeza agendada",
        startedAt: "2026-11-01T12:00:04",
        finishedAt: "2026-11-01T12:00:41",
        ok: true,
        summary: "6.214 arquivos removidos",
        freedBytes: 2_140_000_000,
      },
      { id: "bad", job: "cleanup", startedAt: "sem data" },
    ]),
  );
  const { events } = h.store.read();
  assert.equal(events.length, 1);
  assert.equal(events[0].source, "scheduled");
  assert.equal(events[0].freedBytes, 2_140_000_000);
  assert.equal(events[0].durationMs, 37_000);
  // Depois que o arquivo novo existe, o antigo não é importado de novo.
  h.store.record({ kind: "repair", title: "SFC" });
  assert.equal(h.store.read().events.length, 2);
  h.store.record({ kind: "repair", title: "DISM" });
  assert.equal(h.store.read().events.length, 3);
});

test("saúde: uma leitura a cada 5 min vira média, mínimo e máximo do dia", () => {
  const h = tempStore();
  assert.equal(h.store.recordHealth(80), true);
  // A primeira leitura já vai para o disco.
  let saved = JSON.parse(fs.readFileSync(h.file, "utf8"));
  assert.deepEqual(saved.health, [{ day: "2026-11-03", avg: 80, min: 80, max: 80, n: 1 }]);

  h.advance(60_000);
  assert.equal(h.store.recordHealth(20), false, "ignora leituras muito próximas");
  h.advance(HEALTH_SAMPLE_GAP_MS);
  assert.equal(h.store.recordHealth(90), true);
  h.advance(HEALTH_SAMPLE_GAP_MS);
  assert.equal(h.store.recordHealth(70), true);
  // Ainda na memória, mas a leitura já inclui.
  const day = h.store.read().health[0];
  assert.equal(day.n, 3);
  assert.equal(day.avg, 80);
  assert.equal(day.min, 70);
  assert.equal(day.max, 90);
  h.store.flush();
  saved = JSON.parse(fs.readFileSync(h.file, "utf8"));
  assert.equal(saved.health[0].n, 3);
});

test("saúde: valores fora de 0–100 são ignorados e dias diferentes ficam separados", () => {
  const h = tempStore();
  assert.equal(h.store.recordHealth(Number.NaN), false);
  assert.equal(h.store.recordHealth(140), false);
  h.store.recordHealth(60);
  h.advance(24 * 60 * 60 * 1000);
  h.store.recordHealth(75);
  h.store.flush();
  const { health } = h.store.read();
  assert.deepEqual(
    health.map((d) => [d.day, d.avg]),
    [
      ["2026-11-03", 60],
      ["2026-11-04", 75],
    ],
  );
});

test("saúde: apagar o histórico limpa eventos e saúde", () => {
  const h = tempStore();
  h.store.recordHealth(60);
  h.store.record({ kind: "repair", title: "SFC" });
  h.store.clear();
  const data = h.store.read();
  assert.deepEqual(data.events, []);
  assert.deepEqual(data.health, []);
});

test("normalizeData: ordena, remove duplicados e dias inválidos", () => {
  const data = normalizeData({
    events: [
      { id: "a", ts: 1, kind: "repair", title: "A" },
      { id: "b", ts: 3, kind: "repair", title: "B" },
      { id: "a", ts: 2, kind: "repair", title: "A de novo" },
    ],
    health: [
      { day: "2026-11-04", avg: 70, n: 2 },
      { day: "ontem", avg: 70, n: 2 },
      { day: "2026-11-03", avg: 60, n: 0 },
      { day: "2026-11-02", avg: 65, n: 1 },
    ],
  });
  assert.deepEqual(
    data.events.map((e) => e.id),
    ["b", "a"],
  );
  assert.deepEqual(
    data.health.map((d) => d.day),
    ["2026-11-02", "2026-11-04"],
  );
});

test("localDay usa o calendário local", () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59).getTime()), "2026-01-05");
});

test("comandos: reparos, verificações e limpezas viram eventos", () => {
  const sfc = eventForCommand("sfc /scannow", { code: 0, result: "ok" }, 900_000);
  assert.equal(sfc.kind, "repair");
  assert.equal(sfc.action, "sfc");
  assert.equal(sfc.ok, true);
  assert.equal(sfc.durationMs, 900_000);

  assert.equal(
    eventForCommand("DISM /Online /Cleanup-Image /RestoreHealth", { code: 0 }).action,
    "dism-restore",
  );
  assert.equal(
    eventForCommand("DISM /Online /Cleanup-Image /CheckHealth", { code: 0 }).kind,
    "check",
  );
  assert.equal(eventForCommand("chkdsk C:", { code: 0 }).kind, "check");
  assert.equal(eventForCommand("chkdsk C: /f", { code: 0 }).action, "chkdsk-fix");
  assert.equal(eventForCommand("netsh winsock reset", { code: 0 }).action, "winsock");
  assert.equal(eventForCommand("ipconfig /flushdns", { code: 0 }).action, "flushdns");
});

test("comandos: falha real entra como falha; UAC recusado não entra", () => {
  const failed = eventForCommand("sfc /scannow", {
    code: 1,
    result: "O comando terminou com o código 1.",
  });
  assert.equal(failed.ok, false);
  assert.match(failed.detail, /código 1/);
  assert.equal(
    eventForCommand("sfc /scannow", {
      code: 1,
      result: "Permissão de administrador negada ou cancelada.",
    }),
    null,
  );
});

test("comandos: consultas e diagnósticos de rede não entram no histórico", () => {
  for (const command of [
    "ping -n 4 -w 2000 8.8.8.8",
    "ipconfig /all",
    "nslookup google.com",
    "netsh wlan show profiles",
    "shutdown /s /t 60",
    "",
  ]) {
    assert.equal(eventForCommand(command, { code: 0 }), null, command);
  }
});

test("comandos: a limpeza de temporários lê o espaço liberado do resultado", () => {
  const command =
    "powershell -NoProfile -Command \"...; Write-Output ('Temporarios limpos: ' + 1 + ' MB liberados.')\"";
  const event = eventForCommand(command, {
    code: 0,
    result: "Temporarios limpos: 1536.5 MB liberados.",
  });
  assert.equal(event.kind, "cleanup");
  assert.equal(event.freedBytes, Math.round(1536.5 * 1024 * 1024));
  assert.equal(parseFreedMb("Temporarios limpos: 12,5 MB liberados."), Math.round(12.5 * 1048576));
  assert.equal(parseFreedMb("Temporarios limpos: 0 MB liberados."), undefined);
  assert.equal(parseFreedMb("nada"), undefined);
});
