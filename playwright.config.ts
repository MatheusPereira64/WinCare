import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de ponta a ponta no build do renderer (dist/), em modo demonstração.
 *
 * - projeto "e2e":    fluxos principais (roda em qualquer sistema);
 * - projeto "visual": compara capturas com as referências em e2e/visual/__screenshots__.
 *   As referências são geradas no contêiner Linux oficial do Playwright
 *   (npm run test:visual:update) — a mesma imagem que o CI usa — para que a
 *   fonte e o antialiasing sejam idênticos. Ver docs/testes.md.
 *
 * Antes: npm run wincare:build (os scripts test:e2e/test:visual já fazem).
 */
const PORT = Number(process.env.WINCARE_E2E_PORT || 4173);
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }], ["github"]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    colorScheme: "dark",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      /*
       * No contêiner a renderização é idêntica entre execuções: a folga é mínima
       * de propósito. Com 1% da tela, trocar uma letra de um título passava.
       */
      maxDiffPixels: 10,
      threshold: 0.2,
    },
  },
  /* Sem {platform} no nome: as referências são sempre as do contêiner Linux. */
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFileName}/{arg}{ext}",
  projects: [
    {
      name: "e2e",
      testDir: "e2e/flows",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 860 } },
    },
    {
      name: "visual",
      testDir: "e2e/visual",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 860 } },
    },
  ],
  webServer: {
    command: `node scripts/serve-dist.cjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 30_000,
  },
});
