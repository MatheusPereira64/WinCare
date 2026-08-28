import type { StartupAdvice, StartupImpact, StartupItem } from "./types";

interface Rule {
  match: RegExp;
  advice: StartupAdvice;
  impact?: StartupImpact;
  reason: string;
}

/** Primeira regra que casar vence — mantenha as essenciais no topo. */
const RULES: Rule[] = [
  {
    match: /securityhealth|windows defender|msmpeng|securityhealthsystray/i,
    advice: "keep",
    impact: "low",
    reason: "Proteção do Windows — mantenha ativo.",
  },
  {
    match:
      /nvidia|nvcontainer|nvbackend|nvdisplay|amd.?catalyst|radeonadrenalin|igfx|intel.*(graphics|display)/i,
    advice: "keep",
    impact: "low",
    reason: "Driver de vídeo — necessário para o hardware.",
  },
  {
    match: /realtek|rtkaud|synaptics|elan\s?touch|hid\s?device/i,
    advice: "keep",
    impact: "low",
    reason: "Driver de áudio ou painel tátil.",
  },
  {
    match: /ctfmon|runtimebroker|explorer\.exe/i,
    advice: "keep",
    impact: "low",
    reason: "Componente do Windows.",
  },
  {
    match: /discord/i,
    advice: "disable",
    impact: "high",
    reason: "O Discord é pesado no boot. Abra só quando for usar.",
  },
  {
    match: /\bsteam\b/i,
    advice: "disable",
    impact: "high",
    reason: "Launcher de jogos atrasa a inicialização. Abra o Steam quando for jogar.",
  },
  {
    match: /epicgames|epic games launcher/i,
    advice: "disable",
    impact: "high",
    reason: "Launcher da Epic não precisa abrir com o Windows.",
  },
  {
    match: /ubisoft|uplay|battle\.net|blizzard|eadesktop|origin\.exe|riotclient/i,
    advice: "disable",
    impact: "high",
    reason: "Launcher de jogos — inicie manualmente quando for jogar.",
  },
  {
    match: /spotify/i,
    advice: "disable",
    impact: "high",
    reason: "O Spotify pode esperar; abra depois que o PC ligar.",
  },
  {
    match: /adobe.*(gc|creative|update|arm|gcinvoker)|creative cloud/i,
    advice: "disable",
    impact: "high",
    reason: "Atualizador da Adobe costuma atrasar o boot.",
  },
  {
    match: /skype|utorrent|bittorrent|ccleaner|iotune|yourphone/i,
    advice: "disable",
    impact: "medium",
    reason: "Não é essencial no boot e costuma só ocupar memória.",
  },
  {
    match: /onedrive/i,
    advice: "consider",
    impact: "medium",
    reason: "Só desative se você não usar a nuvem da Microsoft no dia a dia.",
  },
  {
    match: /dropbox|googledrivesync|google drive|icloud/i,
    advice: "consider",
    impact: "medium",
    reason: "Sincronização na nuvem: útil, mas atrasa o boot se você não precisar na hora.",
  },
  {
    match: /teams|ms-teams/i,
    advice: "consider",
    impact: "high",
    reason: "O Teams é pesado. Desative no boot se não atender chamadas assim que ligar o PC.",
  },
  {
    match: /slack|zoom/i,
    advice: "consider",
    impact: "medium",
    reason: "App de reunião/chat — abra quando for usar, se não precisar imediatamente.",
  },
  {
    match: /java.*(update|sun)|jusched|apple.*itunes|ituneshelper/i,
    advice: "disable",
    impact: "medium",
    reason: "Atualizador em segundo plano. Não precisa iniciar com o Windows.",
  },
];

export interface StartupRecommendation {
  id: string;
  name: string;
  advice: Exclude<StartupAdvice, "keep">;
  reason: string;
  impact: StartupImpact;
  memMb: number;
  requiresAdmin: boolean;
  iconDataUrl?: string;
}

export interface StartupDiagnosis {
  enabledCount: number;
  totalCount: number;
  highImpactEnabled: number;
  totalMemMb: number;
  load: "light" | "moderate" | "heavy";
  score: number;
  summary: string;
  recommendations: StartupRecommendation[];
}

function haystack(item: StartupItem) {
  return `${item.name} ${item.command} ${item.processName ?? ""}`;
}

function impactFromRam(memMb: number, running?: boolean): StartupImpact {
  if (memMb >= 150) return "high";
  if (memMb >= 60) return "medium";
  if (running) return "low";
  return "unknown";
}

