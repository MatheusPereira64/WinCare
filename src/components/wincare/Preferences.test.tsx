import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Zap } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { SettingSwitch } from "./Preferences";

function Harness({ onChange }: { onChange: (v: boolean) => void }) {
  const [checked, setChecked] = useState(true);
  return (
    <SettingSwitch
      icon={Zap}
      label="Avisar sobre problemas ao abrir"
      description="Mostra um aviso se algo medido precisar de atenção."
      checked={checked}
      onCheckedChange={(v) => {
        onChange(v);
        setChecked(v);
      }}
    />
  );
}

describe("SettingSwitch", () => {
  it("o switch, o título e a descrição alternam exatamente uma vez por clique", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "Avisar sobre problemas ao abrir" });
    expect(sw).toBeChecked();

    await user.click(sw);
    expect(sw).not.toBeChecked();

    await user.click(screen.getByText("Avisar sobre problemas ao abrir"));
    expect(sw).toBeChecked();

    await user.click(screen.getByText(/Mostra um aviso/));
    expect(sw).not.toBeChecked();

    expect(onChange.mock.calls.map((c) => c[0])).toEqual([false, true, false]);
  });

  it("desativado não muda com clique na linha", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SettingSwitch
        icon={Zap}
        label="Opção"
        description="Texto"
        checked={false}
        disabled
        onCheckedChange={onChange}
      />,
    );
    await user.click(screen.getByText("Texto"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
