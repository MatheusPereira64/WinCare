import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HealthRing } from "./HealthRing";

describe("HealthRing", () => {
  it("anuncia a saúde arredondada", () => {
    render(<HealthRing value={86.6} />);
    expect(screen.getByRole("img", { name: "Saúde geral: 87%" })).toBeInTheDocument();
  });

  it("limita entre 0 e 100", () => {
    const { rerender } = render(<HealthRing value={140} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Saúde geral: 100%");
    rerender(<HealthRing value={-5} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Saúde geral: 0%");
  });

  it("carregando não mostra número", () => {
    render(<HealthRing value={50} loading />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Saúde geral: carregando");
  });
});
