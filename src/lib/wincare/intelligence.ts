import { diagnoseStartup, enrichStartupItems } from "./startupAdvice";
import type { DiskUsageFolder, StartupItem, SystemInfo, TopProcess } from "./types";

export type ProfileId = "balanced" | "gaming" | "work" | "battery";

export interface HealthSample {
  ts: number;
  health: number;
  cpu: number;
  ram: number;
  disk: number;
  gpu: number | null;
  cpuTemp: number | null;
}

export interface SystemSnapshot {
  id: string;
  ts: number;
  label: string;
  health: number;
  cpu: number;
  ram: number;
  disk: number;
  gpu: number | null;
  startupEnabled: number;
  startupMemMb: number;
  defender: string;
  topProcess?: string;
}

export interface StartupWatchItem {
  id: string;
  name: string;
  firstSeen: number;
  enabled: boolean;
}

export interface GamingSession {
  id: string;
  game: string;
  startedAt: number;
  endedAt?: number;
  samples: number;
  avgCpu: number;
  avgGpu: number | null;
  avgRam: number;
  maxCpu: number;
  maxGpu: number | null;
}

export interface StorageFileHit {
  path: string;
  name: string;
  sizeBytes: number;
}

export interface DuplicateGroup {
  name: string;
  sizeBytes: number;
  paths: string[];
}

export interface StorageScan {
  at: number;
  largeFiles: StorageFileHit[];
  duplicates: DuplicateGroup[];
  visited: number;
  diskUsedPct?: number;
}

export type AppPath =
  | "/"
  | "/monitoramento"
  | "/reparo"
  | "/limpeza"
  | "/disco"
  | "/inicializacao"
  | "/sistema"
  | "/redes"
  | "/inteligencia";

export interface SymptomDef {
  id: string;
  title: string;
  hint: string;
}

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  href: AppPath;
  action: string;
}

export interface PowerPlanInfo {
  guid: string;
  name: string;
  active: boolean;
}

export interface Finding {
  id: string;
  tone: "ok" | "warn" | "bad";
  title: string;
  detail: string;
  href?: AppPath;
  action?: string;
}

export const SYMPTOMS: SymptomDef[] = [
  { id: "slow", title: "Meu PC está lento", hint: "RAM, CPU, inicialização e disco" },
  { id: "stutter", title: "Meu jogo está travando", hint: "GPU, RAM, overlays e disco" },
  { id: "hot", title: "O PC esquenta demais", hint: "Temperatura de CPU e GPU" },
  { id: "space", title: "Acabou o espaço", hint: "Disco C: e pastas grandes" },
  { id: "boot", title: "Demora para ligar", hint: "Programas na inicialização" },
  { id: "net", title: "A internet está ruim", hint: "DNS, ping e pilha de rede" },
];

export const PROFILE_META: Record<
  ProfileId,
  { title: string; detail: string; planHint: string }
> = {
  balanced: {
    title: "Equilibrado",
    detail: "Uso misto: desempenho e consumo no meio-termo do Windows.",
    planHint: "Plano Equilibrado",
  },
  gaming: {
    title: "Jogos",
    detail: "Prioriza desempenho: plano de alto desempenho e monitoramento da sessão.",
    planHint: "Alto desempenho",
  },
  work: {
    title: "Trabalho",
    detail: "Estável para escritório: plano equilibrado e menos distrações de launchers.",
    planHint: "Plano Equilibrado",
  },
  battery: {
    title: "Bateria",
    detail: "Economia de energia para notebook: reduz desempenho em troca de autonomia.",
    planHint: "Economia de energia",
  },
};

export const GAME_PROCESS_RE =
  /\b(cs2|csgo|valorant|league of legends|leagueclient|fortniteclient|rocketleague|gta5|gtav|rdr2|minecraft|javaw|overwatch|apexlegends|cod\.exe|modernwarfare|warzone|eldenring|cyberpunk|dota2|pubg|rainbowsix|destiny2|wow|wowclassic|starfield|palworld|helldivers|thefinals|robloxplayer|genshin|zenlesszonezero)\b/i;

