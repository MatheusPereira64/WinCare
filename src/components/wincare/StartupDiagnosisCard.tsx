import { Gauge, MemoryStick, Rocket, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StartupAppIcon } from "@/components/wincare/StartupAppIcon";
import { LOAD_LABEL, type StartupDiagnosis } from "@/lib/wincare/startupAdvice";
import type { Tone } from "@/lib/wincare/tone";
import { Panel, PanelHeader } from "./Panel";
import { StatusBadge } from "./StatusBadge";

interface Props {
  diagnosis: StartupDiagnosis;
  busyId: string | null;
  onDisable: (id: string) => void;
  onDisableSuggested: () => void;
}

const LOAD_TONE: Record<StartupDiagnosis["load"], Tone> = {
  heavy: "danger",
  moderate: "warning",
  light: "success",
};

export function StartupDiagnosisCard({ diagnosis, busyId, onDisable, onDisableSuggested }: Props) {
  const suggested = diagnosis.recommendations.filter(
    (r) => r.advice === "disable" && !r.requiresAdmin,
  );

  return (
    <Panel>
      <PanelHeader
        icon={Gauge}
        tone={LOAD_TONE[diagnosis.load]}
        title="Diagnóstico"
        badges={
          <StatusBadge tone={LOAD_TONE[diagnosis.load]}>
            {LOAD_LABEL[diagnosis.load]} · {diagnosis.score}%
          </StatusBadge>
        }
        description={diagnosis.summary}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="sr-only">Resumo:</span>
        <span className="inline-flex items-center gap-1.5">
          <Rocket aria-hidden className="size-3.5" />
          <span className="tabular-nums text-foreground">{diagnosis.enabledCount}</span> de{" "}
          {diagnosis.totalCount} ativos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MemoryStick aria-hidden className="size-3.5" />
          <span className="tabular-nums text-foreground">{diagnosis.totalMemMb} MB</span> na memória
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldAlert aria-hidden className="size-3.5" />
          <span className="tabular-nums text-foreground">{diagnosis.highImpactEnabled}</span>{" "}
          impacto alto
        </span>
      </div>

      {suggested.length > 0 && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Sugeridos para desativar</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!!busyId}
              onClick={onDisableSuggested}
            >
              Desativar os {suggested.length} sugeridos
            </Button>
          </div>
          <ul className="divide-y divide-border/60">
            {suggested.map((rec) => (
              <li key={rec.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <StartupAppIcon src={rec.iconDataUrl} name={rec.name} size={20} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{rec.name}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground" title={rec.reason}>
                    {rec.reason}
                  </p>
                </div>
                {rec.memMb > 0 && (
                  <span className="shrink-0 text-xs whitespace-nowrap tabular-nums text-muted-foreground">
                    {rec.memMb} MB
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={busyId === rec.id || !!busyId}
                  aria-label={`Desativar ${rec.name}`}
                  onClick={() => onDisable(rec.id)}
                >
                  Desativar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
