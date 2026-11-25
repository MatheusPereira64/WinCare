import { ArrowDownRight, ArrowUpRight, CalendarDays, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { compareWeeks, type WeekTotals } from "@/lib/wincare/history";
import { formatBytes } from "@/lib/wincare/report";
import type { MaintenanceHistory } from "@/lib/wincare/types";
import { Panel, PanelHeader } from "./Panel";

type Metric = {
  label: string;
  value: (t: WeekTotals) => number | null;
  format: (n: number) => string;
  /** Como escrever a diferença (padrão: igual ao valor). */
  formatDelta?: (n: number) => string;
  /** Subir é bom (saúde, espaço liberado) ou só informativo. */
  goodUp: boolean;
};

const METRICS: Metric[] = [
  { label: "Espaço liberado", value: (t) => t.freedBytes, format: formatBytes, goodUp: true },
  { label: "Manutenções", value: (t) => t.maintenance, format: (n) => String(n), goodUp: true },
  {
    label: "Programas removidos",
    value: (t) => t.programsRemoved,
    format: (n) => String(n),
    goodUp: true,
  },
  {
    label: "Saúde média",
    value: (t) => t.healthAvg,
    format: (n) => `${n}%`,
    formatDelta: (n) => `${n} ${n === 1 ? "ponto" : "pontos"}`,
    goodUp: true,
  },
];

/**
 * Resumo semanal: últimos 7 dias × os 7 anteriores. É o mesmo cálculo da
 * notificação de segunda de manhã (Configurações → Resumo semanal de saúde).
 */
export function WeeklyReport({
  history,
  now,
}: {
  history: Pick<MaintenanceHistory, "events" | "health">;
  now: number;
}) {
  const { week, previous } = compareWeeks(history, now);
  return (
    <Panel data-wincare-weekly>
      <PanelHeader
        icon={CalendarDays}
        size="sm"
        title="Esta semana × semana passada"
        description="Últimos 7 dias comparados com os 7 anteriores."
      />
      <dl className="grid gap-3 @2xl/main:grid-cols-4">
        {METRICS.map((m) => {
          const now = m.value(week);
          const before = m.value(previous);
          const delta = now !== null && before !== null ? now - before : null;
          const up = delta !== null && delta > 0;
          const down = delta !== null && delta < 0;
          const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
          const good = (up && m.goodUp) || (down && !m.goodUp);
          return (
            <div key={m.label} className="rounded-2xl border border-border/60 bg-card/60 p-4">
              <dt className="text-xs text-muted-foreground">{m.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {now === null ? "—" : m.format(now)}
              </dd>
              <dd
                className={cn(
                  "mt-1 flex items-center gap-1 text-xs",
                  delta === null || delta === 0
                    ? "text-muted-foreground"
                    : good
                      ? "text-success"
                      : "text-warning",
                )}
              >
                <Icon aria-hidden className="size-3.5" />
                {before === null
                  ? "sem dados da semana anterior"
                  : delta === 0
                    ? "igual à semana passada"
                    : `${delta! > 0 ? "+" : "−"}${(m.formatDelta ?? m.format)(Math.abs(delta!))} vs. semana passada`}
              </dd>
            </div>
          );
        })}
      </dl>
    </Panel>
  );
}
