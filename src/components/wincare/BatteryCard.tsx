import { useState } from "react";
import { BatteryMedium, ExternalLink, Lightbulb, Loader2, RefreshCw, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  LEVEL_META,
  batteryTips,
  formatDuration,
  formatWh,
  summarizeBattery,
  type BatteryTip,
  type BatteryTipAction,
} from "@/lib/wincare/battery";
import { getNative, openFullBatteryReport, openWindowsTarget } from "@/lib/wincare/bridge";
import { plural } from "@/lib/wincare/format";
import { invalidateSystemData, loadBattery } from "@/lib/wincare/systemData";
import { TONE_CALLOUT, TONE_TEXT, type Tone } from "@/lib/wincare/tone";
import type { BatteryReport } from "@/lib/wincare/types";
import { useResource } from "@/lib/wincare/useResource";
import { BatteryCapacityChart } from "./BatteryCapacityChart";
import { Panel, PanelHeader } from "./Panel";
import { EmptyState, LoadingState, ResourceView } from "./States";
import { StatusBadge } from "./StatusBadge";

/* Barra de saúde no tom do nível (classes por extenso para o Tailwind encontrá-las). */
const BAR: Record<Tone, string> = {
  neutral: "",
  primary: "",
  success: "bg-success/20 [&>div]:bg-success",
  warning: "bg-warning/20 [&>div]:bg-warning",
  danger: "bg-destructive/20 [&>div]:bg-destructive",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface-inset min-w-0 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-[11px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function TipItem({
  tip,
  busy,
  onAction,
}: {
  tip: BatteryTip;
  busy: boolean;
  onAction: (action: BatteryTipAction) => void;
}) {
  return (
    <li className={cn("rounded-xl border px-3 py-2.5", TONE_CALLOUT[tip.tone])}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-sm font-medium text-foreground">{tip.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{tip.detail}</p>
        </div>
        {tip.action && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onAction(tip.action!)}
          >
            {busy && <Loader2 className="animate-spin" />}
            {tip.action.label}
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Saúde da bateria (notebooks): saúde, desgaste, ciclos e capacidade ao longo
 * do tempo, lidos do `powercfg /batteryreport`, mais dicas de energia que se
 * aplicam agora. Em PCs sem bateria o card não aparece.
 */
export function BatteryCard() {
  const resource = useResource<BatteryReport>(loadBattery, {
    errorMessage: "Não foi possível ler a bateria.",
  });
  /** Botão em andamento: "report" ou o comando da dica. */
  const [busy, setBusy] = useState<string | null>(null);

  /* Desktop: nada a mostrar depois de confirmar que não há bateria. */
  if (resource.status === "ready" && resource.data && !resource.data.hasBattery) return null;

  const reread = () => {
    invalidateSystemData("battery");
    void resource.reload();
  };

  const openReport = async () => {
    setBusy("report");
    try {
      const out = await openFullBatteryReport();
      if (out.demo) toast.info("O relatório completo abre no app para Windows.");
      else if (!out.ok)
        toast.error("Não foi possível abrir o relatório.", { description: out.reason });
    } finally {
      setBusy(null);
    }
  };

  /* Dicas só abrem páginas: o usuário decide o que mudar lá. */
  const onAction = async (action: BatteryTipAction) => {
    if (action.kind === "report") return openReport();
    setBusy(action.command);
    try {
      await openWindowsTarget(action.command);
      if (!getNative()) toast.info("No app, isto abre as Configurações do Windows.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel className="@container" data-wincare-battery>
      <PanelHeader
        icon={BatteryMedium}
        title="Bateria"
        description="Quanto da carga original a bateria ainda segura, segundo o relatório do Windows."
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Ler a bateria de novo"
              disabled={resource.refreshing || resource.status === "loading"}
              onClick={reread}
            >
              <RefreshCw className={cn(resource.refreshing && "animate-spin")} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy === "report"}
              onClick={() => void openReport()}
            >
              {busy === "report" ? <Loader2 className="animate-spin" /> : <ExternalLink />}
              Relatório completo
            </Button>
          </>
        }
      />
      <ResourceView
        resource={resource}
        loading={<LoadingState label="Lendo o relatório de bateria do Windows…" variant="block" />}
        errorTitle="Não foi possível ler a bateria"
      >
        {(report) => {
          const summary = summarizeBattery(report);
          if (!summary) return null;
          const meta = LEVEL_META[summary.level];
          const tips = batteryTips(report, summary);
          const runtime = report.runtime?.fullChargeSec ?? null;
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Saúde</p>
                  <p className="flex items-baseline gap-2">
                    <span
                      className={cn("text-4xl font-semibold tabular-nums", TONE_TEXT[meta.tone])}
                      data-testid="battery-health"
                    >
                      {summary.healthPct}%
                    </span>
                    <StatusBadge tone={meta.tone} dot>
                      {meta.label}
                    </StatusBadge>
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">{meta.hint}</p>
                </div>
                <div className="min-w-48 flex-1">
                  <Progress
                    value={summary.healthPct}
                    aria-label={`Saúde da bateria: ${summary.healthPct}%`}
                    className={cn("h-2.5", BAR[meta.tone])}
                  />
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
                <Stat
                  label="Desgaste"
                  value={`${summary.wearPct}%`}
                  hint="capacidade perdida desde nova"
                />
                <Stat
                  label="Ciclos de carga"
                  value={
                    summary.cycleCount !== null ? summary.cycleCount.toLocaleString("pt-BR") : "—"
                  }
                  hint={summary.cycleCount !== null ? undefined : "o fabricante não informa"}
                />
                <Stat
                  label="Capacidade"
                  value={formatWh(summary.fullChargeMwh)}
                  hint={`de ${formatWh(summary.designMwh)} quando nova`}
                />
                <Stat
                  label="Autonomia estimada"
                  value={runtime ? formatDuration(runtime) : "—"}
                  hint="com carga completa, uso ativo"
                />
              </dl>
              {summary.batteryCount > 1 && (
                <p className="text-xs text-muted-foreground">
                  Somando {plural(summary.batteryCount, "bateria", "baterias")}.
                </p>
              )}

              <BatteryCapacityChart points={summary.trend} />

              <section aria-labelledby="battery-tips-title" className="space-y-2">
                <h3 id="battery-tips-title" className="flex items-center gap-2 text-sm font-medium">
                  <Lightbulb aria-hidden className="size-4 text-muted-foreground" />
                  Dicas de energia
                </h3>
                {tips.length ? (
                  <ul className="space-y-2">
                    {tips.map((tip) => (
                      <TipItem
                        key={tip.id}
                        tip={tip}
                        busy={
                          !!tip.action &&
                          busy === (tip.action.kind === "report" ? "report" : tip.action.command)
                        }
                        onAction={(kind) => void onAction(kind)}
                      />
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    size="sm"
                    tone="success"
                    icon={ThumbsUp}
                    title="Nada a ajustar"
                    description="A bateria e o plano de energia estão em ordem."
                  />
                )}
              </section>
            </div>
          );
        }}
      </ResourceView>
    </Panel>
  );
}
