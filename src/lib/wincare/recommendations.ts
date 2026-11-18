import { summarizeBattery } from "./battery";
import type { AppPath, HealthSample, StartupWatchItem } from "./intelligence";
import { diagnoseStartup } from "./startupAdvice";
import type {
  BatteryReport,
  DiskDrive,
  DiskUsageFolder,
  ScheduleEntry,
  StartupItem,
  SystemInfo,
} from "./types";

/*
 * Motor único de recomendações (Dashboard e Inteligência).
 *
 * Regras: só afirma o que foi medido — nunca inventa problema nem "tudo certo".
 * Cada regra tem um id estável: é ele que o usuário adia ou ignora, então não
 * mude ids existentes sem migrar `dismissedRecommendations` no store.
 */

export type RecommendationSeverity = "critical" | "warning" | "tip";

export interface RecommendationAction {
  label: string;
  /** Página do app que resolve… */
  to?: AppPath;
  /** …ou console/configuração do Windows (`start ms-settings:…`). */
  command?: string;
}

export interface Recommendation {
  id: string;
  severity: RecommendationSeverity;
  title: string;
  detail: string;
  action: RecommendationAction;
}

export interface RecommendationInput {
  info: SystemInfo;
  /** Unidades; vazio/ausente usa o uso do C: informado em `info`. */
  disks?: DiskDrive[];
  /** Rotinas agendadas; null/ausente = ainda não consultado (regra não roda). */
  schedules?: ScheduleEntry[] | null;
  /** Itens de inicialização; ausente = não avaliado. */
  startup?: StartupItem[];
  folders?: DiskUsageFolder[];
  /** Programas que apareceram no boot desde a última conferência. */
  newcomers?: StartupWatchItem[];
  /** Amostras de saúde (mais antigas primeiro). */
  trend?: HealthSample[];
  /** Relatório de bateria; ausente/sem bateria = regra não roda (desktop). */
  battery?: BatteryReport | null;
  now?: Date;
}

const SEVERITY_ORDER: Record<RecommendationSeverity, number> = {
  critical: 0,
  warning: 1,
  tip: 2,
};

export const SEVERITY_LABEL: Record<RecommendationSeverity, string> = {
  critical: "Crítico",
  warning: "Atenção",
  tip: "Dica",
};

const DISK_CRITICAL_PCT = 90;
const DISK_WARNING_PCT = 80;
const UPDATE_STALE_DAYS = 45;
const UPTIME_STALE_DAYS = 7;
const TEMP_BYTES = 1_500_000_000;
const DAY_MS = 86_400_000;