const OVERLAY_RE = /\b(discord|overwolf|nvidia share|rtss|msi afterburner|steamwebhelper)\b/i;

export function sampleFromSystem(info: SystemInfo): HealthSample {
  return {
    ts: Date.now(),
    health: Math.round(info.health || 0),
    cpu: Math.round(info.cpuUsage || 0),
    ram: Math.round(info.memoryUsage || 0),
    disk: Math.round(info.diskUsage || 0),
    gpu: typeof info.gpuUsage === "number" ? Math.round(info.gpuUsage) : null,
    cpuTemp: typeof info.cpuTemperature === "number" ? info.cpuTemperature : null,
  };
}

export function snapshotFromState(
  info: SystemInfo,
  startup: StartupItem[],
  top?: TopProcess[],
  label?: string,
): SystemSnapshot {
  const enabled = enrichStartupItems(startup).filter((i) => i.enabled);
  const mem = enabled.reduce((s, i) => s + (i.memMb ?? 0), 0);
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    ts: Date.now(),
    label: label || `Captura ${new Date().toLocaleString("pt-BR")}`,
    health: Math.round(info.health || 0),
    cpu: Math.round(info.cpuUsage || 0),
    ram: Math.round(info.memoryUsage || 0),
    disk: Math.round(info.diskUsage || 0),
    gpu: typeof info.gpuUsage === "number" ? Math.round(info.gpuUsage) : null,
    startupEnabled: enabled.length,
    startupMemMb: mem,
    defender: info.defenderStatus,
    topProcess: top?.[0]?.name,
  };
}

export function detectGameProcess(processes: TopProcess[], gpuUsage: number | null | undefined) {
  const named = processes.find((p) => GAME_PROCESS_RE.test(p.name));
  if (named) return named.name;
  if ((gpuUsage ?? 0) >= 45) {
    const heavy = processes.find(
      (p) =>
        p.cpu > 12 &&
        !/^(dwm|csrss|system|idle|explorer|wincare|chrome|msedge|code|discord|steam)$/i.test(p.name),
    );
    if (heavy) return heavy.name;
  }
  return null;
}

export function sessionNote(session: GamingSession) {
  if (session.avgRam >= 85) return "RAM alta durante o jogo — feche o navegador e overlays.";
  if ((session.maxGpu ?? 0) >= 95) return "GPU no limite. Reduza qualidade ou limite FPS.";
  if (session.avgCpu >= 80) return "CPU saturada. Feche apps em segundo plano.";
  if (session.samples >= 4) return "Sessão estável. Sem gargalo evidente nos sensores.";
  return "Amostra curta — jogue uns minutos com o WinCare aberto para um relatório melhor.";
}

