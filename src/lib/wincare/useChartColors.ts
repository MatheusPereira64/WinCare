import { useMemo } from "react";

import { useStore } from "./store";
import { themeColor } from "./themeTransition";

/**
 * Cores dos gráficos (ApexCharts precisa de cor literal) lidas do tema atual:
 * acompanham claro/escuro, a cor de destaque e o fundo escolhidos na Aparência.
 */
export function useChartColors() {
  const theme = useStore((s) => s.theme);
  const appearance = useStore((s) => s.appearance);
  return useMemo(() => {
    void theme;
    void appearance;
    return {
      muted: themeColor("--muted-foreground", "#9aa2ae"),
      strong: themeColor("--foreground", "#f1f4f7"),
      grid: `${themeColor("--border", "#2a3142")}cc`,
      track: themeColor("--muted", "#2e3650"),
      series: [
        themeColor("--chart-1", "#548dfc"),
        themeColor("--chart-2", "#43c6f5"),
        themeColor("--chart-3", "#a78bfa"),
        themeColor("--chart-4", "#fbbf24"),
      ],
    };
  }, [theme, appearance]);
}
