import type { ScheduleConfig, ScheduleJob } from "./types";

/*
 * Vocabulário das rotinas agendadas, usado pela tela Agendamento e pela
 * introdução (sugestão de limpeza semanal).
 */

export const JOB_TEXT: Record<
  ScheduleJob,
  { title: string; description: string; includes: string[] }
> = {
  cleanup: {
    title: "Limpeza automática",
    description: "Libera espaço sem pedir nada e sem mexer nos seus dados de navegação.",
    includes: [
      "Temporários com mais de 24 horas",
      "Cache de navegadores e apps que estiverem fechados",
      "Cookies, histórico e senhas ficam intactos",
    ],
  },
  "full-check": {
    title: "Verificação completa",
    description: "Procura e corrige problemas no Windows. Pode levar até 1 hora em segundo plano.",
    includes: [
      "Ponto de restauração antes de tudo",
      "SFC e DISM (verifica e repara a imagem)",
      "Verificação de disco somente leitura",
    ],
  },
};

export const FREQUENCIES: { value: ScheduleConfig["frequency"]; label: string }[] = [
  { value: "daily", label: "Todo dia" },
  { value: "weekly", label: "Toda semana" },
  { value: "monthly", label: "Todo mês" },
];

const WEEK_DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Chips curtos ("Dom") com nome completo para o leitor de tela. */
export const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label, value) => ({
  value,
  label,
  ariaLabel: WEEK_DAY_NAMES[value],
}));

export const MONTH_DAYS = [1, 5, 10, 15, 20, 25].map((d) => ({ value: d, label: `Dia ${d}` }));

export const TIMES = ["08:00", "12:00", "18:00", "20:00", "22:00"].map((t) => ({
  value: t,
  label: t,
}));

/** Sugestão da introdução: toda semana, domingo ao meio-dia. */
export const DEFAULT_WEEKLY_CLEANUP: ScheduleConfig = {
  frequency: "weekly",
  weekDay: 0,
  monthDay: 1,
  time: "12:00",
};

/** "Todo domingo às 12:00", "Toda segunda às 08:00", "Todo dia 5 do mês às 20:00". */
export function describeConfig(config: ScheduleConfig) {
  if (config.frequency === "daily") return `Todo dia às ${config.time}`;
  if (config.frequency === "weekly") {
    const day = WEEK_DAY_NAMES[config.weekDay];
    const prefix = config.weekDay === 0 || config.weekDay === 6 ? "Todo" : "Toda";
    return `${prefix} ${day} às ${config.time}`;
  }
  return `Todo dia ${config.monthDay} do mês às ${config.time}`;
}