export function buildRecommendations(input: {
  info: SystemInfo;
  startup: StartupItem[];
  folders?: DiskUsageFolder[];
  newcomers?: StartupWatchItem[];
  trend?: HealthSample[];
}): Recommendation[] {
  const recs: Recommendation[] = [];
  const { info, startup, folders = [], newcomers = [], trend = [] } = input;
  const diagnosis = diagnoseStartup(startup);
  const enabled = startup.filter((s) => s.enabled);

  if (info.memoryUsage >= 85) {
    recs.push({
      id: "ram-high",
      title: "Memória quase no limite",
      detail: `${info.memoryUsage}% da RAM em uso. Feche programas pesados ou desative itens do boot.`,
      severity: "high",
      href: "/inicializacao",
      action: "Ver inicialização",
    });
  }

  if (info.diskUsage >= 90) {
    recs.push({
      id: "disk-full",
      title: "Disco C: está cheio",
      detail: `${info.diskUsage}% ocupado. PCs lentos e atualizações falham com pouco espaço livre.`,
      severity: "high",
      href: "/disco",
      action: "Analisar disco",
    });
  } else if (info.diskUsage >= 80) {
    recs.push({
      id: "disk-tight",
      title: "Pouco espaço livre",
      detail: `${info.diskUsage}% do C: em uso. Vale limpar temporários e revisar arquivos grandes.`,
      severity: "medium",
      href: "/disco",
      action: "Ver armazenamento",
    });
  }

  if (diagnosis.load === "heavy") {
    recs.push({
      id: "boot-heavy",
      title: "Inicialização pesada",
      detail: diagnosis.summary,
      severity: "high",
      href: "/inicializacao",
      action: "Otimizar boot",
    });
  } else if (diagnosis.recommendations.some((r) => r.advice === "disable")) {
    recs.push({
      id: "boot-apps",
      title: "Há programas no boot que podem sair",
      detail: `${diagnosis.recommendations.filter((r) => r.advice === "disable").length} item(ns) sugeridos para desativar.`,
      severity: "medium",
      href: "/inicializacao",
      action: "Revisar lista",
    });
  }

  const tempFolder = folders.find((f) => f.id === "temp-user" || f.id === "temp-win");
  if (tempFolder && tempFolder.sizeBytes >= 1_500_000_000) {
    recs.push({
      id: "temp-files",
      title: "Temporários ocupando espaço",
      detail: "Há mais de 1,5 GB em pastas Temp. Limpeza segura e rápida.",
      severity: "medium",
      href: "/limpeza",
      action: "Limpar agora",
    });
  }

  if ((info.cpuTemperature ?? 0) >= 85 || (info.gpuTemperature ?? 0) >= 85) {
    recs.push({
      id: "thermals",
      title: "Temperatura elevada",
      detail: "CPU ou GPU acima de 85 °C. Verifique poeira, notebook na cama e plano de energia.",
      severity: "high",
      href: "/monitoramento",
      action: "Ver sensores",
    });
  }

  if (info.cpuUsage >= 88) {
    recs.push({
      id: "cpu-load",
      title: "CPU sustentada alta",
      detail: `${info.cpuUsage}% de uso. Veja os processos no monitoramento.`,
      severity: "medium",
      href: "/monitoramento",
      action: "Ver processos",
    });
  }

  const def = (info.defenderStatus || "").toLowerCase();
  if (def.includes("desativ") || def.includes("off") || def === "false") {
    recs.push({
      id: "defender",
      title: "Proteção em tempo real aparentemente off",
      detail: "O Windows Defender não parece ativo. Confira em Segurança do Windows.",
      severity: "high",
      href: "/sistema",
      action: "Abrir sistema",
    });
  }

  if (newcomers.length > 0) {
    recs.push({
      id: "startup-new",
      title: `${newcomers.length} programa(s) novo(s) no boot`,
      detail: newcomers.map((n) => n.name).join(", "),
      severity: "medium",
      href: "/inicializacao",
      action: "Revisar novos",
    });
  }

  if (trend.length >= 6) {
    const recent = trend.slice(-6);
    const older = trend.slice(0, Math.min(6, trend.length - 6));
    if (older.length >= 3) {
      const avg = (rows: HealthSample[]) =>
        rows.reduce((s, r) => s + r.health, 0) / rows.length;
      if (avg(recent) <= avg(older) - 8) {
        recs.push({
          id: "health-drop",
          title: "Saúde em queda nesta sessão",
          detail: "O índice de saúde caiu em relação às amostras anteriores. Veja a linha do tempo.",
          severity: "medium",
          href: "/inteligencia",
          action: "Ver histórico",
        });
      }
    }
  }

  if (enabled.length === 0 && recs.length === 0 && info.health >= 80) {
    recs.push({
      id: "healthy",
      title: "Nada urgente agora",
      detail: "Métricas dentro do esperado. Continue acompanhando a linha do tempo.",
      severity: "low",
      href: "/inteligencia",
      action: "Ver saúde",
    });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return recs.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8);
}

