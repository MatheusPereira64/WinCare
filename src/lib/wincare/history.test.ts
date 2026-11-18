import assert from "node:assert/strict";
import { test } from "vitest";

import type { MaintenanceEvent, MaintenanceHistory } from "./types";

import {
  dayKey,
  describeSummary,
  exportFileName,
  groupByDay,
  historyToCsv,
  historyToJson,
  lifetimeSummary,
  periodStart,
  startOfWeek,
  summarizePeriod,
  weeklyBuckets,
  weeksForPeriod,
} from "./history";
import { getDemoHistory } from "./historyDemo";

// Quarta-feira, 18/11/2026, 12:00 (horário local).
const NOW = new Date(2026, 10, 18, 12, 0, 0).getTime();
const GB = 1024 ** 3;
const at = (daysAgo: number, hour = 10) => new Date(2026, 10, 18 - daysAgo, hour, 0, 0).getTime();

let seq = 0;
type EventFields = Partial<MaintenanceEvent> &
  Pick<MaintenanceEvent, "kind" | "title"> & {
    hour?: number;
  };
const ev = (daysAgo: number, fields: EventFields): MaintenanceEvent => ({
  id: `e${++seq}`,
  ts: at(daysAgo, fields.hour ?? 10),
  action: fields.kind,
  ok: true,
  source: "manual",
  ...fields,
});

const HISTORY: Pick<MaintenanceHistory, "events" | "health"> = {
  events: [
    ev(0, { kind: "cleanup", title: "Navegadores e apps limpos", freedBytes: 1 * GB }),
    ev(1, { kind: "repair", title: "SFC" }),
    ev(2, {
      kind: "uninstall",
      title: "Blender desinstalado",
      subject: "Blender",
      freedBytes: 2 * GB,
      estimated: true,
    }),
    ev(3, { kind: "repair", title: "DISM", ok: false, detail: "Erro 0x800f081f" }),
    ev(4, { kind: "check", title: "CHKDSK" }),
    ev(5, { kind: "safety", title: "Ponto de restauração criado" }),
    ev(6, { kind: "cleanup", title: "Limpeza agendada", source: "scheduled", freedBytes: GB / 2 }),
    // Fora dos 7 dias (hoje + 6 anteriores), dentro dos 30.
    ev(7, { kind: "cleanup", title: "Temporários", freedBytes: 3 * GB }),
    ev(20, { kind: "uninstall", title: "OBS Studio desinstalado", subject: "OBS Studio" }),
    // Fora dos 90 dias.
    ev(120, { kind: "cleanup", title: "Antiga", freedBytes: 9 * GB }),
  ],
  health: [
    { day: dayKey(at(100)), avg: 50, min: 40, max: 60, n: 3 },
    { day: dayKey(at(6)), avg: 72.4, min: 70, max: 75, n: 10 },
    { day: dayKey(at(3)), avg: 80, min: 78, max: 82, n: 2 },
    { day: dayKey(at(0)), avg: 85.6, min: 80, max: 90, n: 5 },
  ],
};

test("período: 7 dias = hoje e os 6 anteriores, a partir da meia-noite", () => {
  assert.equal(periodStart(7, NOW), new Date(2026, 10, 12).getTime());
  assert.equal(periodStart(1, NOW), new Date(2026, 10, 18).getTime());
});

test("totais de 7 dias: espaço, programas, reparos e falhas", () => {
  const s = summarizePeriod(HISTORY, 7, NOW);
  assert.equal(s.events.length, 7);
  assert.equal(s.freedBytes, 3.5 * GB);
  assert.equal(s.estimatedBytes, 2 * GB);
  assert.equal(s.cleanups, 2);
  assert.deepEqual(s.programsRemoved, ["Blender"]);
  assert.equal(s.repairs, 1, "o reparo que falhou não conta");
  assert.equal(s.checks, 1);
  assert.equal(s.failed, 1);
  // Mais recente primeiro.
  assert.equal(s.events[0].title, "Navegadores e apps limpos");
});

test("totais de 30 e 90 dias incluem o que ficou fora dos 7", () => {
  const s30 = summarizePeriod(HISTORY, 30, NOW);
  assert.equal(s30.freedBytes, 6.5 * GB);
  assert.deepEqual(s30.programsRemoved, ["Blender", "OBS Studio"]);
  const s90 = summarizePeriod(HISTORY, 90, NOW);
  assert.equal(s90.events.length, 9);
  assert.equal(s90.freedBytes, 6.5 * GB, "o evento de 120 dias atrás fica de fora");
});

test("saúde: antes (primeiro dia do período) e agora (último)", () => {
  const s = summarizePeriod(HISTORY, 7, NOW);
  assert.equal(s.health!.current, 86);
  assert.equal(s.health!.start, 72);
  assert.equal(s.health!.delta, 14);
  assert.equal(s.health!.days, 3);
  assert.equal(s.health!.startDay, new Date(2026, 10, 12).getTime());

  const one = summarizePeriod({ events: [], health: [HISTORY.health[3]] }, 7, NOW);
  assert.equal(one.health!.current, 86);
  assert.equal(one.health!.start, null);
  assert.equal(one.health!.delta, null);

  assert.equal(summarizePeriod({ events: [], health: [] }, 7, NOW).health, null);
});

