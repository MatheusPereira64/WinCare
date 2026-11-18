import { expect, openRouteFrozen as openRoute, settle, test } from "../fixtures";

/*
 * Regressão visual: cada tela principal comparada com a referência em
 * __screenshots__/. Relógio parado + avanço fixo = mesmos dados em toda
 * execução. Referências geradas no contêiner Linux (npm run test:visual:update).
 */
test.use({ frozenClock: true });

const SCREENS: { name: string; route: string }[] = [
  { name: "dashboard", route: "/" },
  { name: "sistema", route: "/sistema" },
  { name: "limpeza", route: "/limpeza" },
  { name: "programas", route: "/programas" },
  { name: "reparo", route: "/reparo" },
  { name: "historico", route: "/historico" },
  { name: "configuracoes", route: "/configuracoes" },
];

for (const { name, route } of SCREENS) {
  test(`tela: ${name}`, async ({ page }) => {
    await openRoute(page, route);
    await settle(page, 3000);
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}

test("card da bateria (página inteira do card)", async ({ page }) => {
  await openRoute(page, "/sistema");
  await settle(page, 3000);
  const card = page.locator("[data-wincare-battery]");
  await expect(card.getByTestId("battery-health")).toHaveText("87%");
  await expect(card).toHaveScreenshot("bateria-card.png");
});

test("dashboard: cards de resumo com a bateria (notebook)", async ({ page }) => {
  await openRoute(page, "/");
  await settle(page, 3000);
  const row = page.locator("[data-wincare-battery-stat]").locator("..");
  await expect(row).toHaveScreenshot("dashboard-cards.png");
});

test("diálogo de confirmação com ponto de restauração", async ({ page }) => {
  await openRoute(page, "/reparo");
  await settle(page, 1000);
  await page.getByRole("button", { name: "Executar Restaurar imagem do Windows" }).click();
  await settle(page, 500);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveScreenshot("reparo-confirmacao.png");
});

test.describe("tema claro", () => {
  test.use({ theme: "light" });

  test("tela: dashboard (claro)", async ({ page }) => {
    await openRoute(page, "/");
    await settle(page, 3000);
    await expect(page).toHaveScreenshot("dashboard-claro.png");
  });

  test("card da bateria (claro)", async ({ page }) => {
    await openRoute(page, "/sistema");
    await settle(page, 3000);
    await expect(page.locator("[data-wincare-battery]")).toHaveScreenshot("bateria-card-claro.png");
  });
});