export function diagnoseSymptom(
  id: string,
  ctx: {
    info: SystemInfo;
    startup: StartupItem[];
    folders?: DiskUsageFolder[];
    processes?: TopProcess[];
  },
): Finding[] {
  const { info, startup, folders = [], processes = [] } = ctx;
  const diagnosis = diagnoseStartup(startup);
  const findings: Finding[] = [];

  const pushLoad = () => {
    findings.push({
      id: "ram",
      tone: info.memoryUsage >= 85 ? "bad" : info.memoryUsage >= 72 ? "warn" : "ok",
      title: `RAM em ${info.memoryUsage}%`,
      detail:
        info.memoryUsage >= 85
          ? "Memória saturada — o Windows começa a usar disco (swap) e tudo fica lento."
          : "Uso de memória dentro do aceitável.",
      href: "/monitoramento",
      action: "Ver processos",
    });
    findings.push({
      id: "cpu",
      tone: info.cpuUsage >= 85 ? "bad" : info.cpuUsage >= 70 ? "warn" : "ok",
      title: `CPU em ${info.cpuUsage}%`,
      detail:
        info.cpuUsage >= 85
          ? "Processador ocupado. Feche o que não estiver usando."
          : "CPU sem saturação no momento.",
      href: "/monitoramento",
    });
  };

  if (id === "slow") {
    pushLoad();
    findings.push({
      id: "boot",
      tone: diagnosis.load === "heavy" ? "bad" : diagnosis.load === "moderate" ? "warn" : "ok",
      title: `Inicialização ${diagnosis.load === "heavy" ? "pesada" : diagnosis.load === "moderate" ? "moderada" : "leve"}`,
      detail: diagnosis.summary,
      href: "/inicializacao",
      action: "Otimizar boot",
    });
    findings.push({
      id: "disk",
      tone: info.diskUsage >= 90 ? "bad" : info.diskUsage >= 80 ? "warn" : "ok",
      title: `Disco C: ${info.diskUsage}% usado`,
      detail:
        info.diskUsage >= 80
          ? "Pouco espaço deixa o sistema lento, principalmente em HDD."
          : "Espaço em disco suficiente.",
      href: "/disco",
      action: "Analisar disco",
    });
  }

  if (id === "stutter") {
    findings.push({
      id: "gpu",
      tone: (info.gpuUsage ?? 0) >= 95 ? "warn" : "ok",
      title: typeof info.gpuUsage === "number" ? `GPU em ${info.gpuUsage}%` : "GPU sem leitura",
      detail:
        (info.gpuUsage ?? 0) >= 95
          ? "Placa de vídeo no teto. Baixe qualidade gráfica ou ative gerador de quadros com cuidado."
          : "GPU não parece saturada neste instante — abra o jogo com o WinCare ao fundo.",
      href: "/inteligencia",
      action: "Perfil Jogos",
    });
    findings.push({
      id: "vram-ram",
      tone: info.memoryUsage >= 88 ? "bad" : "ok",
      title: `RAM em ${info.memoryUsage}%`,
      detail: "Jogos travam quando a memória acaba e o Windows pagina no disco.",
      href: "/monitoramento",
    });
    const overlay = processes.find((p) => OVERLAY_RE.test(p.name));
    findings.push({
      id: "overlay",
      tone: overlay ? "warn" : "ok",
      title: overlay ? `Overlay ativo: ${overlay.name}` : "Sem overlay pesado na amostra",
      detail: overlay
        ? "Discord, Afterburner e overlays da NVIDIA podem causar stutter. Teste desligando."
        : "Nenhum overlay óbvio nos processos do topo.",
    });
    findings.push({
      id: "disk-game",
      tone: info.diskUsage >= 92 ? "bad" : "ok",
      title: `Disco ${info.diskUsage}%`,
      detail: "Disco cheio aumenta stutter em texturas e shaders.",
      href: "/disco",
    });
  }

  if (id === "hot") {
    const cpuT = info.cpuTemperature;
    const gpuT = info.gpuTemperature;
    findings.push({
      id: "cpu-temp",
      tone: (cpuT ?? 0) >= 85 ? "bad" : (cpuT ?? 0) >= 75 ? "warn" : cpuT == null ? "warn" : "ok",
      title: cpuT == null ? "Temperatura da CPU indisponível" : `CPU ${cpuT} °C`,
      detail:
        (cpuT ?? 0) >= 85
          ? "Acima de 85 °C com carga. Limpe o cooler e evite superfície macia no notebook."
          : "Sem superaquecimento evidente de CPU.",
      href: "/monitoramento",
    });
    findings.push({
      id: "gpu-temp",
      tone: (gpuT ?? 0) >= 85 ? "bad" : (gpuT ?? 0) >= 78 ? "warn" : gpuT == null ? "warn" : "ok",
      title: gpuT == null ? "Temperatura da GPU indisponível" : `GPU ${gpuT} °C`,
      detail: "Em jogos, 70–80 °C é comum; acima de 85 °C vale revisar pasta térmica e fluxo de ar.",
      href: "/monitoramento",
    });
    findings.push({
      id: "power",
      tone: "ok",
      title: "Plano de energia",
      detail: "Em notebook, Alto desempenho esquenta mais. Use Bateria se estiver longe da tomada.",
      href: "/inteligencia",
      action: "Ver perfis",
    });
  }

  if (id === "space") {
    findings.push({
      id: "c-drive",
      tone: info.diskUsage >= 90 ? "bad" : info.diskUsage >= 80 ? "warn" : "ok",
      title: `C: ${info.diskUsage}% usado (${info.diskTotalGb} GB)`,
      detail: "O Windows precisa de alguns GB livres para hibernação, updates e arquivo de paginação.",
      href: "/disco",
    });
    const big = [...folders].sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
    if (big) {
      findings.push({
        id: "folder",
        tone: big.sizeBytes >= 2_000_000_000 ? "warn" : "ok",
        title: `${big.label} é a pasta mais pesada da análise rápida`,
        detail: "Use a inteligência de armazenamento para arquivos grandes e duplicados.",
        href: "/disco",
        action: "Ver arquivos",
      });
    }
    findings.push({
      id: "cleanup",
      tone: "ok",
      title: "Limpeza segura",
      detail: "Temp do usuário e Lixeira podem ser esvaziados sem desinstalar programas.",
      href: "/limpeza",
      action: "Abrir limpeza",
    });
  }

  if (id === "boot") {
    findings.push({
      id: "count",
      tone: diagnosis.enabledCount >= 10 ? "bad" : diagnosis.enabledCount >= 6 ? "warn" : "ok",
      title: `${diagnosis.enabledCount} programas abrem com o Windows`,
      detail: diagnosis.summary,
      href: "/inicializacao",
      action: "Gerenciar boot",
    });
    const disable = diagnosis.recommendations.filter((r) => r.advice === "disable");
    findings.push({
      id: "suggest",
      tone: disable.length ? "warn" : "ok",
      title: disable.length
        ? `${disable.length} sugeridos para desativar`
        : "Nenhum vilão óbvio no boot",
      detail: disable.length
        ? disable.map((d) => d.name).join(", ")
        : "Os itens ativos parecem essenciais ou leves.",
      href: "/inicializacao",
    });
  }

  if (id === "net") {
    findings.push({
      id: "dns",
      tone: "ok",
      title: "Teste DNS e ping",
      detail: "Rode Ping e DNS na aba Redes para ver perda de pacotes e latência real.",
      href: "/redes",
      action: "Testar rede",
    });
    findings.push({
      id: "flush",
      tone: "ok",
      title: "Cache DNS",
      detail: "Se sites abrem em um dispositivo e não neste PC, limpe o cache DNS.",
      href: "/redes",
    });
    findings.push({
      id: "reset",
      tone: "warn",
      title: "Reset da pilha (último recurso)",
      detail: "Winsock / TCP-IP resolvem falhas graves, mas podem pedir reinício.",
      href: "/redes",
    });
  }

  return findings;
}

