import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { BrowserCleaner } from "./BrowserCleaner";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

describe("BrowserCleaner (demonstração)", () => {
  it("analisa e mostra o total encontrado por aplicativo", async () => {
    render(<BrowserCleaner />);
    expect(await screen.findByText(/encontrados em 5 aplicativos/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Google Chrome/ })).toBeInTheDocument();
  });

  it("limpar pede confirmação listando o que será apagado e conclui", async () => {
    render(<BrowserCleaner />);
    const clean = await screen.findByRole("button", { name: /^Limpar \d/ });
    await waitFor(() => expect(clean).toBeEnabled());
    await userEvent.click(clean);
    const dialog = await screen.findByRole("dialog", { name: /^Limpar .+\?$/ });
    expect(within(dialog).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(dialog).not.toHaveTextContent("Cookies e histórico não podem ser recuperados");
    await userEvent.click(within(dialog).getByRole("button", { name: "Limpar agora" }));
    // A limpeza de demonstração leva ~1 s de propósito.
    await waitFor(
      () =>
        expect(toast.success).toHaveBeenCalledWith(
          expect.stringMatching(/liberados$/),
          expect.anything(),
        ),
      { timeout: 3000 },
    );
  });

  it("cookies e histórico vêm desmarcados", async () => {
    render(<BrowserCleaner />);
    await screen.findByText(/Cookies e histórico ficam desmarcados/);
  });
});
