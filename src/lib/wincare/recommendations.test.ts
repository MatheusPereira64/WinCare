import assert from "node:assert/strict";
import { test } from "vitest";

import {
  buildRecommendations,
  partitionRecommendations,
  type RecommendationInput,
} from "./recommendations";
import { enrichStartupItems } from "./startupAdvice";

const NOW = new Date(2026, 10, 18, 12, 0, 0);
const DAY = 86_400_000;

/** Sistema saudável: nenhuma regra deve disparar. */
const info = (overrides = {}) => ({
  hostname: "PC",
  osName: "Windows 11",
  build: "26100",
  cpuUsage: 20,
  memoryUsage: 40,
  memoryTotalGb: 16,
  memoryUsedGb: 6.4,
  diskUsage: 50,
  diskTotalGb: 500,
  uptime: "2 dias, 03:00",
  defenderStatus: "Ativo e atualizado",
  lastUpdate: "10/11/2026",
  health: 90,
  simulated: false,
  cpuTemperature: 50,
  gpuTemperature: 50,
  ...overrides,
});
const disk = (letter: string, totalGb: number, freeGb: number, smart = "OK") => ({
  letter,
  model: "SSD",
  type: "SSD",
  totalGb,
  freeGb,
  smart,
});
const ids = (list: { id: string }[]) => list.map((r) => r.id);
/* As fixtures passam só os campos que cada regra lê (objetos parciais de propósito). */
const build = (input: Record<string, unknown>) =>
  buildRecommendations({ now: NOW, ...input } as unknown as RecommendationInput);

test("sistema saudável não gera recomendação (nem um falso 'tudo certo')", () => {
  assert.deepEqual(
    build({ info: info(), disks: [disk("C:", 500, 250)], schedules: [{ enabled: true }] }),
    [],
  );
});

test("espaço: por unidade, crítico >= 90% e atenção entre 80% e 89%", () => {
  const recs = build({
    info: info(),
    disks: [disk("C:", 100, 5), disk("D:", 100, 15), disk("E:", 100, 50)],
  });
  const c = recs.find((r) => r.id === "disk-C:")!;
  const d = recs.find((r) => r.id === "disk-D:")!;
  assert.equal(c.severity, "critical");
  assert.equal(c.action.to, "/limpeza");
  assert.match(c.detail, /95% usados, 5 GB livres/);
  assert.equal(d.severity, "warning");
  assert.equal(d.action.to, "/disco");
  assert.ok(!ids(recs).includes("disk-E:"));
});

test("espaço: sem lista de unidades usa o C: da leitura do sistema (mesmo id)", () => {
  const recs = build({ info: info({ diskUsage: 93 }) });
  assert.deepEqual(ids(recs), ["disk-C:"]);
  assert.equal(recs[0].severity, "critical");
});

test("não duplica: um único aviso de Defender e um por unidade", () => {
  const recs = build({
    info: info({ defenderStatus: "Desativado", diskUsage: 95 }),
    disks: [disk("C:", 100, 5)],
  });
  assert.equal(recs.filter((r) => r.id === "defender").length, 1);
  assert.equal(recs.filter((r) => r.id.startsWith("disk-")).length, 1);
  const def = recs.find((r) => r.id === "defender")!;
  assert.equal(def.action.command, "start ms-settings:windowsdefender");
});

test("Defender: reconhece variações de 'desligado'", () => {
  for (const status of ["Desativado", "desativada", "Off", "false"]) {
    assert.ok(ids(build({ info: info({ defenderStatus: status }) })).includes("defender"), status);
  }
  assert.ok(!ids(build({ info: info({ defenderStatus: "Ativo" }) })).includes("defender"));
});

test("regras de ambos os motores antigos estão presentes", () => {
  const startup = Array.from({ length: 13 }, (_, i) => ({
    id: `hkcu-run:App${i}`,
    name: `App${i}`,
    command: "",
    location: "hkcu-run",
    enabled: true,
  }));
  const trend = [
    ...Array.from({ length: 6 }, (_, i) => ({ ts: i, health: 90 })),
    ...Array.from({ length: 6 }, (_, i) => ({ ts: 10 + i, health: 70 })),
  ];
  const recs = build({
    info: info({
      memoryUsage: 90,
      cpuUsage: 95,
      cpuTemperature: 90,
      lastUpdate: "01/08/2026",
      uptime: "12 dias, 01:00",
    }),
    disks: [disk("C:", 100, 50, "Alerta")],
    schedules: [{ enabled: false }],
    startup,
    folders: [{ id: "temp-user", sizeBytes: 2_000_000_000 }],
    newcomers: [{ id: "x", name: "Novo App", firstSeen: 0, enabled: true }],
    trend,
  });
  for (const id of [
    "smart",
    "thermals",
    "ram-high",
    "boot-heavy",
    "windows-update",
    "temp-files",
    "cpu-load",
    "health-drop",
    "uptime",
    "schedule",
  ]) {
    assert.ok(ids(recs).includes(id), `faltou ${id}`);
  }
  assert.ok(
    ids(recs).some((id) => id.startsWith("startup-new:")),
    "faltou startup-new",
  );
});

