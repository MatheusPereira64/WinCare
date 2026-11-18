import { Link } from "@tanstack/react-router";
import { ArrowRight, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeSummary, formatHealthDelta, summarizePeriod } from "@/lib/wincare/history";
import { TONE_TEXT } from "@/lib/wincare/tone";
import { useMaintenanceHistory } from "@/lib/wincare/useMaintenanceHistory";
import { Panel, PanelHeader } from "./Panel";

const DAYS = 30;

/** Dashboard: o que o WinCare fez nos últimos 30 dias, com atalho para o Histórico. */
export function HistoryHighlights() {
  const resource = useMaintenanceHistory();
  const data = resource.data;
  const summary = data ? summarizePeriod(data, DAYS, data.loadedAt) : null;
  const sentence = summary ? describeSummary(summary) : null;
  const health = summary?.health;

  let description: string;
  if (resource.status === "loading") description = "Lendo o histórico de manutenção…";
  else if (resource.status === "error") description = "Não foi possível ler o histórico agora.";
  else if (sentence) description = `Nos últimos ${DAYS} dias: ${sentence}.`;
  else description = `Nenhuma limpeza, remoção ou reparo nos últimos ${DAYS} dias.`;

  return (
    <Panel className="@container" role="region" aria-labelledby="history-highlights-title">
      <PanelHeader
        icon={History}
        size="sm"
        title="O que o WinCare já fez"
        titleId="history-highlights-title"
        description={
          <>
            {description}
            {health?.delta != null && health.start != null && (
              <>
                {" "}
                Saúde: {health.start}% → {health.current}%{" "}
                <span
                  className={cn(
                    "font-medium",
                    TONE_TEXT[
                      health.delta > 0 ? "success" : health.delta < 0 ? "danger" : "neutral"
                    ],
                  )}
                >
                  ({formatHealthDelta(health.delta)})
                </span>
                .
              </>
            )}
          </>
        }
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link to="/historico">
              Ver histórico <ArrowRight />
            </Link>
          </Button>
        }
      />
    </Panel>
  );
}
