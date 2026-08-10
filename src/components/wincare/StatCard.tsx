import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export type StatTone = "primary" | "success" | "warning" | "destructive";

interface Props {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  progress?: number;
  /** Cor do chip do ícone e da barra; por padrão segue o nível de uso. */
  tone?: StatTone;
}

const chipTone: Record<StatTone, string> = {
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
};

const barTone: Record<StatTone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

/** Tom automático conforme a pressão do recurso (uso %). */
function autoTone(progress?: number): StatTone {
  if (typeof progress !== "number") return "primary";
  if (progress >= 90) return "destructive";
  if (progress >= 75) return "warning";
  return "primary";
}

export function StatCard({ icon, label, value, hint, progress, tone }: Props) {
  const t = tone ?? autoTone(progress);

  return (
    <Card className="surface-panel hover-lift gap-3 border-border/50 p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${chipTone[t]}`}
        >
          {icon}
        </span>
      </div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {typeof progress === "number" && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barTone[t]}`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
      {hint && <p className="truncate text-xs text-muted-foreground" title={hint}>{hint}</p>}
    </Card>
  );
}
