import { useState } from "react";
import {
  Brush,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  History,
  Loader2,
  Play,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { listSchedules, removeSchedule, runScheduleNow, saveSchedule } from "@/lib/wincare/bridge";
import {
  describeConfig,
  FREQUENCIES,
  JOB_TEXT,
  MONTH_DAYS,
  TIMES,
  WEEK_DAYS,
} from "@/lib/wincare/schedule";
import { formatBytes } from "@/lib/wincare/report";
import type { ScheduleEntry, ScheduleHistoryEntry, ScheduleJob } from "@/lib/wincare/types";
import { cn } from "@/lib/utils";
import { invalidateSystemData } from "@/lib/wincare/systemData";
import { TONE_CALLOUT } from "@/lib/wincare/tone";
import { useResource } from "@/lib/wincare/useResource";
import { ChoiceChips } from "./ChoiceChips";
import { PageHeader } from "./PageHeader";
import { ListPanel, Panel, PanelHeader } from "./Panel";
import { EmptyState, LoadingState, ResourceView } from "./States";
import { StatusBadge } from "./StatusBadge";

const JOB_ICON: Record<ScheduleJob, typeof Brush> = {
  cleanup: Brush,
  "full-check": ShieldCheck,
};

const formatDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

async function loadOverview() {
  const out = await listSchedules();
  if (!out.ok) throw new Error(out.reason);
  return out;
}

export function SchedulePanel() {
  const resource = useResource(loadOverview, {
    errorMessage: "Não foi possível consultar o Agendador de Tarefas.",
  });
  const history = resource.data?.history ?? [];
  const refresh = async () => {
    invalidateSystemData("schedules");
    await resource.reload();
  };

  return (
    <div className="space-y-6" data-wincare-schedule>
      <PageHeader
        icon={CalendarClock}
        title="Agendamento"
        subtitle="Deixe a manutenção rodar sozinha pelo Agendador de Tarefas do Windows, mesmo com o WinCare fechado."
      />

      <ResourceView
        resource={resource}
        errorTitle="Não foi possível consultar o Agendador de Tarefas"
        loading={
          <LoadingState label="Consultando o Agendador de Tarefas…" variant="cards" rows={2} />
        }
      >
        {(overview) => (
          <div className="grid items-start gap-4 @4xl/main:grid-cols-2">
            {overview.items.map((entry) => (
              <ScheduleCard
                key={entry.job}
                entry={entry}
                lastOutcome={overview.history.find((h) => h.job === entry.job)}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </ResourceView>

      {resource.status === "ready" && (
        <section className="space-y-3" aria-labelledby="schedule-history-title">
          <h2
            id="schedule-history-title"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <History aria-hidden className="size-4 text-muted-foreground" /> Execuções recentes
          </h2>
          {history.length === 0 ? (
            <EmptyState
              icon={History}
              title="Nenhuma execução ainda"
              description="Quando uma rotina rodar, o resultado aparece aqui e em uma notificação do Windows."
            />
          ) : (
            <ListPanel label="Execuções recentes">
              {history.slice(0, 10).map((run) => (
                <li key={run.id} className="flex items-start gap-3 px-4 py-3">
                  {run.ok ? (
                    <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      <span className="sr-only">{run.ok ? "Concluída: " : "Falhou: "}</span>
                      {run.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {run.summary}
                      {typeof run.freedBytes === "number" && run.freedBytes > 0
                        ? ` ${formatBytes(run.freedBytes)} liberados.`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {formatDateTime(run.startedAt)}
                  </span>
                </li>
              ))}
            </ListPanel>
          )}
        </section>
      )}
    </div>
  );
}

function ScheduleCard({
  entry,
  lastOutcome,
  onChanged,
}: {
  entry: ScheduleEntry;
  lastOutcome?: ScheduleHistoryEntry;
  onChanged: () => Promise<void>;
}) {
  const info = JOB_TEXT[entry.job];
  const [config, setConfig] = useState(entry.config);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(config) !== JSON.stringify(entry.config);
  const Icon = JOB_ICON[entry.job];

  const save = async () => {
    setBusy(true);
    try {
      const out = await saveSchedule(entry.job, config);
      if (!out.ok) {
        toast.error("Não foi possível agendar.", { description: out.reason });
        return;
      }
      toast.success(`${info.title} agendada`, { description: describeConfig(config) });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const out = await removeSchedule(entry.job);
      if (!out.ok) {
        toast.error("Não foi possível remover o agendamento.", { description: out.reason });
        return;
      }
      toast.success(`${info.title} desativada`);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    const out = await runScheduleNow(entry.job);
    if (out.ok) {
      toast.info("Rotina iniciada em segundo plano", {
        description: "O resultado aparece nesta tela quando terminar.",
      });
    } else {
      toast.error("Não foi possível iniciar a rotina.", { description: out.reason });
    }
  };

  return (
    <Panel>
      <PanelHeader
        icon={Icon}
        title={info.title}
        badges={
          entry.enabled ? (
            <StatusBadge tone="success">Ativa</StatusBadge>
          ) : (
            <StatusBadge>Desativada</StatusBadge>
          )
        }
        description={info.description}
        actions={
          busy ? (
            <Loader2
              aria-label="Salvando"
              className="size-5 shrink-0 animate-spin text-muted-foreground"
            />
          ) : (
            <Switch
              checked={entry.enabled}
              aria-label={info.title}
              onCheckedChange={(v) => void (v ? save() : disable())}
            />
          )
        }
      />

      <ul className="space-y-1 text-xs text-muted-foreground">
        {info.includes.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" />
            {line}
          </li>
        ))}
      </ul>

      <div className="surface-inset @container space-y-3 p-3.5">
        <Field label="Frequência">
          <ChoiceChips
            label="Frequência"
            value={config.frequency}
            options={FREQUENCIES}
            disabled={busy}
            onChange={(frequency) => setConfig((c) => ({ ...c, frequency }))}
          />
        </Field>
        {config.frequency === "weekly" && (
          <Field label="Dia da semana">
            <ChoiceChips
              label="Dia da semana"
              value={config.weekDay}
              options={WEEK_DAYS}
              disabled={busy}
              onChange={(weekDay) => setConfig((c) => ({ ...c, weekDay }))}
            />
          </Field>
        )}
        {config.frequency === "monthly" && (
          <Field label="Dia do mês">
            <ChoiceChips
              label="Dia do mês"
              value={config.monthDay}
              options={MONTH_DAYS}
              disabled={busy}
              onChange={(monthDay) => setConfig((c) => ({ ...c, monthDay }))}
            />
          </Field>
        )}
        <Field label="Horário">
          <ChoiceChips
            label="Horário"
            value={config.time}
            options={TIMES}
            disabled={busy}
            onChange={(time) => setConfig((c) => ({ ...c, time }))}
          />
        </Field>
      </div>

      {entry.stale && (
        <p
          className={cn(
            "flex items-start gap-2 rounded-xl border p-3 text-xs",
            TONE_CALLOUT.warning,
          )}
        >
          <CircleAlert className="mt-px size-4 shrink-0" />A pasta do WinCare mudou de lugar e esta
          rotina aponta para o local antigo. Clique em Salvar para corrigir.
        </p>
      )}

      {entry.requiresAdmin && !entry.enabled && (
        <p className="text-xs text-muted-foreground">
          Roda como administrador: o Windows pede permissão uma vez, ao ativar.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <dl className="text-xs text-muted-foreground">
          <div className="flex flex-wrap gap-x-1.5">
            <dt>{entry.enabled ? "Próxima:" : "Vai rodar:"}</dt>
            <dd className="font-medium text-foreground">
              {entry.enabled && entry.nextRun && !dirty
                ? formatDateTime(entry.nextRun)
                : describeConfig(config)}
            </dd>
          </div>
          {lastOutcome && (
            <div className="flex gap-1.5">
              <dt>Última:</dt>
              <dd className={lastOutcome.ok ? "text-success" : "text-destructive"}>
                {formatDateTime(lastOutcome.startedAt)}
              </dd>
            </div>
          )}
        </dl>
        {entry.enabled && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full"
              disabled={busy}
              onClick={() => void runNow()}
            >
              <Play /> Executar agora
            </Button>
            {(dirty || entry.stale) && (
              <Button
                type="button"
                size="sm"
                className="rounded-full"
                disabled={busy}
                onClick={() => void save()}
              >
                <Save /> Salvar
              </Button>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 @xs:grid-cols-[5.5rem_1fr] @xs:items-center">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
