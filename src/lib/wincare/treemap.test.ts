import { describe, expect, it } from "vitest";

import { squarify } from "./treemap";

const area = (r: { w: number; h: number }) => r.w * r.h;

describe("squarify", () => {
  it("cobre o contêiner inteiro com área proporcional a cada valor", () => {
    const input = [
      { id: "a", value: 6 },
      { id: "b", value: 6 },
      { id: "c", value: 4 },
      { id: "d", value: 3 },
      { id: "e", value: 2 },
      { id: "f", value: 2 },
      { id: "g", value: 1 },
    ];
    const rects = squarify(input, 600, 400);
    expect(rects).toHaveLength(7);
    const total = rects.reduce((n, r) => n + area(r), 0);
    expect(total).toBeCloseTo(100 * 100, 3);
    const a = rects.find((r) => r.id === "a")!;
    const g = rects.find((r) => r.id === "g")!;
    expect(area(a) / area(g)).toBeCloseTo(6, 3);
  });

  it("não deixa blocos sair do contêiner", () => {
    const input = Array.from({ length: 40 }, (_, i) => ({ id: String(i), value: 100 / (i + 1) }));
    for (const r of squarify(input, 900, 360)) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-6);
      expect(r.y).toBeGreaterThanOrEqual(-1e-6);
      expect(r.x + r.w).toBeLessThanOrEqual(100 + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(100 + 1e-6);
    }
  });

  it("mantém os blocos grandes perto de quadrados", () => {
    const rects = squarify(
      [
        { id: "a", value: 50 },
        { id: "b", value: 30 },
        { id: "c", value: 20 },
      ],
      400,
      400,
    );
    const a = rects.find((r) => r.id === "a")!;
    // Em pixels (contêiner quadrado): proporção bem menor que uma faixa fina.
    const ratio = Math.max(a.w / a.h, a.h / a.w);
    expect(ratio).toBeLessThan(2.5);
  });

  it("ignora valores zerados e lista vazia", () => {
    expect(squarify([])).toEqual([]);
    expect(squarify([{ id: "x", value: 0 }])).toEqual([]);
    expect(squarify([{ id: "x", value: 5 }])).toEqual([{ id: "x", x: 0, y: 0, w: 100, h: 100 }]);
  });
});
