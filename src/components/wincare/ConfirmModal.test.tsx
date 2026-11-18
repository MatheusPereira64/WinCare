import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmModal } from "./ConfirmModal";

function setup(open = true) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <>
      <button type="button">Abrir</button>
      <ConfirmModal
        open={open}
        title="Restaurar imagem do Windows?"
        confirmLabel="Executar"
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        Crie um ponto de restauração antes.
      </ConfirmModal>
    </>,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmModal", () => {
  it("é um diálogo com título e descrição", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Restaurar imagem do Windows?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Crie um ponto de restauração antes.");
  });

  it("fechado não renderiza nada", () => {
    setup(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirmar e cancelar chamam o callback certo", async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Executar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Esc cancela (com o foco no diálogo)", async () => {
    const { onCancel, onConfirm } = setup();
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement),
    );
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("leva o foco para dentro do diálogo", async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement),
    );
  });
});
