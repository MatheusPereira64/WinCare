import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import type { Recommendation } from "@/lib/wincare/intelligence";

const tone: Record<Recommendation["severity"], string> = {
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-warning/40 bg-warning/10 text-warning",
  low: "border-success/40 bg-success/10 text-success",
};

export function RecommendationList({ items, compact }: { items: Recommendation[]; compact?: boolean }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma recomendação no momento.</p>;
  }

  return (
    <ul className={compact ? "space-y-2" : "space-y-3"}>
      {items.map((rec) => (
        <li
          key={rec.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/50 bg-background/50 px-3 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone[rec.severity]}`}>
                {rec.severity === "high" ? "Alta" : rec.severity === "medium" ? "Média" : "Baixa"}
              </span>
              <p className="text-sm font-medium">{rec.title}</p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{rec.detail}</p>
          </div>
          <Link
            to={rec.href}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {rec.action}
            <ArrowRight className="size-3" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
