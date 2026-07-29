import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Props {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  progress?: number;
}

export function StatCard({ icon, label, value, hint, progress }: Props) {
  return (
    <Card className="surface-panel hover-lift gap-3 border-border/60 p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {icon}
        </span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {typeof progress === "number" && <Progress value={progress} className="h-1.5" />}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
