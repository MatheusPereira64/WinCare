import type { DiskDrive, ScheduleEntry, SystemInfo } from "./types";

export type RecommendationLevel = "critical" | "warning" | "tip";

export interface Recommendation {
  id: string;
  level: RecommendationLevel;
  title: string;
  description: string;
  actionLabel: string;
  /** Página do app ou comando do Windows que resolve. */
  to?: string;
  command?: string;
}

const UPDATE_STALE_DAYS = 45;
const UPTIME_STALE_DAYS = 7;

function parseBrDate(value: string) {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

/** Só o que dá para afirmar com os dados medidos: nunca inventa problema nem "tudo certo". */
export function buildRecommendations(
  system: SystemInfo,
  disks: DiskDrive[],
  schedules: ScheduleEntry[] | null,
  now = new Date(),
): Recommendation[] {
  const list: Recommendation[] = [];

  for (const disk of disks) {
    if (disk.totalGb <= 0) continue;
    const used = Math.round(((disk.totalGb - disk.freeGb) / disk.totalGb) * 100);
    if (used >= 85) {
      list.push({
        id: `disk-${disk.letter}`,
        level: used >= 95 ? "critical" : "warning",
        title: `Unidade ${disk.letter} quase cheia`,
        description: `Restam ${disk.freeGb} GB (${used}% usados). Pouco espaço deixa o Windows lento e pode impedir atualizações.`,
        actionLabel: "Liberar espaço",
        to: "/limpeza",
      });
    }
  }

  if (system.defenderStatus === "Desativado") {
    list.push({
      id: "defender",
      level: "critical",
      title: "Proteção em tempo real desativada",
      description: "O Windows Defender não está protegendo o PC agora.",
      actionLabel: "Abrir Segurança do Windows",
      command: "start ms-settings:windowsdefender",
    });
  }

  if (disks.some((d) => d.smart && d.smart !== "OK")) {
    list.push({
      id: "smart",
      level: "critical",
      title: "Um disco relatou problema",
      description: "O autodiagnóstico SMART não está OK. Faça backup dos seus arquivos.",
      actionLabel: "Ver discos",
      to: "/disco",
    });
  }

  const lastUpdate = parseBrDate(system.lastUpdate);
  if (lastUpdate) {
    const days = Math.floor((now.getTime() - lastUpdate.getTime()) / 86_400_000);
    if (days >= UPDATE_STALE_DAYS) {
      list.push({
        id: "windows-update",
        level: "warning",
        title: "Windows sem atualizar há tempo",
        description: `A última atualização instalada foi há ${days} dias.`,
        actionLabel: "Abrir Windows Update",
        command: "start ms-settings:windowsupdate",
      });
    }
  }

  const uptimeDays = Number(system.uptime.match(/^(\d+) dias?/)?.[1] ?? 0);
  if (uptimeDays >= UPTIME_STALE_DAYS) {
    list.push({
      id: "uptime",
      level: "tip",
      title: "Reinicie o computador",
      description: `Ligado há ${uptimeDays} dias sem reiniciar. Reiniciar conclui atualizações e libera memória.`,
      actionLabel: "Ver opções de energia",
      to: "/sistema",
    });
  }

  if (schedules && !schedules.some((s) => s.enabled)) {
    list.push({
      id: "schedule",
      level: "tip",
      title: "Automatize a manutenção",
      description: "Agende a limpeza para rodar sozinha toda semana, mesmo com o WinCare fechado.",
      actionLabel: "Agendar",
      to: "/agendamento",
    });
  }

  const order: Record<RecommendationLevel, number> = { critical: 0, warning: 1, tip: 2 };
  return list.sort((a, b) => order[a.level] - order[b.level]);
}
