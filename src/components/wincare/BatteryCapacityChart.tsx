import { useId, useState } from "react";

import { cn } from "@/lib/utils";
import { monthLabel } from "@/lib/wincare/battery";

/** Rótulos em inteiros (como a saúde no card); a linha usa o valor exato. */
const pct = (value: number) => `${Math.round(value)}%`;

interface Point {
  date: string;
  healthPct: number;
}

/**
 * Saúde da bateria mês a mês (uma série). A linha tracejada no topo é a
 * capacidade de projeto (100%). Passar o mouse mostra o mês e o valor; a
 * tabela logo abaixo traz os mesmos números para teclado e Narrador.
 */
export function BatteryCapacityChart({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const tableId = useId();
  if (points.length < 2) return null;

  const values = points.map((p) => p.healthPct);
  const min = Math.min(...values);
  /* Eixo começa num múltiplo de 5 abaixo do menor valor (até 80% fica sempre visível). */
  const lo = Math.max(0, Math.floor((Math.min(min, 85) - 5) / 5) * 5);
  const hi = 100;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const line = points.map((p, i) => `${x(i)},${y(p.healthPct)}`).join(" ");
  const area = `0,100 ${line} 100,100`;
  const first = points[0];
  const last = points[points.length - 1];
  const active = hover !== null ? points[hover] : null;
  const summary = `Saúde da bateria de ${monthLabel(first.date)} a ${monthLabel(last.date)}: de ${pct(first.healthPct)} para ${pct(last.healthPct)}.`;

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Capacidade ao longo do tempo</span>
        <span className="text-xs text-muted-foreground">
          % da carga original · tracejado = 100% (nova)
        </span>
      </figcaption>
      <div className="flex gap-2">
        <div
          aria-hidden
          className="flex w-9 shrink-0 flex-col justify-between py-0 text-right text-[11px] tabular-nums text-muted-foreground"
        >
          <span className="-translate-y-1/2">{hi}%</span>
          <span className="translate-y-1/2">{lo}%</span>
        </div>
        <div
          className="relative h-36 min-w-0 flex-1"
          role="img"
          aria-label={summary}
          aria-describedby={tableId}
          onMouseLeave={() => setHover(null)}
          data-wincare-battery-chart
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible text-primary"
            aria-hidden
          >
            <line
              x1="0"
              x2="100"
              y1="0"
              y2="0"
              stroke="currentColor"
              className="text-muted-foreground/60"
              strokeDasharray="4 4"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="0"
              x2="100"
              y1="100"
              y2="100"
              stroke="currentColor"
              className="text-border"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <polygon points={area} fill="currentColor" opacity="0.08" />
            <polyline
              points={line}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {active && (
              <line
                x1={x(hover!)}
                x2={x(hover!)}
                y1="0"
                y2="100"
                stroke="currentColor"
                className="text-muted-foreground"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Ponto do valor atual (sempre) e do mês sob o mouse — HTML para ficarem redondos. */}
          {[
            points.length - 1,
            ...(hover !== null && hover !== points.length - 1 ? [hover] : []),
          ].map((i) => (
            <span
              key={i}
              aria-hidden
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
              style={{ left: `${x(i)}%`, top: `${y(points[i].healthPct)}%` }}
            />
          ))}

          {/* Faixas de captura maiores que a marca: uma por mês. */}
          <div aria-hidden className="absolute inset-0 flex">
            {points.map((p, i) => (
              <span
                key={p.date}
                className="h-full flex-1"
                onMouseEnter={() => setHover(i)}
                data-testid="battery-chart-hit"
              />
            ))}
          </div>

          {active && (
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-0 z-10 rounded-lg border border-border/60 bg-popover px-2.5 py-1.5 text-xs shadow-md",
                x(hover!) > 60 ? "-translate-x-full -ml-2" : "ml-2",
              )}
              style={{ left: `${x(hover!)}%` }}
            >
              <p className="text-muted-foreground">{monthLabel(active.date)}</p>
              <p className="font-semibold tabular-nums text-foreground">{pct(active.healthPct)}</p>
            </div>
          )}
        </div>
      </div>
      <div aria-hidden className="flex justify-between pl-11 text-[11px] text-muted-foreground">
        <span>{monthLabel(first.date)}</span>
        <span>{monthLabel(last.date)}</span>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none rounded hover:text-foreground">
          Ver em tabela
        </summary>
        <table id={tableId} className="mt-2 w-full max-w-xs text-left tabular-nums">
          <caption className="sr-only">Saúde da bateria por mês</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 font-medium">
                Mês
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Saúde
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date} className="border-t border-border/60">
                <td className="py-1">{monthLabel(p.date)}</td>
                <td className="py-1 text-right text-foreground">{pct(p.healthPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
