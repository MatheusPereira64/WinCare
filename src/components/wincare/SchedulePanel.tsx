import { useCallback, useEffect, useState } from "react";
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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { listSchedules, removeSchedule, runScheduleNow, saveSchedule } from "@/lib/wincare/bridge";
import { formatBytes } from "@/lib/wincare/report";
import type {
  ScheduleConfig,
  ScheduleEntry,
  ScheduleHistoryEntry,
  ScheduleJob,
} from "@/lib/wincare/types";
import { ChoiceChips } from "./ChoiceChips";
import { EmptyState } from "./EmptyState";
import { PageHeader } from "./PageHeader";

const JOB_INFO: Record<
  ScheduleJob,
  { title: string; icon: typeof Brush; description: string; includes: string[] }
> = {
  cleanup: {
    title: "Limpeza automática",
    icon: Brush,
    description: "Libera espaço sem pedir nada e sem mexer nos seus dados de navegação.",
    includes: [
      "Temporários com mais de 24 horas",
      "Cache de navegadores e apps que estiverem fechados",
      "Cookies, histórico e senhas ficam intactos",
    ],
  },
  "full-check": {
    title: "Verificação completa",
    icon: ShieldCheck,
    description: "Procura e corrige problemas no Windows. Pode levar até 1 hora em segundo plano.",
    includes: [
      "Ponto de restauração antes de tudo",
      "SFC e DISM (verifica e repara a imagem)",
      "Verificação de disco somente leitura",
    ],
  },
};

const FREQUENCIES: { value: ScheduleConfig["frequency"]; label: string }[] = [
  { value: "daily", label: "Todo dia" },
  { value: "weekly", label: "Toda semana" },
  { value: "monthly", label: "Todo mês" },
];

const WEEK_DAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

const MONTH_DAYS = [1, 5, 10, 15, 20, 25].map((d) => ({ value: d, label: `Dia ${d}` }));

const TIMES = ["08:00", "12:00", "18:00", "20:00", "22:00"].map((t) => ({ value: t, label: t }));

const WEEK_DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function describeConfig(config: ScheduleConfig) {
  if (config.frequency === "daily") return `Todo dia às ${config.time}`;
  if (config.frequency === "weekly") {
    const day = WEEK_DAY_NAMES[config.weekDay];
    const prefix = config.weekDay === 0 || config.weekDay === 6 ? "Todo" : "Toda";
    return `${prefix} ${day} às ${config.time}`;
  }
  return `Todo dia ${config.monthDay} do mês às ${config.time}`;
}

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

export function SchedulePanel() {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [history, setHistory] = useState<ScheduleHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((out: Awaited<ReturnType<typeof listSchedules>>) => {
    if (!out.ok) throw new Error(out.reason);
    setEntries(out.items);
    setHistory(out.history);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await listSchedules());
    } catch (err) {
      toast.error("Não foi possível consultar o Agendador de Tarefas.", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    void listSchedules()
      .then((out) => {
        if (!cancelled) apply(out);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          toast.error("Não foi possível consultar o Agendador de Tarefas.", {
            description: err instanceof Error ? err.message : undefined,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  return (
    <div className="space-y-6" data-wincare-schedule>
      <PageHeader
        icon={CalendarClock}
        title="Agendamento"
        subtitle="Deixe a manutenção rodar sozinha pelo Agendador de Tarefas do Windows, mesmo com o WinCare fechado."
      />

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {entries.map((entry) => (
            <ScheduleCard
              key={entry.job}
              entry={entry}
              lastOutcome={history.find((h) => h.job === entry.job)}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <History className="size-4 text-muted-foreground" /> Execuções recentes
        </h2>
        {history.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nenhuma execução ainda"
            description="Quando uma rotina rodar, o resultado aparece aqui e em uma notificação do Windows."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/60">
            <ul className="divide-y divide-border/40">
              {history.slice(0, 10).map((run) => (
                <li key={run.id} className="flex items-start gap-3 px-4 py-3">
                  {run.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{run.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {run.summary}
                      {typeof run.freedBytes === "number" && run.freedBytes > 0
                        ? ` ${formatBytes(run.freedBytes)} liberados.`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatDateTime(run.startedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
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
  const info = JOB_INFO[entry.job];
  const [config, setConfig] = useState(entry.config);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(config) !== JSON.stringify(entry.config);
  const Icon = info.icon;

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
    <Card className="surface-panel gap-4 border-border/50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Icon className="size-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold tracking-tight">{info.title}</h2>
              {entry.enabled ? (
                <Badge
                  variant="outline"
                  className="rounded-full border-success/30 bg-success/10 text-success"
                >
                  Ativa
                </Badge>
              ) : (
                <Badge variant="outline" className="rounded-full text-muted-foreground">
                  Desativada
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{info.description}</p>
          </div>
        </div>
        {busy ? (
          <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            checked={entry.enabled}
            aria-label={`Ativar ${info.title}`}
            onCheckedChange={(v) => void (v ? save() : disable())}
          />
        )}
      </div>

      <ul className="space-y-1 text-xs text-muted-foreground">
        {info.includes.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" />
            {line}
          </li>
        ))}
      </ul>

      <div className="space-y-3 rounded-xl border border-border/50 bg-background/40 p-3.5">
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
        <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
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
          <div className="flex gap-1.5">
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
          <div className="flex gap-2">
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
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[5.5rem_1fr] sm:items-center">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
