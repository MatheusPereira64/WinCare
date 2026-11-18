import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BatteryCapacityChart } from "./BatteryCapacityChart";

const POINTS = [
  { date: "2026-01-28", healthPct: 98 },
  { date: "2026-02-28", healthPct: 96 },
  { date: "2026-03-28", healthPct: 91 },
];

describe("BatteryCapacityChart", () => {
  it("resume a série em texto (primeiro e último mês)", () => {
    render(<BatteryCapacityChart points={POINTS} />);
    expect(
      screen.getByRole("img", {
        name: "Saúde da bateria de jan/26 a mar/26: de 98% para 91%.",
      }),
    ).toBeInTheDocument();
  });

  it("passar o mouse mostra o mês e o valor", () => {
    const { container } = render(<BatteryCapacityChart points={POINTS} />);
    const hits = screen.getAllByTestId("battery-chart-hit");
    expect(hits).toHaveLength(3);

    const chart = container.querySelector("[data-wincare-battery-chart]")!;
    expect(chart).not.toHaveTextContent("fev/26");
    fireEvent.mouseEnter(hits[1]);
    expect(chart).toHaveTextContent("fev/26");
    expect(chart).toHaveTextContent("96%");

    fireEvent.mouseLeave(chart);
    expect(chart).not.toHaveTextContent("96%");
  });

  it("não desenha com menos de dois pontos", () => {
    const { container } = render(<BatteryCapacityChart points={POINTS.slice(0, 1)} />);
    expect(container).toBeEmptyDOMElement();
  });
});
