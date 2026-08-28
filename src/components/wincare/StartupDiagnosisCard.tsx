import { MemoryStick, Rocket, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StartupAppIcon } from "@/components/wincare/StartupAppIcon";
import { LOAD_LABEL, type StartupDiagnosis } from "@/lib/wincare/startupAdvice";

interface Props {
  diagnosis: StartupDiagnosis;
  busyId: string | null;
  onDisable: (id: string) => void;
  onDisableSuggested: () => void;
}

function loadTone(load: StartupDiagnosis["load"]) {
  if (load === "heavy") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (load === "moderate") return "border-warning/40 bg-warning/10 text-warning";
  return "border-success/40 bg-success/10 text-success";
}

export function StartupDiagnosisCard({ diagnosis, busyId, onDisable, onDisableSuggested }: Props) {
  const suggested = diagnosis.recommendations.filter(
    (r) => r.advice === "disable" && !r.requiresAdmin,
  );

  return (
    <Card className="surface-panel gap-4 border-border/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Diagnóstico</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{diagnosis.summary}</p>
        </div>
        <Badge variant="outline" className={loadTone(diagnosis.load)}>
          {LOAD_LABEL[diagnosis.load]} · {diagnosis.score}%
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Rocket className="size-3.5" />
          <span className="tabular-nums text-foreground">{diagnosis.enabledCount}</span>/
          {diagnosis.totalCount} ativos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MemoryStick className="size-3.5" />
          <span className="tabular-nums text-foreground">{diagnosis.totalMemMb} MB</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldAlert className="size-3.5" />
          <span className="tabular-nums text-foreground">{diagnosis.highImpactEnabled}</span>{" "}
          impacto alto
        </span>
      </div>

      {suggested.length > 0 && (
        <div className="space-y-2 border-t border-border/50 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Sugeridos para desativar</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!!busyId}
              onClick={onDisableSuggested}
            >
              Desativar todos ({suggested.length})
            </Button>
          </div>
          <ul className="divide-y divide-border/40">
            {suggested.map((rec) => (
              <li key={rec.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <StartupAppIcon src={rec.iconDataUrl} name={rec.name} size={20} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{rec.name}</p>
                  <p className="truncate text-xs text-muted-foreground" title={rec.reason}>
                    {rec.reason}
                  </p>
                </div>
                {rec.memMb > 0 && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {rec.memMb} MB
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={busyId === rec.id || !!busyId}
                  onClick={() => onDisable(rec.id)}
                >
                  Desativar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