test("programas novos: o id depende do grupo (ignorar não esconde os que vierem depois)", () => {
  const a = { id: "hkcu-run:A", name: "A", firstSeen: 0, enabled: true };
  const b = { id: "hkcu-run:B", name: "B", firstSeen: 0, enabled: true };
  const idFor = (newcomers: unknown[]) =>
    build({ info: info(), newcomers }).find((r) => r.id.startsWith("startup-new:"))!.id;
  assert.equal(idFor([a, b]), idFor([b, a]), "mesma lista em outra ordem = mesmo id");
  assert.notEqual(idFor([a]), idFor([a, b]), "programa novo = id novo");
  const items = build({ info: info(), newcomers: [a, b] });
  const dismissed = { [idFor([a])]: { until: null, at: 0 } };
  const { active } = partitionRecommendations(items, dismissed, NOW.getTime());
  assert.ok(
    active.some((r) => r.id.startsWith("startup-new:")),
    "grupo maior volta a aparecer",
  );
});

test("ordem: crítico, depois atenção, depois dica (estável dentro do nível)", () => {
  const recs = build({
    info: info({ memoryUsage: 90, cpuUsage: 95, uptime: "9 dias, 01:00" }),
    schedules: [],
  });
  const rank = { critical: 0, warning: 1, tip: 2 };
  for (let i = 1; i < recs.length; i++) {
    assert.ok(rank[recs[i - 1].severity] <= rank[recs[i].severity]);
  }
  assert.deepEqual(ids(recs.filter((r) => r.severity === "tip")), ["uptime", "schedule"]);
});

test("dados não lidos não viram recomendação (agendamento/inicialização)", () => {
  const recs = build({ info: info() });
  assert.ok(!ids(recs).includes("schedule"));
  assert.ok(!ids(recs).some((id) => id.startsWith("boot-")));
});

test("adiar e ignorar: separa visíveis e escondidas; adiamento vencido volta", () => {
  const items = build({ info: info({ memoryUsage: 90, cpuUsage: 95, uptime: "9 dias, 01:00" }) });
  const now = NOW.getTime();
  const { active, hidden } = partitionRecommendations(
    items,
    {
      "ram-high": { until: now + DAY, at: now },
      uptime: { until: null, at: now },
      "cpu-load": { until: now - 1, at: now - 2 * DAY },
    },
    now,
  );
  assert.deepEqual(ids(hidden).sort(), ["ram-high", "uptime"]);
  assert.ok(ids(active).includes("cpu-load"), "adiamento vencido volta a aparecer");
  assert.equal(hidden.find((h) => h.id === "uptime")!.dismissal!.until, null);
});

test("inicialização: a entrada do próprio WinCare (bandeja) não é sugerida para sair", () => {
  const [item] = enrichStartupItems([
    {
      id: "hkcu-run:WinCare",
      name: "WinCare",
      command: '"C:\\Apps\\WinCare\\WinCare.exe" --hidden',
      location: "hkcu-run",
      enabled: true,
    },
  ]);
  assert.equal(item.recommendation, "keep");
  assert.match(item.recommendationReason ?? "", /bandeja/);
});

test("bateria: só avisa abaixo de 60% de saúde, e nunca em desktop", () => {
  const battery = (fullChargeMwh: number) => ({
    ok: true,
    hasBattery: true,
    batteries: [
      {
        name: "BAT",
        manufacturer: "",
        chemistry: "LiP",
        designMwh: 50000,
        fullChargeMwh,
        cycleCount: 900,
      },
    ],
    history: [],
  });
  const worn = build({ info: info(), battery: battery(27500) }).find(
    (r) => r.id === "battery-worn",
  );
  assert.ok(worn, "55% de saúde gera aviso");
  assert.equal(worn.severity, "warning");
  assert.equal(worn.action.to, "/sistema");
  assert.match(worn.detail, /55% da carga original/);
  assert.match(worn.detail, /desgaste normal/, "texto honesto, sem alarme");

  assert.ok(!ids(build({ info: info(), battery: battery(35000) })).includes("battery-worn"));
  assert.ok(
    !ids(
      build({ info: info(), battery: { ok: true, hasBattery: false, batteries: [], history: [] } }),
    ).includes("battery-worn"),
  );
  assert.ok(!ids(build({ info: info() })).includes("battery-worn"));
});