function parseBrDate(value: string) {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Hash curto e estável (djb2) para ids que dependem de uma lista. */
function shortHash(value: string) {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function diskRule(letter: string, usedPct: number, freeGb?: number): Recommendation | null {
  const free = typeof freeGb === "number" ? `${freeGb} GB livres` : null;
  if (usedPct >= DISK_CRITICAL_PCT) {
    return {
      id: `disk-${letter}`,
      severity: "critical",
      title: `Unidade ${letter} quase cheia`,
      detail: `${usedPct}% usados${free ? `, ${free}` : ""}. Com pouco espaço o Windows fica lento e as atualizações podem falhar.`,
      action: { label: "Liberar espaço", to: "/limpeza" },
    };
  }
  if (usedPct >= DISK_WARNING_PCT) {
    return {
      id: `disk-${letter}`,
      severity: "warning",
      title: `Pouco espaço livre em ${letter}`,
      detail: `${usedPct}% usados${free ? `, ${free}` : ""}. Vale limpar temporários e revisar arquivos grandes.`,
      action: { label: "Ver o que ocupa espaço", to: "/disco" },
    };
  }
  return null;
}

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const {
    info,
    disks = [],
    schedules,
    startup,
    folders = [],
    newcomers = [],
    trend = [],
    battery,
  } = input;
  const now = input.now ?? new Date();
  const list: Recommendation[] = [];
  const push = (rec: Recommendation | null) => {
    if (rec) list.push(rec);
  };

  // Espaço: por unidade quando a lista existe; senão, o C: da leitura do sistema.
  const measured = disks.filter((d) => d.totalGb > 0);
  if (measured.length > 0) {
    for (const disk of measured) {
      const used = Math.round(((disk.totalGb - disk.freeGb) / disk.totalGb) * 100);
      push(diskRule(disk.letter, used, disk.freeGb));
    }
  } else if (info.diskUsage > 0) {
    push(diskRule("C:", Math.round(info.diskUsage)));
  }

  if (disks.some((d) => d.smart && d.smart !== "OK")) {
    push({
      id: "smart",
      severity: "critical",
      title: "Um disco relatou problema",
      detail: "O autodiagnóstico SMART não está OK. Faça backup dos seus arquivos o quanto antes.",
      action: { label: "Ver discos", to: "/disco" },
    });
  }

  const defender = (info.defenderStatus || "").toLowerCase();
  if (defender.includes("desativ") || defender.includes("off") || defender === "false") {
    push({
      id: "defender",
      severity: "critical",
      title: "Proteção em tempo real desativada",
      detail: "O Windows Defender não está protegendo o computador agora.",
      action: { label: "Abrir Segurança do Windows", command: "start ms-settings:windowsdefender" },
    });
  }

  if ((info.cpuTemperature ?? 0) >= 85 || (info.gpuTemperature ?? 0) >= 85) {
    push({
      id: "thermals",
      severity: "critical",
      title: "Temperatura elevada",
      detail:
        "CPU ou GPU acima de 85 °C. Verifique a ventilação, a poeira e se o notebook está sobre uma superfície macia.",
      action: { label: "Ver sensores", to: "/monitoramento" },
    });
  }

  if (info.memoryUsage >= 85) {
    push({
      id: "ram-high",
      severity: "critical",
      title: "Memória quase no limite",
      detail: `${info.memoryUsage}% da RAM em uso. Otimize a memória ou feche programas pesados.`,
      action: { label: "Otimizar memória", to: "/monitoramento" },
    });
  }

  if (startup) {
    const diagnosis = diagnoseStartup(startup);
    const toDisable = diagnosis.recommendations.filter((r) => r.advice === "disable").length;
    if (diagnosis.load === "heavy") {
      push({
        id: "boot-heavy",
        severity: "critical",
        title: "Inicialização pesada",
        detail: diagnosis.summary,
        action: { label: "Revisar inicialização", to: "/inicializacao" },
      });
    } else if (toDisable > 0) {
      push({
        id: "boot-apps",
        severity: "warning",
        title: "Há programas que podem sair da inicialização",
        detail: `${toDisable} ${plural(toDisable, "programa sugerido", "programas sugeridos")} para desativar.`,
        action: { label: "Revisar inicialização", to: "/inicializacao" },
      });
    }
  }

  const lastUpdate = parseBrDate(info.lastUpdate);
  if (lastUpdate) {
    const days = Math.floor((now.getTime() - lastUpdate.getTime()) / DAY_MS);
    if (days >= UPDATE_STALE_DAYS) {
      push({
        id: "windows-update",
        severity: "warning",
        title: "Windows sem atualizar há tempo",
        detail: `A última atualização instalada foi há ${days} dias.`,
        action: { label: "Abrir Windows Update", command: "start ms-settings:windowsupdate" },
      });
    }
  }

  const temp = folders
    .filter((f) => f.id === "temp-user" || f.id === "temp-win")
    .reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
  if (temp >= TEMP_BYTES) {
    push({
      id: "temp-files",
      severity: "warning",
      title: "Arquivos temporários ocupando espaço",
      detail: "Há mais de 1,5 GB nas pastas Temp. A limpeza é segura e rápida.",
      action: { label: "Limpar agora", to: "/limpeza" },
    });
  }

  if (info.cpuUsage >= 88) {
    push({
      id: "cpu-load",
      severity: "warning",
      title: "Processador muito ocupado",
      detail: `${info.cpuUsage}% de uso. Veja quais processos estão pesando.`,
      action: { label: "Ver processos", to: "/monitoramento" },
    });
  }

  if (newcomers.length > 0) {
    // O id inclui quais programas são: adiar/ignorar vale para este grupo, e um
    // programa novo depois disso volta a avisar.
    const signature = shortHash(
      newcomers
        .map((n) => n.id)
        .sort()
        .join("|"),
    );
    push({
      id: `startup-new:${signature}`,
      severity: "warning",
      title: `${newcomers.length} ${plural(newcomers.length, "programa novo", "programas novos")} na inicialização`,
      detail: newcomers.map((n) => n.name).join(", "),
      action: { label: "Revisar inicialização", to: "/inicializacao" },
    });
  }

  if (trend.length >= 9) {
    const recent = trend.slice(-6);
    const older = trend.slice(0, Math.min(6, trend.length - 6));
    const avg = (rows: HealthSample[]) => rows.reduce((s, r) => s + r.health, 0) / rows.length;
    if (avg(recent) <= avg(older) - 8) {
      push({
        id: "health-drop",
        severity: "warning",
        title: "Saúde em queda",
        detail:
          "O índice de saúde caiu em relação às medições anteriores. Veja o que mudou na linha do tempo.",
        action: { label: "Ver histórico", to: "/inteligencia" },
      });
    }
  }

  // Bateria muito desgastada (abaixo de 60%): aviso honesto, sem alarme — é desgaste normal de uso.
  const batterySummary = battery ? summarizeBattery(battery) : null;
  if (batterySummary?.level === "weak") {
    push({
      id: "battery-worn",
      severity: "warning",
      title: "Bateria muito desgastada",
      detail: `Ela segura ${batterySummary.healthPct}% da carga original, então a autonomia longe da tomada é bem menor. É desgaste normal de uso; na tomada o notebook funciona igual.`,
      action: { label: "Ver bateria", to: "/sistema" },
    });
  }

  const uptimeDays = Number(info.uptime.match(/^(\d+) dias?/)?.[1] ?? 0);
  if (uptimeDays >= UPTIME_STALE_DAYS) {
    push({
      id: "uptime",
      severity: "tip",
      title: "Reinicie o computador",
      detail: `Ligado há ${uptimeDays} dias sem reiniciar. Reiniciar conclui atualizações e libera memória.`,
      action: { label: "Ver opções de energia", to: "/sistema" },
    });
  }

  if (schedules && !schedules.some((s) => s.enabled)) {
    push({
      id: "schedule",
      severity: "tip",
      title: "Automatize a manutenção",
      detail: "Agende a limpeza para rodar sozinha toda semana, mesmo com o WinCare fechado.",
      action: { label: "Agendar", to: "/agendamento" },
    });
  }

  // Ordem estável: severidade, depois a ordem das regras acima.
  return list
    .map((rec, index) => ({ rec, index }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.rec.severity] - SEVERITY_ORDER[b.rec.severity] || a.index - b.index,
    )
    .map(({ rec }) => rec);
}

/* ---------- Adiar / ignorar ---------- */

/** `until` null = ignorada até o usuário restaurar. */
export interface RecommendationDismissal {
  until: number | null;
  at: number;
}

function isDismissed(dismissal: RecommendationDismissal | undefined, now = Date.now()) {
  return !!dismissal && (dismissal.until === null || dismissal.until > now);
}

/** Separa o que aparece do que foi adiado/ignorado pelo usuário. */
export function partitionRecommendations(
  items: Recommendation[],
  dismissed: Record<string, RecommendationDismissal>,
  now = Date.now(),
) {
  const active: Recommendation[] = [];
  const hidden: (Recommendation & { dismissal: RecommendationDismissal })[] = [];
  for (const item of items) {
    const dismissal = dismissed[item.id];
    if (isDismissed(dismissal, now)) hidden.push({ ...item, dismissal: dismissal! });
    else active.push(item);
  }
  return { active, hidden };
}
