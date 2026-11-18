/*
 * Histórico de demonstração (navegador, sem o processo principal do Electron).
 * Gerado no cliente na primeira leitura — nunca na renderização do servidor,
 * para a página não mudar entre o HTML do servidor e a hidratação.
 * Ações simuladas nesta sessão (limpeza, desinstalação, reparos) entram aqui.
 */
import { dayKey, startOfDay, startOfWeek } from "./history";
import type { HealthDay, MaintenanceEvent, MaintenanceHistory } from "./types";

const DAY = 86_400_000;
const GB = 1024 ** 3;
const MB = 1024 ** 2;

let state: { events: MaintenanceEvent[]; health: HealthDay[] } | null = null;
let counter = 0;
const listeners = new Set<() => void>();

/** Pseudoaleatório com semente: o mesmo histórico a cada recarga da página. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Seed = Omit<MaintenanceEvent, "id" | "ts" | "source" | "ok"> &
  Partial<Pick<MaintenanceEvent, "source" | "ok">> & { daysAgo: number; hour: number };

const MANUAL: Seed[] = [
  {
    daysAgo: 1,
    hour: 19.5,
    kind: "cleanup",
    action: "cleaner",
    title: "Navegadores e apps limpos",
    detail: "Google Chrome, Discord, Spotify · 4.212 arquivos",
    freedBytes: 1.35 * GB,
  },
  {
    daysAgo: 2,
    hour: 21.2,
    kind: "optimize",
    action: "startup-disable",
    title: "Discord não abre mais com o Windows",
    subject: "Discord",
  },
  {
    daysAgo: 2,
    hour: 21.3,
    kind: "optimize",
    action: "startup-disable",
    title: "Steam não abre mais com o Windows",
    subject: "Steam",
  },
  {
    daysAgo: 3,
    hour: 14.1,
    kind: "uninstall",
    action: "uninstall",
    title: "Blender desinstalado",
    subject: "Blender",
    freedBytes: 1.6 * GB,
    estimated: true,
  },
  {
    daysAgo: 3,
    hour: 14.2,
    kind: "cleanup",
    action: "leftovers",
    title: "Sobras de Blender removidas",
    subject: "Blender",
    detail: "3 itens removidos",
    freedBytes: 214 * MB,
  },
  {
    daysAgo: 5,
    hour: 10.0,
    kind: "safety",
    action: "restore-point",
    title: "Ponto de restauração criado",
  },
  {
    daysAgo: 5,
    hour: 10.3,
    kind: "repair",
    action: "sfc",
    title: "Arquivos do sistema verificados e reparados (SFC)",
    durationMs: 14 * 60_000,
  },
  {
    daysAgo: 9,
    hour: 16.7,
    kind: "optimize",
    action: "memory",
    title: "Memória otimizada",
    detail: "812 MB de RAM liberados",
  },
  {
    daysAgo: 12,
    hour: 9.4,
    kind: "cleanup",
    action: "temp",
    title: "Arquivos temporários limpos",
    freedBytes: 2.7 * GB,
    durationMs: 48_000,
  },
  {
    daysAgo: 16,
    hour: 20.1,
    kind: "repair",
    action: "dism-restore",
    title: "Imagem do Windows restaurada (DISM)",
    durationMs: 22 * 60_000,
  },
  {
    daysAgo: 20,
    hour: 11.6,
    kind: "check",
    action: "chkdsk",
    title: "Disco verificado (CHKDSK)",
    durationMs: 6 * 60_000,
  },
  {
    daysAgo: 24,
    hour: 18.9,
    kind: "uninstall",
    action: "uninstall",
    title: "OBS Studio desinstalado",
    subject: "OBS Studio",
    freedBytes: 0.55 * GB,
    estimated: true,
  },
  {
    daysAgo: 33,
    hour: 22.4,
    kind: "repair",
    action: "dism-restore",
    title: "Imagem do Windows restaurada (DISM)",
    ok: false,
    detail: "Erro 0x800f081f: os arquivos de origem não foram encontrados.",
    durationMs: 9 * 60_000,
  },
  {
    daysAgo: 34,
    hour: 9.8,
    kind: "repair",
    action: "sfc",
    title: "Arquivos do sistema verificados e reparados (SFC)",
    durationMs: 17 * 60_000,
  },
  {
    daysAgo: 41,
    hour: 13.3,
    kind: "repair",
    action: "flushdns",
    title: "Cache de DNS limpo",
  },
  {
    daysAgo: 47,
    hour: 17.2,
    kind: "cleanup",
    action: "cleaner",
    title: "Navegadores e apps limpos",
    detail: "Microsoft Edge, Visual Studio Code · 1.870 arquivos",
    freedBytes: 0.9 * GB,
  },
  {
    daysAgo: 55,
    hour: 15.5,
    kind: "uninstall",
    action: "uninstall",
    title: "GIMP 2.10 desinstalado",
    subject: "GIMP 2.10",
    freedBytes: 0.9 * GB,
    estimated: true,
  },
  {
    daysAgo: 62,
    hour: 8.9,
    kind: "repair",
    action: "wu-cache",
    title: "Cache do Windows Update limpo",
  },
  {
    daysAgo: 70,
    hour: 12.2,
    kind: "cleanup",
    action: "temp",
    title: "Arquivos temporários limpos",
    freedBytes: 1.1 * GB,
  },
  {
    daysAgo: 80,
    hour: 19.0,
    kind: "check",
    action: "chkdsk",
    title: "Disco verificado (CHKDSK)",
    durationMs: 5 * 60_000,
  },
  {
    daysAgo: 88,
    hour: 10.6,
    kind: "cleanup",
    action: "cleaner",
    title: "Navegadores e apps limpos",
    detail: "Google Chrome, Steam · 6.034 arquivos",
    freedBytes: 2.2 * GB,
  },
];

function build(now: number) {
  const random = seeded(20261103);
  const today = startOfDay(now);
  const at = (daysAgo: number, hour: number) =>
    Math.min(now - 60_000, today - daysAgo * DAY + Math.round(hour * 3_600_000));

  const events: MaintenanceEvent[] = MANUAL.map(({ daysAgo, hour, ...event }, i) => ({
    id: `demo-${i}`,
    ts: at(daysAgo, hour),
    source: "manual",
    ok: true,
    ...event,
  }));

  // Limpeza agendada todo domingo às 12:00 nas últimas 13 semanas.
  const sunday = startOfWeek(now) - DAY;
  for (let week = 0; week < 13; week++) {
    const ts = sunday - week * 7 * DAY + 12 * 3_600_000;
    if (ts > now) continue;
    const removed = Math.round(2500 + random() * 5000);
    events.push({
      id: `demo-sched-${week}`,
      ts: ts + 41_000,
      kind: "cleanup",
      action: "scheduled-cleanup",
      title: "Limpeza agendada",
      detail: `${removed.toLocaleString("pt-BR")} arquivos removidos, ${Math.round(
        80 + random() * 150,
      )} mantidos (recentes ou em uso).`,
      ok: true,
      source: "scheduled",
      freedBytes: Math.round((0.6 + random() * 1.8) * GB),
      durationMs: Math.round(25_000 + random() * 30_000),
    });
  }

  // Saúde subindo de ~70 para ~86 ao longo de 95 dias, com dias sem o app aberto.
  const health: HealthDay[] = [];
  for (let daysAgo = 95; daysAgo >= 0; daysAgo--) {
    if (daysAgo > 0 && random() < 0.22) continue;
    const trend = 86 - (daysAgo / 95) * 16;
    const avg = Math.max(40, Math.min(98, trend + (random() - 0.5) * 8));
    const spread = 3 + random() * 7;
    health.push({
      day: dayKey(today - daysAgo * DAY + 12 * 3_600_000),
      avg: Math.round(avg * 10) / 10,
      min: Math.round(avg - spread),
      max: Math.min(100, Math.round(avg + spread / 2)),
      n: Math.round(6 + random() * 30),
    });
  }

  return { events: events.sort((a, b) => b.ts - a.ts), health };
}

export function getDemoHistory(now = Date.now()): MaintenanceHistory {
  if (!state) state = build(now);
  return { ok: true, events: [...state.events], health: [...state.health] };
}

/** Uma ação simulada nesta sessão (modo demonstração) entra no histórico. */
export function recordDemoEvent(
  event: Omit<MaintenanceEvent, "id" | "ts" | "source" | "ok"> &
    Partial<Pick<MaintenanceEvent, "source" | "ok">>,
) {
  const now = Date.now();
  if (!state) state = build(now);
  counter += 1;
  state.events = [
    { id: `demo-live-${counter}`, ts: now, source: "manual", ok: true, ...event },
    ...state.events,
  ];
  listeners.forEach((listener) => listener());
}