export function enrichStartupItem(item: StartupItem): StartupItem {
  const mem = Math.max(0, Math.round(item.memMb ?? 0));
  const rule = RULES.find((r) => r.match.test(haystack(item)));
  let impact: StartupImpact = rule?.impact ?? impactFromRam(mem, item.running);
  let advice: StartupAdvice = rule?.advice ?? "consider";
  let reason = rule?.reason ?? "";

  if (!rule) {
    if (item.location === "hklm-run" || item.requiresAdmin) {
      advice = "keep";
      reason = "Entrada do sistema. Só altere se souber o que o programa faz.";
      if (impact === "unknown") impact = "low";
    } else if (mem >= 150) {
      advice = "disable";
      reason = `Está usando cerca de ${mem} MB de RAM. Desative no boot e abra só quando precisar.`;
    } else if (mem >= 60) {
      advice = "consider";
      reason = `Usa cerca de ${mem} MB agora. Se não precisar logo após ligar o PC, desative.`;
    } else if (item.enabled) {
      advice = "consider";
      reason = "Não é essencial do Windows. Desative se não usar esse programa todo dia.";
    } else {
      advice = "keep";
      reason = "Já está desativado.";
    }
  } else if (impact === "unknown") {
    impact = impactFromRam(mem, item.running);
  }

  return {
    ...item,
    memMb: mem,
    impact,
    recommendation: advice,
    recommendationReason: reason,
  };
}

export function enrichStartupItems(items: StartupItem[]): StartupItem[] {
  return items.map(enrichStartupItem);
}

export function diagnoseStartup(items: StartupItem[]): StartupDiagnosis {
  const enriched = enrichStartupItems(items);
  const enabled = enriched.filter((i) => i.enabled);
  const highImpactEnabled = enabled.filter((i) => i.impact === "high").length;
  const mediumImpactEnabled = enabled.filter((i) => i.impact === "medium").length;
  const totalMemMb = enabled.reduce((sum, i) => sum + (i.memMb ?? 0), 0);

  let score = 100;
  score -= highImpactEnabled * 12;
  score -= mediumImpactEnabled * 5;
  score -= Math.max(0, enabled.length - 4) * 3;
  score -= Math.min(20, Math.round(totalMemMb / 50));
  score = Math.min(100, Math.max(0, score));

  const load: StartupDiagnosis["load"] =
    highImpactEnabled >= 3 || totalMemMb >= 800 || enabled.length >= 12
      ? "heavy"
      : highImpactEnabled >= 1 || totalMemMb >= 300 || enabled.length >= 7
        ? "moderate"
        : "light";

  const summary =
    enabled.length === 0
      ? "Nenhum programa inicia com o Windows. O boot deve estar rápido."
      : load === "heavy"
        ? `Há ${enabled.length} programas no boot e ${highImpactEnabled} com impacto alto (~${totalMemMb} MB na RAM). Desative os pesados para o PC ligar mais rápido.`
        : load === "moderate"
          ? `Há ${enabled.length} programas ativos (~${totalMemMb} MB). Alguns podem atrasar a inicialização — veja as recomendações abaixo.`
          : `Inicialização leve: ${enabled.length} programa(s) ativo(s) e cerca de ${totalMemMb} MB em uso.`;

  const recommendations: StartupRecommendation[] = enabled
    .filter((i) => i.recommendation === "disable" || i.recommendation === "consider")
    .map((i) => ({
      id: i.id,
      name: i.name,
      advice: i.recommendation as Exclude<StartupAdvice, "keep">,
      reason: i.recommendationReason || "Pode atrasar o boot.",
      impact: i.impact ?? "unknown",
      memMb: i.memMb ?? 0,
      requiresAdmin: i.location === "hklm-run" || !!i.requiresAdmin,
      iconDataUrl: i.iconDataUrl,
    }))
    .sort((a, b) => {
      const rank = { disable: 0, consider: 1 };
      if (rank[a.advice] !== rank[b.advice]) return rank[a.advice] - rank[b.advice];
      return b.memMb - a.memMb;
    });

  return {
    enabledCount: enabled.length,
    totalCount: enriched.length,
    highImpactEnabled,
    totalMemMb,
    load,
    score,
    summary,
    recommendations,
  };
}

export const IMPACT_LABEL: Record<StartupImpact, string> = {
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
  unknown: "—",
};

export const ADVICE_LABEL: Record<StartupAdvice, string> = {
  keep: "Manter",
  consider: "Avaliar",
  disable: "Desativar",
};

export const LOAD_LABEL: Record<StartupDiagnosis["load"], string> = {
  light: "Leve",
  moderate: "Moderada",
  heavy: "Pesada",
};