export function diffSnapshots(a: SystemSnapshot, b: SystemSnapshot) {
  const row = (label: string, before: number | string, after: number | string, better?: "up" | "down") => {
    const n1 = typeof before === "number" ? before : null;
    const n2 = typeof after === "number" ? after : null;
    let delta: number | null = null;
    let tone: "up" | "down" | "flat" = "flat";
    if (n1 != null && n2 != null) {
      delta = n2 - n1;
      if (delta === 0) tone = "flat";
      else if (better === "up") tone = delta > 0 ? "up" : "down";
      else if (better === "down") tone = delta < 0 ? "up" : "down";
    }
    return { label, before, after, delta, tone };
  };

  return [
    row("Saúde", a.health, b.health, "up"),
    row("CPU %", a.cpu, b.cpu, "down"),
    row("RAM %", a.ram, b.ram, "down"),
    row("Disco %", a.disk, b.disk, "down"),
    row("GPU %", a.gpu ?? "—", b.gpu ?? "—", "down"),
    row("Itens no boot", a.startupEnabled, b.startupEnabled, "down"),
    row("RAM do boot (MB)", a.startupMemMb, b.startupMemMb, "down"),
  ];
}

export function detectStartupChanges(
  current: StartupItem[],
  known: StartupWatchItem[],
): { added: StartupWatchItem[]; removed: StartupWatchItem[] } {
  const now = Date.now();
  const knownMap = new Map(known.map((k) => [k.id, k]));
  const currentEnabled = current.filter((i) => i.enabled);
  const added = currentEnabled
    .filter((i) => !knownMap.has(i.id))
    .map((i) => ({ id: i.id, name: i.name, firstSeen: now, enabled: true }));
  const currentIds = new Set(current.map((i) => i.id));
  const removed = known.filter((k) => k.enabled && !currentIds.has(k.id));
  return { added, removed };
}