export function clearDemoHistory() {
  state = { events: [], health: [] };
  listeners.forEach((listener) => listener());
}

export function onDemoHistoryChanged(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ferramentas simuladas que contam como manutenção (mesmos títulos do processo principal). */
const DEMO_TOOLS: Record<
  string,
  Pick<MaintenanceEvent, "kind" | "action" | "title"> & { freedBytes?: number }
> = {
  sfc: {
    kind: "repair",
    action: "sfc",
    title: "Arquivos do sistema verificados e reparados (SFC)",
  },
  "dism-restore": {
    kind: "repair",
    action: "dism-restore",
    title: "Imagem do Windows restaurada (DISM)",
  },
  "dism-scan": {
    kind: "check",
    action: "dism-scan",
    title: "Imagem do Windows verificada (DISM ScanHealth)",
  },
  "dism-check": {
    kind: "check",
    action: "dism-check",
    title: "Verificação rápida da imagem do Windows (DISM)",
  },
  chkdsk: { kind: "check", action: "chkdsk", title: "Disco verificado (CHKDSK)" },
  "chkdsk-fix": {
    kind: "repair",
    action: "chkdsk-fix",
    title: "Correção do disco agendada (CHKDSK)",
  },
  "wu-cache": { kind: "repair", action: "wu-cache", title: "Cache do Windows Update limpo" },
  temp: {
    kind: "cleanup",
    action: "temp",
    title: "Arquivos temporários limpos",
    freedBytes: 2.7 * GB,
  },
  prefetch: { kind: "cleanup", action: "prefetch", title: "Prefetch limpo" },
  "icon-cache": {
    kind: "repair",
    action: "icon-cache",
    title: "Cache de ícones e miniaturas recriado",
  },
  flushdns: { kind: "repair", action: "flushdns", title: "Cache de DNS limpo" },
  "renew-ip": { kind: "repair", action: "renew-ip", title: "Endereço IP renovado" },
  winsock: { kind: "repair", action: "winsock", title: "Winsock redefinido" },
  tcpip: { kind: "repair", action: "tcpip", title: "Protocolo TCP/IP redefinido" },
};

export function recordDemoToolRun(toolId: string, ok: boolean, durationMs: number) {
  const tool = DEMO_TOOLS[toolId];
  if (!tool) return;
  recordDemoEvent({
    ...tool,
    ok,
    freedBytes: ok ? tool.freedBytes : undefined,
    durationMs,
  });
}
