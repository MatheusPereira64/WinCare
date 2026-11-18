import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SIMULATED_BATTERY } from "@/lib/wincare/bridge";
import type { BatteryReport } from "@/lib/wincare/types";
import { BatteryCard } from "./BatteryCard";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

/** Simula o preload do Electron só com o que o card usa. */
function installNative(overrides: Record<string, unknown>) {
  const native = {
    run: vi.fn(async () => ({ code: 0, result: "" })),
    batteryReport: vi.fn(async (): Promise<BatteryReport> => SIMULATED_BATTERY),
    openBatteryReport: vi.fn(async () => ({ ok: true, path: "C:\\battery-report.html" })),
    powerPlan: vi.fn(async () => ({
      ok: true,
      plans: [],
      active: { guid: "381b4222-f694-41f0-9685-ff5bb260df2e", name: "Equilibrado", active: true },
    })),
    ...overrides,
  };
  (window as unknown as { wincare: unknown }).wincare = native;
  return native;
}

beforeEach(() => {
  vi.mocked(toast.info).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("BatteryCard (demonstração no navegador)", () => {
  it("mostra saúde, desgaste, ciclos e capacidade", async () => {
    render(<BatteryCard />);
    expect(screen.getByRole("status")).toHaveTextContent("Lendo o relatório de bateria");

    expect(await screen.findByTestId("battery-health")).toHaveTextContent("87%");
    expect(screen.getByText("Boa")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Saúde da bateria: 87%" })).toBeInTheDocument();

    const stats = screen.getByText("Desgaste").closest("dl")!;
    expect(within(stats).getByText("13%")).toBeInTheDocument();
    expect(within(stats).getByText("412")).toBeInTheDocument();
    expect(within(stats).getByText("48,7 Wh")).toBeInTheDocument();
    expect(within(stats).getByText("de 56,0 Wh quando nova")).toBeInTheDocument();
    expect(within(stats).getByText("4 h 10 min")).toBeInTheDocument();
  });

  it("mostra o gráfico com resumo para o Narrador e a tabela", async () => {
    render(<BatteryCard />);
    const chart = await screen.findByRole("img", { name: /Saúde da bateria de jun\/25 a nov\/26/ });
    expect(chart).toHaveAccessibleName(/de 99% para 87%/);
    const table = screen.getByRole("table", { name: "Saúde da bateria por mês", hidden: true });
    expect(within(table).getAllByRole("row", { hidden: true })).toHaveLength(19);
  });

  it("lista a dica que se aplica (quase sempre na tomada)", async () => {
    render(<BatteryCard />);
    const tips = await screen.findByRole("heading", { name: "Dicas de energia" });
    const list = tips.parentElement!.querySelector("ul")!;
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("Fica quase sempre na tomada")).toBeInTheDocument();
  });

  it("relatório completo avisa que só existe no app", async () => {
    render(<BatteryCard />);
    await screen.findByTestId("battery-health");
    await userEvent.click(screen.getByRole("button", { name: /Relatório completo/ }));
    expect(toast.info).toHaveBeenCalledWith("O relatório completo abre no app para Windows.");
  });
});

describe("BatteryCard (app para Windows)", () => {
  it("some em PCs sem bateria", async () => {
    const native = installNative({
      batteryReport: vi.fn(async () => ({
        ok: true,
        hasBattery: false,
        batteries: [],
        history: [],
      })),
    });
    const { container } = render(<BatteryCard />);
    await waitFor(() => expect(native.batteryReport).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("abre o relatório completo pelo processo principal", async () => {
    const native = installNative({});
    render(<BatteryCard />);
    await screen.findByTestId("battery-health");
    await userEvent.click(screen.getByRole("button", { name: /Relatório completo/ }));
    expect(native.openBatteryReport).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("alto desempenho na bateria: o botão só abre Energia e bateria (não muda o plano)", async () => {
    const native = installNative({
      batteryReport: vi.fn(async () => ({
        ...SIMULATED_BATTERY,
        acShare: 0.4,
        onBattery: true,
        activePlan: { guid: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c", name: "Alto desempenho" },
      })),
    });
    render(<BatteryCard />);
    await userEvent.click(await screen.findByRole("button", { name: "Abrir Energia e bateria" }));
    expect(native.run).toHaveBeenCalledWith("start ms-settings:powersleep", expect.any(Function));
    expect(native.powerPlan).not.toHaveBeenCalled();
  });

  it("ler de novo ignora o cache e chama o Windows outra vez", async () => {
    const native = installNative({});
    render(<BatteryCard />);
    await screen.findByTestId("battery-health");
    expect(native.batteryReport).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Ler a bateria de novo" }));
    await waitFor(() => expect(native.batteryReport).toHaveBeenCalledTimes(2));
  });

  it("falha na leitura: mostra o erro e tenta de novo", async () => {
    const batteryReport = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        reason: "powercfg falhou",
        hasBattery: false,
        batteries: [],
        history: [],
      })
      .mockResolvedValueOnce(SIMULATED_BATTERY);
    installNative({ batteryReport });
    render(<BatteryCard />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível ler a bateria");
    expect(alert).toHaveTextContent("powercfg falhou");
    await userEvent.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByTestId("battery-health")).toHaveTextContent("87%");
  });
});
