import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RunRecord } from "./types";

/* O store é um módulo com estado: cada teste carrega uma cópia nova. */
async function freshStore() {
  vi.resetModules();
  return import("./store");
}

/** A gravação no localStorage é adiada para o próximo tick. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const saved = () => JSON.parse(localStorage.getItem("wincare-state") ?? "null");

const run = (i: number, overrides: Partial<RunRecord> = {}): RunRecord => ({
  id: `r${i}`,
  toolId: "sfc",
  toolName: "SFC",
  command: "sfc /scannow",
  startedAt: i,
  status: "success",
  lines: Array.from({ length: 50 }, (_, n) => ({
    time: "12:00:00",
    text: `linha ${n}`,
    kind: "output" as const,
  })),
  ...overrides,
});

beforeEach(() => {
  document.documentElement.classList.remove("light");
});

describe("hydrateStore", () => {
  it("primeira execução: padrões, tema escuro e introdução pendente", async () => {
    const { hydrateStore, getStoreState } = await freshStore();
    hydrateStore();
    const s = getStoreState();
    expect(s.theme).toBe("dark");
    expect(s.favorites).toEqual(["sfc", "temp"]);
    expect(s.onboardingDone).toBe(false);
    expect(document.documentElement).not.toHaveClass("light");
  });

  it("estado salvo é limpo: execuções em andamento, limites e campos inválidos", async () => {
    localStorage.setItem(
      "wincare-state",
      JSON.stringify({
        theme: "light",
        favorites: "não é lista",
        zoom: 9,
        lastCheckupAt: "ontem",
        runs: [
          run(0, { status: "running" }),
          run(1, { command: "x".repeat(900) }),
          ...Array.from({ length: 40 }, (_, i) => run(i + 2)),
        ],
      }),
    );
    const { hydrateStore, getStoreState } = await freshStore();
    hydrateStore();
    const s = getStoreState();
    expect(s.runs).toHaveLength(30);
    expect(s.runs.some((r) => r.status === "running")).toBe(false);
    expect(s.runs[0].command).toHaveLength(500);
    expect(s.runs[0].lines).toHaveLength(30);
    expect(s.runs[0].lines[0].text).toBe("linha 20");
    expect(s.favorites).toEqual(["sfc", "temp"]);
    expect(s.zoom).toBe(2);
    expect(s.lastCheckupAt).toBeNull();
    // Estado de versão anterior (sem o campo) = já conhece o app.
    expect(s.onboardingDone).toBe(true);
    expect(document.documentElement).toHaveClass("light");
  });

  it("JSON corrompido: descarta e volta ao padrão", async () => {
    localStorage.setItem("wincare-state", "{quebrado");
    const { hydrateStore, getStoreState } = await freshStore();
    hydrateStore();
    expect(localStorage.getItem("wincare-state")).toBeNull();
    expect(getStoreState().theme).toBe("dark");
  });

  it("estado grande demais (> 512 KB) é descartado", async () => {
    localStorage.setItem(
      "wincare-state",
      JSON.stringify({ theme: "light", pad: "x".repeat(600_000) }),
    );
    const { hydrateStore, getStoreState } = await freshStore();
    hydrateStore();
    expect(localStorage.getItem("wincare-state")).toBeNull();
    expect(getStoreState().theme).toBe("dark");
  });

  it("adiamentos vencidos somem ao abrir; ignoradas ficam", async () => {
    const now = Date.now();
    localStorage.setItem(
      "wincare-state",
      JSON.stringify({
        dismissedRecommendations: {
          vencida: { until: now - 1000, at: now - 5000 },
          adiada: { until: now + 86_400_000, at: now },
          ignorada: { until: null, at: now },
          invalida: { until: "amanhã" },
        },
      }),
    );
    const { hydrateStore, getStoreState } = await freshStore();
    hydrateStore();
    expect(Object.keys(getStoreState().dismissedRecommendations).sort()).toEqual([
      "adiada",
      "ignorada",
    ]);
  });
});

describe("actions", () => {
  it("persistem no localStorage (com o limite de linhas por execução)", async () => {
    const { actions, hydrateStore, getStoreState } = await freshStore();
    hydrateStore();
    actions.setTheme("light");
    actions.toggleFavorite("dism-check");
    actions.toggleFavorite("sfc");
    actions.upsertRun(run(1, { lines: run(1).lines.concat(run(1).lines, run(1).lines) }));
    expect(getStoreState().runs[0].lines).toHaveLength(120);
    await flush();
    const data = saved();
    expect(data.theme).toBe("light");
    expect(data.favorites).toEqual(["temp", "dism-check"]);
    expect(data.runs[0].lines).toHaveLength(30);
    expect(document.documentElement).toHaveClass("light");
  });

  it("upsertRun substitui a execução com o mesmo id e põe no topo", async () => {
    const { actions, getStoreState } = await freshStore();
    actions.upsertRun(run(1));
    actions.upsertRun(run(2));
    actions.upsertRun(run(1, { status: "error" }));
    expect(getStoreState().runs.map((r) => [r.id, r.status])).toEqual([
      ["r1", "error"],
      ["r2", "success"],
    ]);
  });

  it("adiar, ignorar e restaurar recomendações", async () => {
    const { actions, getStoreState } = await freshStore();
    const before = Date.now();
    actions.snoozeRecommendation("uptime", 7);
    actions.ignoreRecommendation("schedule");
    const d = getStoreState().dismissedRecommendations;
    expect(d.uptime.until).toBeGreaterThanOrEqual(before + 7 * 86_400_000);
    expect(d.schedule.until).toBeNull();
    actions.restoreRecommendation("uptime");
    expect(Object.keys(getStoreState().dismissedRecommendations)).toEqual(["schedule"]);
  });

  it("zoom fica dentro da faixa e anda em passos", async () => {
    const { actions } = await freshStore();
    expect(actions.setZoom(0.1)).toBe(0.8);
    expect(actions.setZoom(5)).toBe(2);
    actions.setZoom(1);
    expect(actions.stepZoom("in")).toBeGreaterThan(1);
    expect(actions.stepZoom("reset")).toBe(1);
  });

  it("limpar dados apaga o localStorage e o histórico de execuções", async () => {
    const { actions, getStoreState } = await freshStore();
    actions.upsertRun(run(1));
    await flush();
    expect(saved()).not.toBeNull();
    actions.clearPersistedState();
    expect(getStoreState().runs).toEqual([]);
  });
});
