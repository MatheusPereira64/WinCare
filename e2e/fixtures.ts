import { test as base, expect, type Page } from "@playwright/test";

/**
 * Página do WinCare pronta para teste: modo demonstração, introdução já vista,
 * relógio e sorteios fixos (as métricas simuladas usam Math.random), sem
 * checagem automática ao abrir. Navegue com `openRoute(page, "/limpeza")`.
 */

/** Quarta-feira, 18/11/2026, 12:00 em Brasília (mesma data das fixtures dos testes unitários). */
const FIXED_NOW = new Date("2026-11-18T12:00:00-03:00");

export interface AppOptions {
  theme: "dark" | "light";
  /**
   * Relógio parado: nenhum timer roda sozinho; avance com `settle(page, ms)`.
   * Usado nos testes visuais para que o número de atualizações (o painel
   * atualiza a cada 3 s) seja sempre o mesmo.
   */
  frozenClock: boolean;
}

export const test = base.extend<AppOptions>({
  theme: ["dark", { option: true }],
  frozenClock: [false, { option: true }],
  page: async ({ page, theme, frozenClock }, use) => {
    await page.clock.install({ time: new Date(FIXED_NOW.getTime() - 1000) });
    if (frozenClock) await page.clock.pauseAt(FIXED_NOW);
    await page.addInitScript(
      ({ theme }) => {
        /* PRNG determinístico (mulberry32) no lugar de Math.random. */
        let seed = 0x5eed;
        Math.random = () => {
          seed |= 0;
          seed = (seed + 0x6d2b79f5) | 0;
          let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        if (!sessionStorage.getItem("wincare-e2e-seeded")) {
          sessionStorage.setItem("wincare-e2e-seeded", "1");
          localStorage.clear();
          localStorage.setItem(
            "wincare-state",
            JSON.stringify({
              theme,
              autoCheck: false,
              autoCheckUpdates: false,
              favorites: ["sfc", "temp"],
              onboardingDone: true,
            }),
          );
        }
      },
      { theme },
    );
    await use(page);
  },
});

/** Avança o relógio parado em `ms`, disparando os timers na ordem. */
export async function settle(page: Page, ms = 3000) {
  await page.clock.runFor(ms);
}

/**
 * Igual a `openRoute`, com o relógio parado: a inicialização do app usa
 * timers, então o relógio avança em passos de 100 ms até o conteúdo aparecer.
 */
export async function openRouteFrozen(page: Page, route = "/") {
  await page.goto(`/#${route}`);
  const content = page.locator("#conteudo");
  for (let i = 0; i < 100 && !(await content.isVisible()); i++) {
    await page.clock.runFor(100);
  }
  await expect(content).toBeVisible();
}

/** Abre uma rota (o app usa hash history) e espera o conteúdo principal. */
export async function openRoute(page: Page, route = "/") {
  await page.goto(`/#${route}`);
  await expect(page.locator("#conteudo")).toBeVisible();
}

export { expect };
