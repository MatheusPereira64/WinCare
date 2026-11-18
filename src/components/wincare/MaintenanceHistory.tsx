import { useId, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  BarChart3,
  Brush,
  CircleAlert,
  HardDrive,
  HeartPulse,
  ListChecks,
  PackageX,
  Rocket,
  SearchCheck,
  ShieldCheck,
  Table2,
  TrendingDown,
  TrendingUp,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/wincare/format";
import {
  formatDuration,
  formatHealthDelta,
  formatShortDate,
  formatTime,
  freedLabel,
  groupByDay,
  healthInPeriod,
  KIND_META,
  matchesFilter,
  type PeriodSummary,
  type TimelineFilter,
  type WeekBucket,
} from "@/lib/wincare/history";
import { formatBytes } from "@/lib/wincare/report";
import { TONE_FILL, TONE_TEXT, type Tone } from "@/lib/wincare/tone";
import type { HealthDay, MaintenanceEvent, MaintenanceKind } from "@/lib/wincare/types";
import { ChoiceChips } from "./ChoiceChips";
import { IconChip } from "./IconChip";
import { ListPanel, Panel, PanelHeader } from "./Panel";
import { Sparkline } from "./Sparkline";
import { EmptyState } from "./States";
import { StatusBadge } from "./StatusBadge";

const KIND_ICON: Record<MaintenanceKind, ComponentType<{ className?: string }>> = {
  cleanup: Brush,
  uninstall: PackageX,
  repair: Wrench,
  check: SearchCheck,
  optimize: Rocket,
  safety: ShieldCheck,
};

/** Tom da nota de saúde (mesma régua do Dashboard: 80+ saudável). */
const healthTone = (value: number): Tone =>
  value >= 80 ? "success" : value >= 60 ? "warning" : "danger";

/* ------------------------------ Totais ------------------------------ */

function TotalCard({
  icon,
  tone = "primary",
  label,
  value,
  hint,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  tone?: Tone;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Panel padding="sm" className="min-w-0 gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </h3>
        <IconChip icon={icon} tone={tone} size="sm" />
      </div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      {children}
    </Panel>
  );
}

/** Os quatro números do período: espaço, programas, reparos e saúde (antes → agora). */
export function HistoryTotals({
  summary,
  health,
  now,
}: {
  summary: PeriodSummary;
  health: HealthDay[];
  now: number;
}) {
  const healthDays = healthInPeriod(health, summary.days, now);
  const h = summary.health;
  const trendTone: Tone =
    h?.delta == null ? "neutral" : h.delta > 0 ? "success" : h.delta < 0 ? "danger" : "neutral";
  const TrendIcon = h?.delta != null && h.delta < 0 ? TrendingDown : TrendingUp;
  const names = summary.programsRemoved;

  return (
    <div className="grid gap-4 @lg/main:grid-cols-2 @5xl/main:grid-cols-4">
      <TotalCard
        icon={HardDrive}
        tone="success"
        label="Espaço liberado"
        value={summary.freedBytes > 0 ? formatBytes(summary.freedBytes) : "0 GB"}
        hint={
          <>
            {summary.cleanups
              ? `Em ${plural(summary.cleanups, "limpeza", "limpezas")}`
              : "Nenhuma limpeza no período"}
            {summary.estimatedBytes > 0 && (
              <>
                {" "}
                · inclui ≈ {formatBytes(summary.estimatedBytes)} estimados dos programas removidos
              </>
            )}
          </>
        }
      />
      <TotalCard
        icon={PackageX}
        label="Programas removidos"
        value={names.length.toLocaleString("pt-BR")}
        hint={
          names.length ? (
            <span className="line-clamp-2" title={names.join(", ")}>
              {names.slice(0, 3).join(", ")}
              {names.length > 3 ? ` e mais ${names.length - 3}` : ""}
            </span>
          ) : (
            "Nenhum no período"
          )
        }
      />
      <TotalCard
        icon={Wrench}
        label="Reparos feitos"
        value={summary.repairs.toLocaleString("pt-BR")}
        hint={
          [
            summary.checks ? `+ ${plural(summary.checks, "verificação", "verificações")}` : null,
            summary.failed ? plural(summary.failed, "ação falhou", "ações falharam") : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Nenhum reparo no período"
        }
      />
      <TotalCard
        icon={HeartPulse}
        tone={h ? healthTone(h.current) : "neutral"}
        label="Saúde do PC"
        value={h ? `${h.current}%` : "—"}
        hint={
          !h ? (
            "Sem leituras no período. A saúde é registrada enquanto o WinCare está aberto."
          ) : h.start == null || h.startDay == null ? (
            "Só uma leitura diária no período"
          ) : (
            <span className="flex flex-wrap items-center gap-x-1.5">
              <span>
                Era {h.start}% em {formatShortDate(h.startDay)}
              </span>
              <span
                className={cn("inline-flex items-center gap-1 font-medium", TONE_TEXT[trendTone])}
              >
                <TrendIcon aria-hidden className="size-3.5" />
                {formatHealthDelta(h.delta ?? 0)}
              </span>
            </span>
          )
        }
      >
        {healthDays.length > 2 && (
          <div className={TONE_TEXT[healthTone(h?.current ?? 0)]}>
            <Sparkline
              className="h-8"
              values={healthDays.map((d) => Math.round(d.avg))}
              label="Saúde média por dia"
            />
          </div>
        )}
      </TotalCard>
    </div>
  );
}

/* ------------------------------ Gráfico semanal ------------------------------ */

type ChartMetric = "freed" | "actions" | "health";

const METRICS: { value: ChartMetric; label: string }[] = [
  { value: "freed", label: "Espaço liberado" },
  { value: "actions", label: "Manutenções" },
  { value: "health", label: "Saúde" },
];

const metricValue = (week: WeekBucket, metric: ChartMetric) =>
  metric === "freed" ? week.freedBytes : metric === "actions" ? week.actions : week.health;

function formatMetric(value: number | null, metric: ChartMetric) {
  if (value == null) return "—";
  if (metric === "freed") return value > 0 ? formatBytes(value) : "0";
  if (metric === "health") return `${value}%`;
  return value.toLocaleString("pt-BR");
}

/** Frase que o Narrador lê no lugar do gráfico. */
function describeChart(weeks: WeekBucket[], metric: ChartMetric) {
  const label = METRICS.find((m) => m.value === metric)!.label;
  const values = weeks.map((w) => metricValue(w, metric));
  const intro = `${label} por semana, nas últimas ${weeks.length} semanas.`;
  if (metric === "health") {
    const known = weeks.filter((w) => w.health != null);
    if (!known.length) return `${intro} Sem leituras de saúde.`;
    const first = known[0];
    const last = known[known.length - 1];
    return `${intro} Semana de ${first.label}: ${first.health}%. Semana de ${last.label}: ${last.health}%.`;
  }
  const total = values.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  if (!total) return `${intro} Nada registrado.`;
  const best = weeks.reduce((a, b) =>
    (metricValue(b, metric) ?? 0) > (metricValue(a, metric) ?? 0) ? b : a,
  );
  return `${intro} Total: ${formatMetric(total, metric)}. Semana com mais: ${best.label}, ${formatMetric(
    metricValue(best, metric),
    metric,
  )}.`;
}

export function WeeklyChart({ weeks }: { weeks: WeekBucket[] }) {
  const [metric, setMetric] = useState<ChartMetric>("freed");
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();

  const values = weeks.map((w) => metricValue(w, metric));
  const max =
    metric === "health" ? 100 : Math.max(0, ...values.map((v) => (typeof v === "number" ? v : 0)));
  const empty = metric === "health" ? values.every((v) => v == null) : max === 0;
  // Muitas semanas em pouco espaço: rótulos alternados e valores só com largura.
  const dense = weeks.length > 6;

  return (
    <Panel className="@container" role="region" aria-labelledby={titleId}>
      <PanelHeader
        icon={BarChart3}
        title="Semana a semana"
        titleId={titleId}
        description={`Últimas ${weeks.length} semanas (de segunda a domingo).`}
        actions={
          // Botão de alternar: o nome fica fixo e o estado vem de aria-pressed.
          <Button
            type="button"
            variant={asTable ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={asTable}
            onClick={() => setAsTable((v) => !v)}
          >
            <Table2 /> Ver como tabela
          </Button>
        }
      />

      {asTable ? (
        <WeeklyTable weeks={weeks} />
      ) : (
        <>
          <ChoiceChips
            label="O que mostrar no gráfico"
            value={metric}
            options={METRICS}
            onChange={setMetric}
          />
          {empty ? (
            <EmptyState
              size="sm"
              icon={BarChart3}
              title={
                metric === "health"
                  ? "Sem leituras de saúde nessas semanas"
                  : "Nenhuma manutenção nessas semanas"
              }
              description={
                metric === "health"
                  ? "A nota é registrada enquanto o WinCare fica aberto."
                  : "Limpezas, reparos e remoções aparecem aqui por semana."
              }
            />
          ) : (
            <figure className="m-0">
              <div
                role="img"
                aria-label={describeChart(weeks, metric)}
                className="grid gap-1 @md:gap-2"
                style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
              >
                {weeks.map((week, index) => {
                  const value = metricValue(week, metric);
                  const pct =
                    typeof value === "number" && max > 0 ? Math.round((value / max) * 100) : 0;
                  const tone: Tone =
                    metric === "health" && typeof value === "number"
                      ? healthTone(value)
                      : "primary";
                  const hideLabel = dense && index % 2 === 1 && !week.current;
                  return (
                    <div key={week.start} className="flex min-w-0 flex-col items-stretch gap-1.5">
                      <div className="flex h-40 flex-col justify-end short:h-28">
                        <span
                          className={cn(
                            "mb-1 truncate text-center text-[11px] font-medium tabular-nums text-muted-foreground",
                            dense && "hidden @3xl:block",
                            value == null || value === 0 ? "opacity-0" : "",
                          )}
                        >
                          {formatMetric(value, metric)}
                        </span>
                        {value == null ? (
                          <div className="h-1 rounded-full border border-dashed border-border" />
                        ) : (
                          <div
                            className={cn(
                              "rounded-t-md transition-[height] duration-300 forced-colors:forced-color-adjust-none forced-colors:bg-[Highlight]",
                              TONE_FILL[tone],
                              week.current ? "" : "opacity-80",
                              value === 0 && "opacity-100 bg-muted",
                            )}
                            style={{ height: value === 0 ? "2px" : `max(4px, ${pct}%)` }}
                            title={`Semana de ${week.label}: ${formatMetric(value, metric)}`}
                          />
                        )}
                      </div>
                      <span
                        className={cn(
                          "truncate text-center text-[11px] tabular-nums",
                          week.current ? "font-semibold text-foreground" : "text-muted-foreground",
                          hideLabel && "invisible @2xl:visible",
                        )}
                      >
                        {week.current ? "Esta" : dense ? week.shortLabel : week.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <figcaption className="mt-3 text-xs text-muted-foreground">
                {metric === "freed" &&
                  `Maior semana: ${formatMetric(max, metric)}. Inclui o tamanho estimado dos programas removidos.`}
                {metric === "actions" &&
                  "Limpezas, programas removidos, reparos, verificações e otimizações concluídos."}
                {metric === "health" &&
                  "Média das leituras da semana (0–100). Semanas tracejadas: o WinCare não ficou aberto."}
              </figcaption>
            </figure>
          )}
        </>
      )}
    </Panel>
  );
}

function WeeklyTable({ weeks }: { weeks: WeekBucket[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full min-w-[28rem] text-sm">
        <caption className="sr-only">Manutenção por semana</caption>
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Semana de
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Espaço liberado
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Manutenções
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Saúde média
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60 tabular-nums">
          {[...weeks].reverse().map((week) => (
            <tr key={week.start}>
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {week.label}
                {week.current && <span className="text-muted-foreground"> (esta semana)</span>}
              </th>
              <td className="px-3 py-2 text-right">{formatMetric(week.freedBytes, "freed")}</td>
              <td className="px-3 py-2 text-right">{formatMetric(week.actions, "actions")}</td>
              <td className="px-3 py-2 text-right">{formatMetric(week.health, "health")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------ Linha do tempo ------------------------------ */

const PAGE_SIZE = 40;

export function HistoryTimeline({
  events,
  days,
  now,
  limitNote,
}: {
  events: MaintenanceEvent[];
  days: number;
  now: number;
  limitNote?: string;
}) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const titleId = useId();

  const counts = useMemo(() => {
    const c: Record<TimelineFilter, number> = {
      all: events.length,
      cleanup: 0,
      uninstall: 0,
      repair: 0,
      other: 0,
    };
    for (const e of events) {
      for (const f of ["cleanup", "uninstall", "repair", "other"] as const) {
        if (matchesFilter(e, f)) c[f] += 1;
      }
    }
    return c;
  }, [events]);

  const filtered = useMemo(() => events.filter((e) => matchesFilter(e, filter)), [events, filter]);
  const groups = useMemo(
    () => groupByDay(filtered.slice(0, visible), now),
    [filtered, visible, now],
  );
  const remaining = filtered.length - Math.min(visible, filtered.length);

  return (
    <Panel className="@container" role="region" aria-labelledby={titleId}>
      <PanelHeader
        icon={ListChecks}
        title="Linha do tempo"
        titleId={titleId}
        description={`${plural(events.length, "registro", "registros")} nos últimos ${days} dias, do mais recente para o mais antigo.`}
      />

      <ChoiceChips
        label="Filtrar a linha do tempo"
        value={filter}
        onChange={(next) => {
          setFilter(next);
          setVisible(PAGE_SIZE);
        }}
        options={[
          { value: "all", label: `Tudo (${counts.all})` },
          { value: "cleanup", label: `Limpezas (${counts.cleanup})` },
          { value: "uninstall", label: `Programas (${counts.uninstall})` },
          { value: "repair", label: `Reparos (${counts.repair})` },
          { value: "other", label: `Outros (${counts.other})` },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          size="sm"
          icon={ListChecks}
          title="Nada deste tipo no período"
          description="Escolha outro filtro ou um período maior."
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.key} className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase first-letter:uppercase">
                {group.label}
              </h3>
              <ListPanel label={`Registros de ${group.label.toLowerCase()}`}>
                {group.events.map((event) => (
                  <TimelineRow key={event.id} event={event} />
                ))}
              </ListPanel>
            </div>
          ))}
          {remaining > 0 && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
              >
                Mostrar mais ({plural(remaining, "restante", "restantes")})
              </Button>
            </div>
          )}
        </div>
      )}

      {limitNote && <p className="text-xs text-muted-foreground">{limitNote}</p>}
    </Panel>
  );
}

function TimelineRow({ event }: { event: MaintenanceEvent }) {
  const Icon = event.ok ? KIND_ICON[event.kind] : CircleAlert;
  const freed = freedLabel(event);
  const duration = formatDuration(event.durationMs);

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3">
      <IconChip
        icon={Icon}
        size="sm"
        tone={event.ok ? KIND_META[event.kind].tone : "danger"}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1 basis-48">
        {/* div, não p: o selo (Badge) é um div. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
          <span className="min-w-0 break-words">{event.title}</span>
          {!event.ok && <StatusBadge tone="danger">Falhou</StatusBadge>}
          {event.source === "scheduled" && <StatusBadge tone="primary">Agendada</StatusBadge>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="sr-only">{KIND_META[event.kind].label}. </span>
          {event.detail}
        </p>
      </div>
      <div className="ml-11 flex shrink-0 flex-col items-start gap-0.5 text-xs tabular-nums @md:ml-0 @md:items-end">
        {freed && (
          <span
            className="font-semibold text-success"
            title={event.estimated ? "Tamanho informado pelo programa (estimativa)" : undefined}
          >
            {freed}
            {event.estimated && <span className="sr-only"> (estimativa)</span>}
          </span>
        )}
        <span className="text-muted-foreground">
          {formatTime(event.ts)}
          {duration && <> · levou {duration}</>}
        </span>
      </div>
    </li>
  );
}

/* ------------------------------ Resumo da vida toda ------------------------------ */

export function LifetimeLine({
  since,
  freedBytes,
  count,
}: {
  since: number;
  freedBytes: number;
  count: number;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      Desde {formatShortDate(since, true)}:{" "}
      <span className="font-medium text-foreground">
        {freedBytes > 0 ? `${formatBytes(freedBytes)} liberados` : "nenhum espaço liberado"}
      </span>{" "}
      em {plural(count, "manutenção", "manutenções")}.
    </p>
  );
}
