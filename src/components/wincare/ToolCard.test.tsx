import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { actions } from "@/lib/wincare/store";
import { TOOLS } from "@/lib/wincare/tools";
import { ToolCard } from "./ToolCard";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const tool = (id: string) => TOOLS.find((t) => t.id === id)!;

function installNative() {
  const native = {
    run: vi.fn(async () => ({ code: 0, result: "Imagem restaurada." })),
    isElevated: vi.fn(async () => true),
    createRestorePoint: vi.fn(async () => ({
      ok: true,
      status: "created",
      message: "Ponto criado.",
    })),
  };
  (window as unknown as { wincare: unknown }).wincare = native;
  return native;
}

beforeEach(() => {
  actions.setConfirmCritical(true);
  actions.setAutoRestorePoint(true);
  vi.mocked(toast.success).mockClear();
});

describe("ToolCard", () => {
  it("ação que pede confirmação abre o diálogo com risco e comando", async () => {
    const native = installNative();
    render(<ToolCard tool={tool("dism-restore")} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Executar Restaurar imagem do Windows" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Executar Restaurar imagem do Windows?",
    });
    expect(dialog).toHaveTextContent("Risco: Atenção");
    expect(dialog).toHaveTextContent("O Windows pode pedir permissão (UAC)");
    expect(dialog).toHaveTextContent("DISM /Online /Cleanup-Image /RestoreHealth");
    expect(native.run).not.toHaveBeenCalled();
  });

  it("cancelar não executa", async () => {
    const native = installNative();
    render(<ToolCard tool={tool("dism-restore")} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Executar Restaurar imagem do Windows" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(native.run).not.toHaveBeenCalled();
  });

  it("confirmar com ponto de restauração (padrão): cria o ponto e depois executa", async () => {
    const native = installNative();
    render(<ToolCard tool={tool("dism-restore")} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Executar Restaurar imagem do Windows" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("checkbox", { name: /Criar ponto de restauração antes/ }),
    ).toBeChecked();
    await userEvent.click(within(dialog).getByRole("button", { name: "Executar" }));
    await waitFor(() => expect(native.run).toHaveBeenCalled());
    expect(native.createRestorePoint).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Imagem restaurada."));
  });

  it("desmarcar o ponto de restauração executa sem criar o ponto", async () => {
    const native = installNative();
    render(<ToolCard tool={tool("dism-restore")} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Executar Restaurar imagem do Windows" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: /Criar ponto de restauração antes/ }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Executar" }));
    await waitFor(() => expect(native.run).toHaveBeenCalled());
    expect(native.createRestorePoint).not.toHaveBeenCalled();
  });

  it("com 'Confirmar comandos críticos' desligado, executa direto", async () => {
    actions.setConfirmCritical(false);
    const native = installNative();
    render(<ToolCard tool={tool("dism-restore")} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Executar Restaurar imagem do Windows" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(native.run).toHaveBeenCalled());
  });

  it("favoritar alterna o estado do botão", async () => {
    render(<ToolCard tool={tool("dism-check")} />);
    const fav = screen.getByRole("button", { name: "Favoritar DISM CheckHealth" });
    const before = fav.getAttribute("aria-pressed");
    await userEvent.click(fav);
    expect(fav.getAttribute("aria-pressed")).not.toBe(before);
  });
});
