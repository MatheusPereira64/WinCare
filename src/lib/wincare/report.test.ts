import { describe, expect, it } from "vitest";

import { SIMULATED_DISKS, SIMULATED_STARTUP, SIMULATED_SYSTEM } from "./bridge";
import { buildDiagnosticReport, formatBytes } from "./report";
import type { RunRecord } from "./types";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [-5, "0 B"],
    [Number.NaN, "0 B"],
    [512, "512 B"],
    [1536, "1,5 KB"],
    [5 * 1024 ** 2, "5,0 MB"],
    [2.75 * 1024 ** 3, "2,8 GB"],
    [3 * 1024 ** 4, "3,0 TB"],
  ])("%s → %s", (bytes, label) => {
    expect(formatBytes(bytes)).toBe(label);
  });
});

describe("buildDiagnosticReport", () => {
  const base = {
    system: SIMULATED_SYSTEM,
    disks: SIMULATED_DISKS,
    startup: SIMULATED_STARTUP,
  };

  it("traz as seções na ordem e os dados do sistema", () => {
    const text = buildDiagnosticReport(base);
    const order = [
      "▸ SISTEMA",
      "▸ DISCOS",
      "▸ ESPAÇO POR PASTA",
      "▸ INICIALIZAÇÃO",
      "▸ HISTÓRICO RECENTE",
      "▸ OBSERVAÇÕES",
    ].map((h) => text.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain(`Computador:     ${SIMULATED_SYSTEM.hostname}`);
    expect(text).toContain("Fonte:          Demonstração");
  });

  it("calcula o uso de cada disco", () => {
    const text = buildDiagnosticReport({
      ...base,
      disks: [
        { letter: "C:", model: "SSD X", type: "SSD", totalGb: 500, freeGb: 125, smart: "OK" },
      ],
    });
    expect(text).toContain("C: SSD X [SSD] — SMART OK, 125 GB livres / 500 GB (75% usado)");
  });

  it("listas vazias viram uma linha explicando, não seção em branco", () => {
    const text = buildDiagnosticReport({ ...base, disks: [], startup: [] });
    expect(text).toContain("(nenhuma unidade listada)");
    expect(text).toContain("(análise não executada)");
    expect(text).toContain("(nenhum item)");
    expect(text).toContain("(sem execuções registradas)");
  });

  it("pastas por tamanho, com as limpáveis marcadas", () => {
    const text = buildDiagnosticReport({
      ...base,
      diskUsage: [
        { id: "a", label: "Pequena", path: "", sizeBytes: 1024, clearable: false },
        { id: "b", label: "Grande", path: "", sizeBytes: 3 * 1024 ** 3, clearable: true },
      ] as never,
    });
    const big = text.indexOf("Grande: 3,0 GB [limpável]");
    const small = text.indexOf("Pequena: 1,0 KB");
    expect(big).toBeGreaterThan(0);
    expect(small).toBeGreaterThan(big);
  });

  it("mostra no máximo 12 execuções recentes", () => {
    const runs = Array.from({ length: 20 }, (_, i) => ({
      id: `r${i}`,
      toolId: "sfc",
      toolName: `Execução ${i}`,
      startedAt: Date.UTC(2026, 10, 18, 12, i),
      status: "success",
      result: "ok",
      lines: [],
    })) as unknown as RunRecord[];
    const text = buildDiagnosticReport({ ...base, runs });
    expect(text).toContain("Execução 11: success (ok)");
    expect(text).not.toContain("Execução 12:");
  });
});
