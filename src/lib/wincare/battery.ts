import { formatDecimal, plural } from "./format";
import type { Tone } from "./tone";
import type { BatteryCapacityPoint, BatteryReport } from "./types";

/**
 * Saúde da bateria em linguagem simples, a partir do relatório do Windows.
 *
 * Saúde = carga total atual ÷ capacidade de projeto. Desgaste = o que falta
 * para 100%. As faixas seguem o que fabricantes costumam considerar normal:
 * abaixo de 80% a autonomia já cai de forma perceptível; abaixo de 60% vale
 * pensar na troca.
 */

export type BatteryLevel = "great" | "good" | "worn" | "weak";

export const LEVEL_META: Record<BatteryLevel, { label: string; tone: Tone; hint: string }> = {
  great: {
    label: "Ótima",
    tone: "success",
    hint: "Segura quase toda a carga de quando era nova.",
  },
  good: {
    label: "Boa",
    tone: "success",
    hint: "Desgaste normal de uso. A autonomia caiu pouco.",
  },
  worn: {
    label: "Desgastada",
    tone: "warning",
    hint: "A autonomia já é visivelmente menor do que a original.",
  },
  weak: {
    label: "Fraca",
    tone: "danger",
    hint: "Segura pouco mais da metade da carga original.",
  },
};

export function batteryLevel(healthPct: number): BatteryLevel {
  if (healthPct >= 90) return "great";
  if (healthPct >= 80) return "good";
  if (healthPct >= 60) return "worn";
  return "weak";
}

/** Ciclos a partir dos quais a maioria das baterias de notebook perde bastante capacidade. */
const HIGH_CYCLE_COUNT = 800;

/** Planos de alto desempenho do Windows (gastam mais bateria). */
const HIGH_PERFORMANCE_GUIDS = new Set([
  "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
  "e9a42b02-d5df-448d-aa00-03f14749eb61",
]);
const HIGH_PERFORMANCE_NAME = /alto desempenho|desempenho m[aá]ximo|high performance|ultimate/i;

export interface BatterySummary {
  /** Saúde (0–100), limitada a 100 mesmo quando a bateria informa mais. */
  healthPct: number;
  wearPct: number;
  level: BatteryLevel;
  designMwh: number;
  fullChargeMwh: number;
  /** Maior contagem de ciclos entre as baterias; null quando não informada. */
  cycleCount: number | null;
  batteryCount: number;
  /** Perda de saúde por ano (pontos percentuais) no histórico; null com pouco histórico. */
  lossPerYearPct: number | null;
  /** Saúde mês a mês (uma casa decimal), para o gráfico. */
  trend: { date: string; healthPct: number }[];
}

const DAY_MS = 86_400_000;

const healthOf = (full: number, design: number) =>
  design > 0 ? Math.min(100, Math.round((full / design) * 100)) : 0;

/** Perda anualizada entre o primeiro e o último ponto (pelo menos 60 dias de histórico). */
export function lossPerYear(history: BatteryCapacityPoint[]): number | null {
  if (history.length < 2) return null;
  const first = history[0];
  const last = history[history.length - 1];
  const days = (Date.parse(last.date) - Date.parse(first.date)) / DAY_MS;
  if (!Number.isFinite(days) || days < 60) return null;
  const drop = (first.fullChargeMwh / first.designMwh - last.fullChargeMwh / last.designMwh) * 100;
  return Math.max(0, Math.round((drop / days) * 365 * 10) / 10);
}

export function summarizeBattery(report: BatteryReport): BatterySummary | null {
  const units = report.batteries.filter((b) => b.designMwh > 0);
  if (!report.hasBattery || !units.length) return null;
  const designMwh = units.reduce((sum, b) => sum + b.designMwh, 0);
  const fullChargeMwh = units.reduce((sum, b) => sum + b.fullChargeMwh, 0);
  const healthPct = healthOf(fullChargeMwh, designMwh);
  const cycles = units.map((b) => b.cycleCount).filter((c): c is number => c !== null);
  return {
    healthPct,
    wearPct: 100 - healthPct,
    level: batteryLevel(healthPct),
    designMwh,
    fullChargeMwh,
    cycleCount: cycles.length ? Math.max(...cycles) : null,
    batteryCount: units.length,
    lossPerYearPct: lossPerYear(report.history),
    trend: report.history.map((p) => ({
      date: p.date,
      /* Uma casa decimal: com inteiros a linha vira uma escada que não existe nos dados. */
      healthPct: Math.min(100, Math.round((p.fullChargeMwh / p.designMwh) * 1000) / 10),
    })),
  };
}

/**
 * O que o botão de uma dica faz. Dicas nunca mudam configuração sozinhas:
 * abrem o relatório completo ou a página certa das Configurações do Windows.
 */
