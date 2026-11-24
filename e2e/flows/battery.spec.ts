import { expect, openRoute, test } from "../fixtures";

test.describe("Sistema → Bateria (notebook de demonstração)", () => {
  test.beforeEach(async ({ page }) => {
    await openRoute(page, "/sistema");
  });

  test("mostra saúde, desgaste, ciclos e capacidade", async ({ page }) => {
    const card = page.locator("[data-wincare-battery]");
    await expect(card.getByTestId("battery-health")).toHaveText("87%");
    await expect(card.getByText("Boa", { exact: true })).toBeVisible();
    await expect(card.getByRole("progressbar", { name: "Saúde da bateria: 87%" })).toBeVisible();
    await expect(card.getByRole("definition").filter({ hasText: /^13%$/ })).toBeVisible();
    await expect(card.getByRole("definition").filter({ hasText: /^412$/ })).toBeVisible();
    await expect(card.getByRole("definition").filter({ hasText: "48,7 Wh" })).toBeVisible();
  });

  test("gráfico de capacidade: dica ao passar o mouse e tabela", async ({ page }) => {
    const chart = page.locator("[data-wincare-battery-chart]");
    await expect(chart).toHaveAccessibleName(/de 99% para 87%/);
    // A seção de Proteção fica acima da bateria: rola até o gráfico antes do mouse.
    await chart.scrollIntoViewIfNeeded();
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await expect(chart).toContainText("jun/25");
    await expect(chart).toContainText("99%");

    await page.getByText("Ver em tabela").click();
    const table = page.getByRole("table", { name: "Saúde da bateria por mês" });
    await expect(table.getByRole("row")).toHaveCount(19);
  });

  test("dicas de energia e relatório completo", async ({ page }) => {
    const tips = page.getByRole("region", { name: "Dicas de energia" });
    await expect(tips.getByRole("listitem")).toHaveCount(1);
    await expect(tips).toContainText("Fica quase sempre na tomada");

    await page.getByRole("button", { name: "Relatório completo" }).click();
    await expect(page.getByText("O relatório completo abre no app para Windows.")).toBeVisible();
  });
});

test("Dashboard: resumo da bateria leva aos detalhes em Sistema", async ({ page }) => {
  await openRoute(page, "/");
  const tile = page.getByRole("link", { name: /^Bateria: 87% de saúde, Boa · 412 ciclos/ });
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page.getByRole("heading", { level: 1, name: "Sistema" })).toBeVisible();
  await expect(page.locator("[data-wincare-battery]")).toBeVisible();
});
