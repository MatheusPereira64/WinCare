import { cn } from "@/lib/utils";

interface Series {
  values: number[];
  /** Classe de cor (text-*): a linha e o preenchimento usam currentColor. */
  className: string;
}

/**
 * Gráfico de área leve (SVG puro, sem biblioteca): várias séries sobrepostas,
 * grade de fundo e um ponto no valor mais recente. Decorativo para o leitor de
 * tela — quem usa sempre mostra os números ao lado.
 */
export function AreaChart({
  series,
  max = 100,
  grid = true,
  className,
}: {
  series: Series[];
  /** Topo da escala (cresce sozinho se algum valor passar). */
  max?: number;
  grid?: boolean;
  className?: string;
}) {
  const top = Math.max(max, ...series.flatMap((s) => s.values), 1);
  const point = (values: number[], i: number) => ({
    x: values.length < 2 ? 100 : (i / (values.length - 1)) * 100,
    y: 100 - (values[i] / top) * 92,
  });
  const line = (values: number[]) =>
    values.map((_, i) => `${i ? "L" : "M"}${point(values, i).x},${point(values, i).y}`).join(" ");

  return (
    <div className={cn("relative", className)} aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
        {grid &&
          [20, 40, 60, 80].map((v) => (
            <g key={v} className="stroke-border/50">
              <line
                x1="0"
                x2="100"
                y1={v}
                y2={v}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={v}
                x2={v}
                y1="0"
                y2="100"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        {series.map((s, i) =>
          s.values.length < 2 ? null : (
            <g key={i} className={s.className}>
              <path d={`${line(s.values)} L100,100 L0,100 Z`} fill="currentColor" opacity="0.16" />
              <path
                d={line(s.values)}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ),
        )}
      </svg>
      {/* Ponto do valor atual fora do SVG esticado (fica redondo). */}
      {series.map((s, i) => {
        if (s.values.length < 2) return null;
        const p = point(s.values, s.values.length - 1);
        return (
          <span
            key={i}
            className={cn(
              "absolute size-2 -translate-1/2 rotate-45 rounded-[2px] bg-current",
              s.className,
            )}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          />
        );
      })}
    </div>
  );
}