export type BatteryTipAction =
  { kind: "report"; label: string } | { kind: "settings"; label: string; command: string };

/** Páginas das Configurações do Windows usadas pelas dicas. */
const POWER_SETTINGS = {
  /** Energia e bateria (modo de energia, tela e suspensão). */
  power: "start ms-settings:powersleep",
  /** Uso da bateria por app. */
  appUsage: "start ms-settings:batterysaver-usagedetails",
} as const;

export interface BatteryTip {
  id: string;
  tone: Tone;
  title: string;
  detail: string;
  action?: BatteryTipAction;
}

export const isHighPerformancePlan = (plan: BatteryReport["activePlan"]) =>
  !!plan &&
  (HIGH_PERFORMANCE_GUIDS.has(plan.guid.toLowerCase()) || HIGH_PERFORMANCE_NAME.test(plan.name));

/** Dicas de energia que se aplicam a este notebook agora (as mais importantes primeiro). */
export function batteryTips(report: BatteryReport, summary: BatterySummary): BatteryTip[] {
  const tips: BatteryTip[] = [];

  if (summary.level === "weak") {
    tips.push({
      id: "replace",
      tone: "danger",
      title: "Hora de pensar em trocar a bateria",
      detail: `Ela segura ${summary.healthPct}% da carga original. Uma assistência técnica pode confirmar pelo relatório completo.`,
      action: { kind: "report", label: "Abrir relatório completo" },
    });
  } else if (summary.level === "worn") {
    tips.push({
      id: "worn",
      tone: "warning",
      title: "A bateria já perdeu parte da capacidade",
      detail: `Com ${summary.wearPct}% de desgaste, a autonomia é menor que a original. É normal com o tempo — não há ajuste no Windows que recupere isso.`,
    });
  }

  if (summary.lossPerYearPct !== null && summary.lossPerYearPct >= 10) {
    tips.push({
      id: "fast-wear",
      tone: "warning",
      title: "Desgaste mais rápido que o comum",
      detail: `A saúde cai cerca de ${formatDecimal(summary.lossPerYearPct, 0)} pontos por ano. Calor é o maior vilão: evite usar o notebook sobre cama ou almofada e mantenha as saídas de ar livres.`,
    });
  }

  if (summary.cycleCount !== null && summary.cycleCount >= HIGH_CYCLE_COUNT) {
    tips.push({
      id: "cycles",
      tone: "warning",
      title: `${plural(summary.cycleCount, "ciclo", "ciclos")} de carga`,
      detail:
        "A maioria das baterias de notebook é projetada para algo entre 300 e 1.000 ciclos. Daqui em diante a capacidade tende a cair mais rápido.",
    });
  }

  if (report.acShare !== null && report.acShare !== undefined && report.acShare >= 0.9) {
    tips.push({
      id: "always-plugged",
      tone: "primary",
      title: "Fica quase sempre na tomada",
      detail: `${Math.round(report.acShare * 100)}% do uso recente foi na tomada. Se o fabricante oferecer limite de carga (80%, "modo de conservação"), ative-o no app dele — reduz o desgaste de ficar sempre em 100%.`,
    });
  }

  if (report.onBattery && isHighPerformancePlan(report.activePlan)) {
    tips.push({
      id: "plan-on-battery",
      tone: "warning",
      title: "Alto desempenho ligado na bateria",
      detail: `O plano "${report.activePlan?.name}" mantém o processador acelerado e gasta a carga mais rápido. O Equilibrado acelera só quando precisa — troque em Energia e bateria ou no perfil "Bateria" da página Inteligência.`,
      action: { kind: "settings", label: "Abrir Energia e bateria", command: POWER_SETTINGS.power },
    });
  }

  const runtime = report.runtime?.fullChargeSec ?? null;
  if (runtime !== null && runtime > 0 && runtime < 2 * 3600) {
    tips.push({
      id: "short-runtime",
      tone: "warning",
      title: `Autonomia estimada de ${formatDuration(runtime)}`,
      detail:
        "Para render mais longe da tomada: reduza o brilho, ligue a Economia de bateria e veja quais apps mais gastam carga.",
      action: {
        kind: "settings",
        label: "Ver apps que mais gastam",
        command: POWER_SETTINGS.appUsage,
      },
    });
  }

  return tips;
}

/** "4 h 10 min", "45 min". */
export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** mWh → "48,7 Wh". */
export const formatWh = (mwh: number) => `${formatDecimal(mwh / 1000, 1)} Wh`;

/** "2026-11-28" → "nov/26". */
export function monthLabel(date: string) {
  const [y, m] = date.split("-").map(Number);
  if (!y || !m) return date;
  const names = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  return `${names[m - 1]}/${String(y).slice(2)}`;
}
