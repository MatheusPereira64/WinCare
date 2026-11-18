import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ProgramUninstaller } from "./ProgramUninstaller";

describe("ProgramUninstaller (demonstração)", () => {
  it("lista os programas instalados com tamanho", async () => {
    render(<ProgramUninstaller />);
    const list = await screen.findByRole("list", { name: /programas/i });
    expect(within(list).getByText("Blender")).toBeInTheDocument();
    expect(within(list).getByText("Discord")).toBeInTheDocument();
  });

  it("desinstalar abre o assistente para o programa escolhido", async () => {
    render(<ProgramUninstaller />);
    await userEvent.click(await screen.findByRole("button", { name: "Desinstalar Blender" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Blender");
    expect(within(dialog).getByRole("button", { name: /Abrir desinstalador/ })).toBeInTheDocument();
  });
});
