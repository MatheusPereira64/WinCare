import { describe, expect, it } from "vitest";

import {
  batteryLevel,
  batteryTips,
  formatDuration,
  formatWh,
  isHighPerformancePlan,
  lossPerYear,
  monthLabel,
  summarizeBattery,
} from "./battery";
import { SIMULATED_BATTERY } from "./bridge";
import type { BatteryReport } from "./types";

const HIGH_PERF = { guid: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c", name: "Alto desempenho" };
const BALANCED = { guid: "381b4222-f694-41f0-9685-ff5bb260df2e", name: "Equilibrado" };

function report(
  overrides: Partial<BatteryReport> = {},
  full = 52000,
  design = 56000,
): BatteryReport {
  return {
    ok: true,
    hasBattery: true,
    batteries: [
      {
        name: "BAT",
        manufacturer: "",
        chemistry: "LiP",
        designMwh: design,
        fullChargeMwh: full,
        cycleCount: 200,
      },
    ],
    history: [],
    runtime: { fullChargeSec: 5 * 3600, designSec: 6 * 3600 },
    acShare: 0.5,
    onBattery: false,
    activePlan: BALANCED,
    ...overrides,
  };
}

const tipIds = (r: BatteryReport) => batteryTips(r, summarizeBattery(r)!).map((t) => t.id);

describe("summarizeBattery", () => {
  it("calcula saúde e desgaste em relação à capacidade de projeto", () => {
    const s = summarizeBattery(report({}, 48740, 56000))!;
    expect(s.healthPct).toBe(87);
    expect(s.wearPct).toBe(13);
    expect(s.level).toBe("good");
    expect(s.cycleCount).toBe(200);
  });

  it("limita a saúde a 100% (bateria nova às vezes informa mais)", () => {
    const s = summarizeBattery(report({}, 58000, 56000))!;
    expect(s.healthPct).toBe(100);
    expect(s.wearPct).toBe(0);
  });

  it("soma notebooks com duas baterias e usa o maior número de ciclos", () => {
    const r = report();
    r.batteries.push({
      ...r.batteries[0],
      fullChargeMwh: 20000,
      designMwh: 24000,
      cycleCount: 610,
    });
    const s = summarizeBattery(r)!;
    expect(s.batteryCount).toBe(2);
    expect(s.designMwh).toBe(80000);
    expect(s.healthPct).toBe(90);
    expect(s.cycleCount).toBe(610);
  });

  it("devolve null sem bateria", () => {
    expect(
      summarizeBattery({ ok: true, hasBattery: false, batteries: [], history: [] }),
    ).toBeNull();
  });

  it("ciclos ausentes ficam null", () => {
    const r = report();
    r.batteries[0].cycleCount = null;
    expect(summarizeBattery(r)!.cycleCount).toBeNull();
  });
});

describe("batteryLevel", () => {
  it.each([
    [100, "great"],
    [90, "great"],
    [89, "good"],
    [80, "good"],
    [79, "worn"],
    [60, "worn"],
    [59, "weak"],
  ] as const)("%i%% → %s", (pct, level) => {
    expect(batteryLevel(pct)).toBe(level);
  });
});

describe("lossPerYear", () => {
  it("anualiza a perda entre o primeiro e o último mês", () => {
    const loss = lossPerYear([
      { date: "2025-11-01", fullChargeMwh: 56000, designMwh: 56000 },
      { date: "2026-11-01", fullChargeMwh: 50400, designMwh: 56000 },
    ]);
    expect(loss).toBe(10);
  });

  it("precisa de pelo menos 60 dias de histórico", () => {
    expect(
      lossPerYear([
        { date: "2026-10-01", fullChargeMwh: 56000, designMwh: 56000 },
        { date: "2026-11-01", fullChargeMwh: 50000, designMwh: 56000 },
      ]),
    ).toBeNull();
    expect(lossPerYear([])).toBeNull();
  });

  it("não mostra ganho de capacidade como perda negativa", () => {
    expect(
      lossPerYear([
        { date: "2026-01-01", fullChargeMwh: 50000, designMwh: 56000 },
        { date: "2026-06-01", fullChargeMwh: 52000, designMwh: 56000 },
      ]),
    ).toBe(0);
  });
});

describe("batteryTips", () => {
  it("bateria saudável e uso misto: nenhuma dica", () => {
    expect(tipIds(report())).toEqual([]);
  });

  it("abaixo de 60%: sugere troca e oferece o relatório completo", () => {
    const tips = batteryTips(report({}, 30000), summarizeBattery(report({}, 30000))!);
    expect(tips[0].id).toBe("replace");
    expect(tips[0].tone).toBe("danger");
    expect(tips[0].action).toEqual({ kind: "report", label: "Abrir relatório completo" });
  });

  it("entre 60% e 80%: avisa do desgaste sem prometer conserto", () => {
    expect(tipIds(report({}, 40000))).toContain("worn");
  });

  it("muitos ciclos", () => {
    const r = report();
    r.batteries[0].cycleCount = 950;
    expect(tipIds(r)).toContain("cycles");
  });

  it("quase sempre na tomada: sugere limite de carga do fabricante", () => {
    expect(tipIds(report({ acShare: 0.95 }))).toContain("always-plugged");
    expect(tipIds(report({ acShare: 0.6 }))).not.toContain("always-plugged");
  });

  it("dicas nunca mudam configuração: só abrem o relatório ou o ms-settings", () => {
    const r = report({ activePlan: HIGH_PERF, onBattery: true, acShare: 0.95 }, 30000);
    r.runtime = { fullChargeSec: 3000, designSec: 9000 };
    r.batteries[0].cycleCount = 900;
    const actions = batteryTips(r, summarizeBattery(r)!).flatMap((t) =>
      t.action ? [t.action] : [],
    );
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      if (action.kind === "settings") expect(action.command).toMatch(/^start ms-settings:[\w-]+$/);
      else expect(action.kind).toBe("report");
    }
  });

  it("alto desempenho só vira dica quando está na bateria", () => {
    expect(tipIds(report({ activePlan: HIGH_PERF, onBattery: true }))).toContain("plan-on-battery");
    expect(tipIds(report({ activePlan: HIGH_PERF, onBattery: false }))).not.toContain(
      "plan-on-battery",
    );
  });

  it("autonomia curta sugere a Economia de bateria", () => {
    const tips = batteryTips(
      report({ runtime: { fullChargeSec: 5400, designSec: 9000 } }),
      summarizeBattery(report())!,
    );
    const tip = tips.find((t) => t.id === "short-runtime");
    expect(tip?.title).toBe("Autonomia estimada de 1 h 30 min");
    expect(tip?.action).toEqual({
      kind: "settings",
      label: "Ver apps que mais gastam",
      command: "start ms-settings:batterysaver-usagedetails",
    });
  });

  it("desgaste acelerado no histórico", () => {
    const r = report({
      history: [
        { date: "2025-11-01", fullChargeMwh: 56000, designMwh: 56000 },
        { date: "2026-11-01", fullChargeMwh: 47000, designMwh: 56000 },
      ],
    });
    expect(tipIds(r)).toContain("fast-wear");
  });

  it("notebook de demonstração mostra a dica de tomada", () => {
    expect(tipIds(SIMULATED_BATTERY)).toEqual(["always-plugged"]);
  });
});

describe("formatação", () => {
  it("isHighPerformancePlan reconhece GUID e nome", () => {
    expect(isHighPerformancePlan(HIGH_PERF)).toBe(true);
    expect(isHighPerformancePlan({ guid: "x", name: "High performance" })).toBe(true);
    expect(isHighPerformancePlan(BALANCED)).toBe(false);
    expect(isHighPerformancePlan(null)).toBe(false);
  });

  it("formatDuration", () => {
    expect(formatDuration(15000)).toBe("4 h 10 min");
    expect(formatDuration(7200)).toBe("2 h");
    expect(formatDuration(2700)).toBe("45 min");
    expect(formatDuration(0)).toBe("—");
  });

  it("formatWh usa vírgula decimal", () => {
    expect(formatWh(48740)).toBe("48,7 Wh");
  });

  it("monthLabel", () => {
    expect(monthLabel("2026-11-28")).toBe("nov/26");
    expect(monthLabel("lixo")).toBe("lixo");
  });
});
