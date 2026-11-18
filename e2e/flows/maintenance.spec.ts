import { expect, openRoute, test } from "../fixtures";

/*
 * Fluxos de manutenção no modo demonstração. Cada ação concluída entra no
 * Histórico (recordDemoEvent), então o fim de cada fluxo confere lá.
 */

test("limpeza de navegadores entra no histórico", async ({ page }) => {
  await openRoute(page, "/limpeza");
  const clean = page.getByRole("button", { name: /^Limpar \d/ });
  await expect(clean).toBeEnabled();
  await clean.click();
  // A limpeza sempre confirma, listando o que será apagado.
  const dialog = page.getByRole("dialog", { name: /^Limpar .+\?$/ });
  await expect(dialog.getByRole("listitem").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Limpar agora" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/liberados$/).first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole("navigation").first().getByRole("link", { name: "Histórico" }).click();
  await expect(page.getByRole("region", { name: "Linha do tempo" })).toContainText(
    "Navegadores e apps limpos",
  );
});

test("desinstalar programa e remover sobras", async ({ page }) => {
  await openRoute(page, "/programas");
  await page.getByRole("button", { name: "Desinstalar Blender" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Blender");
  await dialog.getByRole("button", { name: /Abrir desinstalador/ }).click();

  const remove = dialog.getByRole("button", { name: /^Remover/ });
  await expect(remove).toBeVisible({ timeout: 10_000 });
  await remove.click();
  await expect(dialog.getByRole("button", { name: /Concluir|Fechar/ })).toBeVisible({
    timeout: 10_000,
  });
  await dialog.getByRole("button", { name: /Concluir|Fechar/ }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("navigation").first().getByRole("link", { name: "Histórico" }).click();
  const timeline = page.getByRole("region", { name: "Linha do tempo" });
  await expect(timeline).toContainText("Blender desinstalado");
  await expect(timeline).toContainText("Sobras de Blender removidas");
});

test("ferramenta segura roda e mostra a saída do comando", async ({ page }) => {
  await openRoute(page, "/reparo");
  // Ferramenta segura (só analisa): roda direto, sem diálogo de confirmação.
  await page.getByRole("button", { name: "Executar DISM CheckHealth" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const card = page.getByRole("article", { name: "DISM CheckHealth" });
  await expect(card).toContainText("Em andamento");
  /* A simulação segue o tempo estimado da ferramenta: adianta o relógio. */
  await page.clock.runFor(120_000);
  await expect(card).toContainText("Concluído");
  await expect(card).toContainText("A operação terminou com êxito.");
  await card.getByText("Detalhes técnicos").click();
  await expect(card).toContainText("Nenhuma corrupção de componente detectada.");
});

test("cancelar a confirmação não executa nada", async ({ page }) => {
  await openRoute(page, "/reparo");
  await page.getByRole("button", { name: "Executar Restaurar imagem do Windows" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Iniciando restauração da imagem...")).toHaveCount(0);
});
