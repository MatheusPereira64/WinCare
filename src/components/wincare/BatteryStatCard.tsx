import { Link } from "@tanstack/react-router";
import { BatteryMedium } from "lucide-react";

import { cn } from "@/lib/utils";
import { LEVEL_META, summarizeBattery } from "@/lib/wincare/battery";
import { plural } from "@/lib/wincare/format";
import { useBatteryReport } from "@/lib/wincare/systemData";
import { StatCard } from "./StatCard";

/**
 * Bateria no Dashboard (só em notebooks): saúde e nível, levando aos detalhes
 * na página Sistema. Em desktop, enquanto carrega ou se a leitura falhar, não
 * aparece nada.
 */
export function BatteryStatCard({ className }: { className?: string }) {
  const report = useBatteryReport();
  const summary = report ? summarizeBattery(report) : null;
  if (!summary) return null;
  const meta = LEVEL_META[summary.level];
  const hint = [
    meta.label,
    summary.cycleCount !== null ? plural(summary.cycleCount, "ciclo", "ciclos") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      to="/sistema"
      aria-label={`Bateria: ${summary.healthPct}% de saúde, ${hint}. Ver detalhes em Sistema`}
      className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-wincare-battery-stat
    >
      <StatCard
        icon={<BatteryMedium className="size-4" />}
        label="Bateria"
        value={`${summary.healthPct}%`}
        hint={`Saúde · ${hint}`}
        tone={meta.tone}
        className={cn("h-full", className)}
      />
    </Link>
  );
}