export function mergeStartupWatch(current: StartupItem[], known: StartupWatchItem[]): StartupWatchItem[] {
  const now = Date.now();
  const map = new Map(known.map((k) => [k.id, k]));
  for (const item of current) {
    const prev = map.get(item.id);
    if (prev) {
      map.set(item.id, { ...prev, name: item.name, enabled: item.enabled });
    } else {
      map.set(item.id, { id: item.id, name: item.name, firstSeen: now, enabled: item.enabled });
    }
  }
  return [...map.values()];
}

export function seedHealthHistory(now = Date.now()): HealthSample[] {
  const out: HealthSample[] = [];
  for (let i = 23; i >= 0; i--) {
    const ts = now - i * 15 * 60 * 1000;
    const wave = Math.sin(i / 4) * 6;
    out.push({
      ts,
      health: Math.round(84 + wave),
      cpu: Math.round(22 + Math.abs(wave) * 2),
      ram: Math.round(44 + wave * 0.6),
      disk: 72,
      gpu: Math.round(16 + Math.abs(wave)),
      cpuTemp: Math.round(48 + Math.abs(wave) * 0.4),
    });
  }
  return out;
}

export const SIM_LARGE_FILES: StorageFileHit[] = [
  {
    name: "Win11_24H2.iso",
    path: "C:\\Users\\Usuario\\Downloads\\Win11_24H2.iso",
    sizeBytes: 5_400_000_000,
  },
  {
    name: "game-setup.exe",
    path: "C:\\Users\\Usuario\\Downloads\\game-setup.exe",
    sizeBytes: 2_800_000_000,
  },
  {
    name: "backup-fotos.zip",
    path: "C:\\Users\\Usuario\\Documents\\backup-fotos.zip",
    sizeBytes: 1_900_000_000,
  },
  {
    name: "gravacao-aula.mp4",
    path: "C:\\Users\\Usuario\\Videos\\gravacao-aula.mp4",
    sizeBytes: 1_250_000_000,
  },
];

export const SIM_DUPLICATES: DuplicateGroup[] = [
  {
    name: "IMG_1042.JPG",
    sizeBytes: 8_400_000,
    paths: [
      "C:\\Users\\Usuario\\Pictures\\IMG_1042.JPG",
      "C:\\Users\\Usuario\\Downloads\\IMG_1042.JPG",
    ],
  },
  {
    name: "projeto-final.zip",
    sizeBytes: 420_000_000,
    paths: [
      "C:\\Users\\Usuario\\Documents\\projeto-final.zip",
      "C:\\Users\\Usuario\\Desktop\\projeto-final.zip",
    ],
  },
];
