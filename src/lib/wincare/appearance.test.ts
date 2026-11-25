import { describe, expect, it } from "vitest";

import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  LAYOUT_PRESETS,
  matchLayoutPreset,
  matchThemePreset,
  sanitizeAppearance,
  sanitizeThemeMode,
  THEME_PRESETS,
} from "./appearance";

describe("aparência", () => {
  it("valores inválidos ou de versões antigas voltam ao padrão", () => {
    expect(sanitizeAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(sanitizeAppearance({ accent: "neon", radius: "square", density: 3 })).toEqual({
      ...DEFAULT_APPEARANCE,
      radius: "square",
    });
    expect(sanitizeThemeMode("system", "dark")).toBe("system");
    expect(sanitizeThemeMode("sepia", "light")).toBe("light");
  });

  it("reconhece o tema e o layout prontos da escolha atual", () => {
    const amethyst = THEME_PRESETS.find((p) => p.id === "amethyst")!;
    expect(
      matchThemePreset("dark", {
        ...DEFAULT_APPEARANCE,
        accent: amethyst.accent,
        surface: amethyst.surface,
      }),
    ).toBe("amethyst");
    expect(matchThemePreset("light", DEFAULT_APPEARANCE)).toBe("daylight");
    expect(matchThemePreset("system", DEFAULT_APPEARANCE)).toBeUndefined();

    const compact = LAYOUT_PRESETS.find((p) => p.id === "compact")!;
    expect(matchLayoutPreset({ ...DEFAULT_APPEARANCE, ...compact.values }, false)).toBe("compact");
    expect(matchLayoutPreset({ ...DEFAULT_APPEARANCE, ...compact.values }, true)).toBeUndefined();
    expect(matchLayoutPreset(DEFAULT_APPEARANCE, true)).toBe("default");
  });

  it("presets só usam valores válidos", () => {
    for (const p of THEME_PRESETS) {
      expect(sanitizeAppearance({ accent: p.accent, surface: p.surface })).toMatchObject({
        accent: p.accent,
        surface: p.surface,
      });
    }
    for (const p of LAYOUT_PRESETS) {
      expect(sanitizeAppearance(p.values)).toMatchObject(p.values);
    }
  });

  it("escreve só o que difere do padrão como atributo no <html>", () => {
    applyAppearance({ ...DEFAULT_APPEARANCE, accent: "emerald", cards: "outline" });
    const root = document.documentElement;
    expect(root.dataset.accent).toBe("emerald");
    expect(root.dataset.cards).toBe("outline");
    expect(root.hasAttribute("data-density")).toBe(false);
    applyAppearance(DEFAULT_APPEARANCE);
    expect(root.hasAttribute("data-accent")).toBe(false);
  });
});
