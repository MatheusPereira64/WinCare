/*
 * Contas do histórico de manutenção (tela Histórico): totais por período,
 * semanas do gráfico, agrupamento da linha do tempo e exportação.
 * Funções puras — recebem `now` para serem testáveis (tests/history.test.cjs).
 */
import { formatDecimal, plural } from "./format";
import { formatBytes } from "./report";
import type { Tone } from "./tone";
import type { HealthDay, MaintenanceEvent, MaintenanceHistory, MaintenanceKind } from "./types";

export const PERIODS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIODS)[number];

export const KIND_META: Record<MaintenanceKind, { label: string; tone: Tone }> = {
  cleanup: { label: "Limpeza", tone: "success" },
  uninstall: { label: "Programa removido", tone: "primary" },
  repair: { label: "Reparo", tone: "primary" },
  check: { label: "Verificação", tone: "neutral" },
  optimize: { label: "Otimização", tone: "primary" },
  safety: { label: "Segurança", tone: "neutral" },
};

/** Filtros da linha do tempo (verificações andam junto com reparos). */
export type TimelineFilter = "all" | "cleanup" | "uninstall" | "repair" | "other";

const FILTER_KINDS: Record<Exclude<TimelineFilter, "all">, MaintenanceKind[]> = {
  cleanup: ["cleanup"],
  uninstall: ["uninstall"],
  repair: ["repair", "check"],
  other: ["optimize", "safety"],
};

export function matchesFilter(event: MaintenanceEvent, filter: TimelineFilter) {
  return filter === "all" || FILTER_KINDS[filter].includes(event.kind);
}

/* ------------------------------ Datas ------------------------------ */

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-03" no calendário local (mesma chave dos dias de saúde do processo principal). */
export function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(ts: number) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Semana começa na segunda-feira. */
export function startOfWeek(ts: number) {
  const d = new Date(startOfDay(ts));
  const offset = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset).getTime();
}

const addDays = (ts: number, days: number) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
};

/** Início do período: hoje conta como um dos dias ("7 dias" = hoje e os 6 anteriores). */
export const periodStart = (days: number, now: number) => addDays(startOfDay(now), -(days - 1));

const dayFromKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};

