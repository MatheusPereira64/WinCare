import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ChoiceChips } from "./ChoiceChips";

const OPTIONS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
];

function Controlled({ onChange = () => {} }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("30");
  return (
    <ChoiceChips
      label="Período"
      value={value}
      options={OPTIONS}
      onChange={(v) => {
        onChange(v);
        setValue(v);
      }}
    />
  );
}

describe("ChoiceChips", () => {
  it("é um radiogroup com a opção atual marcada", () => {
    render(<Controlled />);
    const group = screen.getByRole("radiogroup", { name: "Período" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "30 dias" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "7 dias" })).not.toBeChecked();
  });

  it("um único ponto no Tab: só o selecionado é focável", () => {
    render(<Controlled />);
    expect(screen.getByRole("radio", { name: "30 dias" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "7 dias" })).toHaveAttribute("tabindex", "-1");
  });

  it("clicar troca; clicar no já marcado não chama onChange", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "30 dias" }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("radio", { name: "90 dias" }));
    expect(onChange).toHaveBeenCalledWith("90");
    expect(screen.getByRole("radio", { name: "90 dias" })).toBeChecked();
  });

  it("setas do teclado mudam a seleção", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    screen.getByRole("radio", { name: "30 dias" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "90 dias" })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("90");
  });

  it("desabilitado não responde", async () => {
    const onChange = vi.fn();
    render(
      <ChoiceChips
        label="Zoom"
        value="1"
        options={[
          { value: "1", label: "100%" },
          { value: "2", label: "200%" },
        ]}
        onChange={onChange}
        disabled
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: "200%" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
