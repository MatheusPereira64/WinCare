import { expect, openRoute, test } from "../fixtures";

const PAGES: [link: string, heading: string][] = [
  ["Monitoramento", "Monitoramento"],
  ["Inteligência", "Inteligência"],
  ["Reparo", "Reparo"],
  ["Limpeza", "Limpeza"],
  ["Programas", "Programas"],
  ["Disco", "Disco"],
  ["Inicialização", "Inicialização"],
  ["Agendamento", "Agendamento"],
  ["Sistema", "Sistema"],
  ["Redes", "Redes"],
  ["Histórico", "Histórico"],
  ["Dashboard", "Dashboard"],
];

test("a barra lateral leva a todas as páginas", async ({ page }) => {
  await openRoute(page, "/");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const nav = page.getByRole("navigation").first();
  for (const [link, heading] of PAGES) {
    await nav.getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("o painel mostra a saúde geral e recomendações", async ({ page }) => {
  await openRoute(page, "/");
  await expect(page.getByRole("img", { name: /^Saúde geral: \d+%$/ })).toBeVisible();
  const recs = page.getByRole("list", { name: "Recomendações" });
  await expect(recs.getByRole("listitem").first()).toBeVisible();
  await recs.getByRole("link", { name: "Limpar agora" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Limpeza" })).toBeVisible();
});

test("tema claro vale na hora e continua depois de reabrir", async ({ page }) => {
  await openRoute(page, "/configuracoes");
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/\blight\b/);
  const mode = page.getByRole("radiogroup", { name: "Modo de cor" });
  await mode.getByRole("radio", { name: "Claro" }).click();
  await expect(html).toHaveClass(/\blight\b/);
  await page.reload();
  await expect(mode.getByRole("radio", { name: "Claro" })).toBeChecked();
  await expect(html).toHaveClass(/\blight\b/);
});

test("tema e layout prontos mudam cores e layout e continuam depois de reabrir", async ({
  page,
}) => {
  await openRoute(page, "/configuracoes");
  const html = page.locator("html");
  const themes = page.getByRole("radiogroup", { name: "Temas prontos" });
  await themes.getByRole("radio", { name: /Ametista/ }).click();
  await expect(html).toHaveAttribute("data-accent", "violet");
  const layouts = page.getByRole("radiogroup", { name: "Layouts prontos" });
  await layouts.getByRole("radio", { name: /Compacto/ }).click();
  await expect(html).toHaveAttribute("data-density", "compact");
  await page.reload();
  await expect(html).toHaveAttribute("data-accent", "violet");
  await expect(html).toHaveAttribute("data-density", "compact");
  await page.getByRole("button", { name: "Restaurar aparência padrão" }).click();
  await expect(html).not.toHaveAttribute("data-accent", /.+/);
});