test("frase-resumo do período", () => {
  assert.equal(
    describeSummary(summarizePeriod(HISTORY, 7, NOW)),
    "3,5 GB liberados, 1 programa removido e 1 reparo",
  );
  assert.equal(describeSummary(summarizePeriod({ events: [], health: [] }, 7, NOW)), null);
});

test("semanas: começam na segunda-feira e terminam na semana atual", () => {
  assert.equal(startOfWeek(NOW), new Date(2026, 10, 16).getTime());
  assert.equal(weeksForPeriod(7), 4);
  assert.equal(weeksForPeriod(30), 5);
  assert.equal(weeksForPeriod(90), 13);

  const weeks = weeklyBuckets(HISTORY, 4, NOW);
  assert.equal(weeks.length, 4);
  assert.equal(weeks[3].current, true);
  assert.equal(weeks[3].start, new Date(2026, 10, 16).getTime());
  assert.equal(weeks[0].start, new Date(2026, 9, 26).getTime());
  // Semana atual (seg 16 a qua 18): limpeza de hoje, SFC de ontem, Blender (dia 16).
  assert.equal(weeks[3].actions, 3);
  assert.equal(weeks[3].freedBytes, 3 * GB);
  // Semana anterior: DISM falhou (não conta), CHKDSK, ponto de restauração (não conta), limpezas.
  assert.equal(weeks[2].actions, 3);
  assert.equal(weeks[2].freedBytes, 3.5 * GB);
});

test("semanas: saúde é a média ponderada pelas leituras; sem leitura fica null", () => {
  const weeks = weeklyBuckets(HISTORY, 4, NOW);
  assert.equal(weeks[3].health, 86);
  // Dia 12 (72,4 × 10) e dia 15 (80 × 2).
  assert.equal(weeks[2].health, Math.round((72.4 * 10 + 80 * 2) / 12));
  assert.equal(weeks[0].health, null);
});

test("linha do tempo agrupada por dia: Hoje, Ontem e data por extenso", () => {
  const groups = groupByDay(HISTORY.events.slice(0, 3), NOW);
  assert.deepEqual(
    groups.map((g) => g.label),
    ["Hoje", "Ontem", groups[2].label],
  );
  assert.match(groups[2].label, /16 de novembro/);
  assert.equal(
    groupByDay([ev(400, { kind: "repair", title: "x" })], NOW)[0].label.includes("2025"),
    true,
  );
});

test("vida toda: desde o primeiro registro, sem contar pontos de restauração", () => {
  const life = lifetimeSummary(HISTORY)!;
  assert.equal(life.count, 8);
  assert.equal(life.freedBytes, 15.5 * GB);
  assert.equal(life.since, at(120));
  assert.equal(lifetimeSummary({ events: [] }), null);
});

test("CSV para o Excel em português: BOM, ponto e vírgula e vírgula decimal", () => {
  const csv = historyToCsv(summarizePeriod(HISTORY, 7, NOW).events);
  assert.ok(csv.startsWith("\uFEFFData;Hora;Tipo;"));
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 8);
  assert.match(
    lines[1],
    /^18\/11\/2026;10:00;Limpeza;Navegadores e apps limpos;Concluído;Manual;1\.024,0;Não;;$/,
  );
  assert.match(csv, /Blender desinstalado;Concluído;Manual;2\.048,0;Sim/);
  assert.match(csv, /DISM;Falhou;Manual;;;;Erro 0x800f081f/);
  assert.match(csv, /Limpeza agendada;Concluído;Agendada/);
});

test("CSV: nomes de programa não viram fórmula e aspas/; são escapados", () => {
  const csv = historyToCsv([
    ev(0, { kind: "uninstall", title: '=HYPERLINK("http://x";"y")' }),
    ev(0, { kind: "cleanup", title: "Limpeza", detail: "a; b" }),
  ]);
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/x"";""y""\)"/);
  assert.match(csv, /;"a; b"\r\n/);
});

test("JSON exportado traz período, totais, eventos e saúde do período", () => {
  const parsed = JSON.parse(historyToJson(HISTORY, 30, NOW));
  assert.equal(parsed.app, "WinCare");
  assert.equal(parsed.period.days, 30);
  assert.equal(parsed.totals.freedBytes, 6.5 * GB);
  assert.equal(parsed.totals.programsRemoved, 2);
  assert.equal(parsed.totals.healthNow, 86);
  assert.equal(parsed.events.length, 9);
  assert.equal(parsed.health.length, 3);
  assert.equal(exportFileName(30, "csv", NOW), "WinCare-historico-30-dias-2026-11-18.csv");
});

test("demonstração: histórico estável, ordenado e dentro dos 90+ dias", () => {
  const a = getDemoHistory(NOW);
  const b = getDemoHistory(NOW + 5000);
  assert.deepEqual(a, b, "gerado uma vez por sessão");
  assert.ok(a.events.length > 20);
  for (let i = 1; i < a.events.length; i++) assert.ok(a.events[i - 1].ts >= a.events[i].ts);
  assert.ok(a.events.every((e) => e.ts <= NOW && e.ts > NOW - 100 * 86_400_000));
  assert.ok(a.health.length > 50);
  const s = summarizePeriod(a, 30, NOW);
  assert.ok(s.freedBytes > 0 && s.programsRemoved.length > 0 && s.repairs > 0);
  assert.ok(s.health!.delta !== null);
});
