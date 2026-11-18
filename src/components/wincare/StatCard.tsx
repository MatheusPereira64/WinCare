import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { TONE_FILL, TONE_SOFT, usageTone, type Tone } from "@/lib/wincare/tone";
import { Panel } from "./Panel";

interface Props {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  progress?: number;
  /** Tom do ícone e da barra; por padrão segue o nível de uso (usageTone). */
  tone?: Tone;
  className?: string;
}

/** Número de destaque com rótulo, ícone e barra opcional (Dashboard). */
export function StatCard({ icon, label, value, hint, progress, tone, className }: Props) {
  const t = tone ?? (typeof progress === "number" ? usageTone(progress) : "primary");

  return (
    <Panel variant="interactive" className={cn("gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <span
          aria-hidden
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            TONE_SOFT[t],
          )}
        >
          {icon}
        </span>
      </div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {typeof progress === "number" && (
        <div
          role="progressbar"
          aria-label={`Uso de ${label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(100, Math.max(0, progress)))}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted forced-colors:border forced-colors:border-[CanvasText]"
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 forced-colors:forced-color-adjust-none forced-colors:bg-[Highlight]",
              TONE_FILL[t],
            )}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
      {hint && (
        <p className="truncate text-xs text-muted-foreground" title={hint}>
          {hint}
        </p>
      )}
    </Panel>
  );
}