/** "3 de nov." */
export function formatShortDate(ts: number, withYear = false) {
  return new Date(ts).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** "12 min", "1 h 05 min", "40 s". */
export function formatDuration(ms: number | undefined) {
  if (!ms || ms < 1000) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${pad(minutes % 60)} min`;
}

/* ------------------------------ Totais ------------------------------ */

export interface PeriodSummary {
  days: number;
  since: number;
  events: MaintenanceEvent[];
  freedBytes: number;
  /** Parte do espaço que é estimativa (tamanho informado pelos programas removidos). */
  estimatedBytes: number;
  cleanups: number;
  programsRemoved: string[];
  repairs: number;
  checks: number;
  failed: number;
  health: {
    current: number;
    /** Primeira média do período (null com um dia só). */
    start: number | null;
    startDay: number | null;
    delta: number | null;
    days: number;
  } | null;
}

const programName = (event: MaintenanceEvent) =>
  event.subject || event.title.replace(/ desinstalado$/, "");

function eventsInPeriod(history: Pick<MaintenanceHistory, "events">, days: number, now: number) {
  const since = periodStart(days, now);
  return history.events.filter((e) => e.ts >= since).sort((a, b) => b.ts - a.ts);
}

export function healthInPeriod(health: HealthDay[], days: number, now: number) {
  const first = dayKey(periodStart(days, now));
  const last = dayKey(now);
  return health.filter((d) => d.day >= first && d.day <= last);
}

export function summarizePeriod(
  history: Pick<MaintenanceHistory, "events" | "health">,
  days: number,
  now: number,
): PeriodSummary {
  const events = eventsInPeriod(history, days, now);
  let freedBytes = 0;
  let estimatedBytes = 0;
  let cleanups = 0;
  let repairs = 0;
  let checks = 0;
  let failed = 0;
  const programsRemoved: string[] = [];
  for (const event of events) {
    if (!event.ok) {
      failed += 1;
      continue;
    }
    if (event.freedBytes) {
      freedBytes += event.freedBytes;
      if (event.estimated) estimatedBytes += event.freedBytes;
    }
    if (event.kind === "cleanup") cleanups += 1;
    if (event.kind === "uninstall") programsRemoved.push(programName(event));
    if (event.kind === "repair") repairs += 1;
    if (event.kind === "check") checks += 1;
  }

  const healthDays = healthInPeriod(history.health, days, now);
  const lastDay = healthDays[healthDays.length - 1];
  const firstDay = healthDays[0];
  const multi = healthDays.length > 1;
  return {
    days,
    since: periodStart(days, now),
    events,
    freedBytes,
    estimatedBytes,
    cleanups,
    programsRemoved,
    repairs,
    checks,
    failed,
    health: lastDay
      ? {
          current: Math.round(lastDay.avg),
          start: multi ? Math.round(firstDay.avg) : null,
          startDay: multi ? dayFromKey(firstDay.day) : null,
          delta: multi ? Math.round(lastDay.avg) - Math.round(firstDay.avg) : null,
          days: healthDays.length,
        }
      : null,
  };
}

/** Desde o primeiro registro: "41,2 GB liberados em 52 manutenções desde 3 de ago." */
export function lifetimeSummary(history: Pick<MaintenanceHistory, "events">) {
  const ok = history.events.filter((e) => e.ok && e.kind !== "safety");
  if (!ok.length) return null;
  const first = Math.min(...history.events.map((e) => e.ts));
  const freed = ok.reduce((sum, e) => sum + (e.freedBytes ?? 0), 0);
  return { since: first, freedBytes: freed, count: ok.length };
}

/* ------------------------------ Semanas ------------------------------ */

/** Semanas no gráfico para cada período (no mínimo 4, para ter com o que comparar). */
export const weeksForPeriod = (days: number) => Math.max(4, Math.ceil(days / 7));

export interface WeekBucket {
  start: number;
  /** "3 de nov." */
  label: string;
  /** "03/11" — para gráficos com muitas semanas. */
  shortLabel: string;
  freedBytes: number;
  /** Manutenções concluídas (limpezas, remoções, reparos, verificações, otimizações). */
  actions: number;
  /** Média da saúde nas leituras da semana (null sem leituras). */
  health: number | null;
  current: boolean;
}

export function weeklyBuckets(
  history: Pick<MaintenanceHistory, "events" | "health">,
  weeks: number,
  now: number,
): WeekBucket[] {
  const thisWeek = startOfWeek(now);
  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i);
    buckets.push({
      start,
      label: formatShortDate(start),
      shortLabel: new Date(start).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      freedBytes: 0,
      actions: 0,
      health: null,
      current: i === 0,
    });
  }
  const first = buckets[0].start;
  const indexOf = (ts: number) => {
    if (ts < first) return -1;
    const week = startOfWeek(ts);
    return buckets.findIndex((b) => b.start === week);
  };
  for (const event of history.events) {
    if (!event.ok || event.kind === "safety") continue;
    const i = indexOf(event.ts);
    if (i < 0) continue;
    buckets[i].actions += 1;
    buckets[i].freedBytes += event.freedBytes ?? 0;
  }
  const sums = buckets.map(() => ({ total: 0, n: 0 }));
  for (const day of history.health) {
    const i = indexOf(dayFromKey(day.day));
    if (i < 0) continue;
    sums[i].total += day.avg * day.n;
    sums[i].n += day.n;
  }
  sums.forEach((s, i) => {
    if (s.n > 0) buckets[i].health = Math.round(s.total / s.n);
  });
  return buckets;
}

/* ------------------------------ Linha do tempo ------------------------------ */

export interface DayGroup {
  key: string;
  label: string;
  events: MaintenanceEvent[];
}

/** "Hoje", "Ontem", "segunda-feira, 3 de novembro" (com o ano se for outro). */
function dayLabel(ts: number, now: number) {
  const day = startOfDay(ts);
  const today = startOfDay(now);
  if (day === today) return "Hoje";
  if (day === addDays(today, -1)) return "Ontem";
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return new Date(ts).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function groupByDay(events: MaintenanceEvent[], now: number): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of [...events].sort((a, b) => b.ts - a.ts)) {
    const key = dayKey(event.ts);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(event);
    else groups.push({ key, label: dayLabel(event.ts, now), events: [event] });
  }
  return groups;
}

/** "+1,2 GB" / "≈ 850 MB" (estimativa) — vazio quando a ação não libera espaço. */
export function freedLabel(event: MaintenanceEvent) {
  if (!event.ok || !event.freedBytes) return null;
  return `${event.estimated ? "≈ " : "+"}${formatBytes(event.freedBytes)}`;
}

/* ------------------------------ Textos ------------------------------ */

/** Frase-resumo do período para o topo da página e para o leitor de tela. */
export function describeSummary(summary: PeriodSummary) {
  const parts: string[] = [];
  if (summary.freedBytes > 0) parts.push(`${formatBytes(summary.freedBytes)} liberados`);
  if (summary.programsRemoved.length) {
    parts.push(plural(summary.programsRemoved.length, "programa removido", "programas removidos"));
  }
  if (summary.repairs) parts.push(plural(summary.repairs, "reparo", "reparos"));
  if (!parts.length) return null;
  const last = parts.pop();
  return parts.length ? `${parts.join(", ")} e ${last}` : last!;
}

export function formatHealthDelta(delta: number) {
  if (delta === 0) return "estável";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)} ${Math.abs(delta) === 1 ? "ponto" : "pontos"}`;
}

/* ------------------------------ Exportação ------------------------------ */

const SOURCE_LABEL = { manual: "Manual", scheduled: "Agendada" } as const;

/**
 * Célula CSV: aspas quando precisa e proteção contra fórmulas (um nome de
 * programa "=HYPERLINK(...)" não vira fórmula ao abrir no Excel).
 */
function csvCell(value: string | number | undefined | null) {
  if (value === undefined || value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV no formato do Excel em português: ponto e vírgula, vírgula decimal,
 * BOM UTF-8 (acentos corretos) e quebra de linha do Windows.
 */
export function historyToCsv(events: MaintenanceEvent[]) {
  const header = [
    "Data",
    "Hora",
    "Tipo",
    "Ação",
    "Resultado",
    "Origem",
    "Espaço liberado (MB)",
    "Espaço estimado",
    "Duração (min)",
    "Detalhe",
  ];
  const rows = [...events]
    .sort((a, b) => b.ts - a.ts)
    .map((e) => {
      const date = new Date(e.ts);
      return [
        date.toLocaleDateString("pt-BR"),
        formatTime(e.ts),
        KIND_META[e.kind].label,
        e.title,
        e.ok ? "Concluído" : "Falhou",
        SOURCE_LABEL[e.source],
        e.freedBytes ? formatDecimal(e.freedBytes / 1024 ** 2, 1) : "",
        e.freedBytes ? (e.estimated ? "Sim" : "Não") : "",
        e.durationMs ? formatDecimal(e.durationMs / 60_000, 1) : "",
        e.detail ?? "",
      ]
        .map(csvCell)
        .join(";");
    });
  return `\uFEFF${[header.map(csvCell).join(";"), ...rows].join("\r\n")}\r\n`;
}

export function historyToJson(
  history: Pick<MaintenanceHistory, "events" | "health">,
  days: number,
  now: number,
) {
  const summary = summarizePeriod(history, days, now);
  return `${JSON.stringify(
    {
      app: "WinCare",
      exportedAt: new Date(now).toISOString(),
      period: {
        days,
        from: new Date(summary.since).toISOString(),
        to: new Date(now).toISOString(),
      },
      totals: {
        freedBytes: summary.freedBytes,
        estimatedBytes: summary.estimatedBytes,
        cleanups: summary.cleanups,
        programsRemoved: summary.programsRemoved.length,
        repairs: summary.repairs,
        checks: summary.checks,
        failed: summary.failed,
        healthNow: summary.health?.current ?? null,
        healthStart: summary.health?.start ?? null,
      },
      events: summary.events,
      health: healthInPeriod(history.health, days, now),
    },
    null,
    2,
  )}\n`;
}

export function exportFileName(days: number, ext: "csv" | "json", now: number) {
  return `WinCare-historico-${days}-dias-${dayKey(now)}.${ext}`;
}

/* ------------------------------ Semana × semana ------------------------------ */

export interface WeekTotals {
  freedBytes: number;
  maintenance: number;
  programsRemoved: number;
  healthAvg: number | null;
}

function totalsBetween(
  history: Pick<MaintenanceHistory, "events" | "health">,
  from: number,
  to: number,
): WeekTotals {
  const events = history.events.filter((e) => e.ts >= from && e.ts < to && e.ok);
  const fromDay = dayKey(from);
  const toDay = dayKey(to - 1);
  const health = history.health.filter((h) => h.day >= fromDay && h.day <= toDay);
  return {
    freedBytes: events.reduce((n, e) => n + (e.freedBytes ?? 0), 0),
    maintenance: events.filter((e) => e.kind !== "safety").length,
    programsRemoved: events.filter((e) => e.kind === "uninstall").length,
    healthAvg: health.length
      ? Math.round(health.reduce((n, h) => n + h.avg, 0) / health.length)
      : null,
  };
}

/** Últimos 7 dias × os 7 anteriores (mesma conta do resumo semanal do processo principal). */
export function compareWeeks(history: Pick<MaintenanceHistory, "events" | "health">, now: number) {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  return {
    week: totalsBetween(history, now - WEEK, now + 1),
    previous: totalsBetween(history, now - 2 * WEEK, now - WEEK),
  };
}
