import { afterEach, describe, expect, it, vi } from "vitest";

import { runThemeChange } from "./themeTransition";

const twoFrames = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

describe("runThemeChange", () => {
  afterEach(() => {
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    document.documentElement.removeAttribute("data-motion");
  });

  it("desliga as transições dos elementos durante a troca e religa depois", async () => {
    const apply = vi.fn(() => {
      expect(document.documentElement.classList.contains("theme-switching")).toBe(true);
    });
    runThemeChange(apply);
    expect(apply).toHaveBeenCalledTimes(1);
    await twoFrames();
    await twoFrames();
    expect(document.documentElement.classList.contains("theme-switching")).toBe(false);
  });

  it("usa uma única View Transition quando disponível", async () => {
    const start = vi.fn((cb: () => Promise<void> | void) => {
      const done = Promise.resolve(cb());
      return { finished: done.then(() => undefined) };
    });
    (document as unknown as { startViewTransition: typeof start }).startViewTransition = start;
    const apply = vi.fn();
    runThemeChange(apply);
    await Promise.resolve();
    expect(start).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("com animações desligadas troca na hora, sem View Transition", () => {
    const start = vi.fn();
    (document as unknown as { startViewTransition: typeof start }).startViewTransition = start;
    document.documentElement.dataset.motion = "reduced";
    const apply = vi.fn();
    runThemeChange(apply);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });
});
