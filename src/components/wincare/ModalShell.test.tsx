import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ModalShell } from "./ConfirmModal";

/** Botão que abre o diálogo, como nas telas (o foco volta para ele ao fechar). */
function Harness({
  locked,
  dismissOnBackdrop,
  onClose = () => {},
}: {
  locked?: boolean;
  dismissOnBackdrop?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir diálogo
      </button>
      <ModalShell
        open={open}
        title="Desinstalar programa"
        locked={locked}
        dismissOnBackdrop={dismissOnBackdrop}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        footer={
          <>
            <button type="button">Primeiro</button>
            <button type="button">Último</button>
          </>
        }
      >
        Texto do diálogo.
      </ModalShell>
    </div>
  );
}

/* Como no app: #root existe fora do React e o diálogo vai para um portal no body. */
let root: HTMLDivElement;
beforeEach(() => {
  root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
});
afterEach(() => {
  // Desmonta antes de tirar o #root (os afterEach rodam do último para o primeiro).
  cleanup();
  root.remove();
});
const renderHarness = (ui: ReactElement) => render(ui, { container: root });

async function openDialog() {
  await userEvent.click(screen.getByRole("button", { name: "Abrir diálogo" }));
  const dialog = await screen.findByRole("dialog", { name: "Desinstalar programa" });
  await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
  return dialog;
}

const backdrop = (dialog: HTMLElement) => dialog.parentElement!;

describe("ModalShell", () => {
  it("clique fora fecha e o foco volta ao botão que abriu", async () => {
    renderHarness(<Harness />);
    const dialog = await openDialog();
    fireEvent.click(backdrop(dialog));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Abrir diálogo" })).toHaveFocus(),
    );
  });

  it("clique dentro do painel não fecha", async () => {
    renderHarness(<Harness />);
    const dialog = await openDialog();
    fireEvent.click(dialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("dismissOnBackdrop=false: clique fora não fecha, Esc fecha", async () => {
    const onClose = vi.fn();
    renderHarness(<Harness dismissOnBackdrop={false} onClose={onClose} />);
    const dialog = await openDialog();
    fireEvent.click(backdrop(dialog));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("bloqueado (etapa em andamento): nem Esc nem clique fora fecham", async () => {
    const onClose = vi.fn();
    renderHarness(<Harness locked onClose={onClose} />);
    const dialog = await openDialog();
    await userEvent.keyboard("{Escape}");
    fireEvent.click(backdrop(dialog));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("deixa o resto do app inerte enquanto aberto", async () => {
    renderHarness(<Harness />);
    await openDialog();
    expect(root).toHaveAttribute("inert");
    await userEvent.keyboard("{Escape}");
    expect(root).not.toHaveAttribute("inert");
  });
});
