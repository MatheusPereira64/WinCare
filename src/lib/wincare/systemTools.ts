/**
 * Ponte de processos, proteção, extensões de navegador, rede, Bluetooth e
 * painel da bandeja. No navegador (demonstração) devolve dados simulados.
 */
import { getNative } from "./bridge";

export interface ProcessInfo {
  name: string;
  pid: number;
  /** Segundos de CPU acumulados desde que o processo abriu. */
  cpu: number;
  /** % do processador agora (null na primeira leitura). */
  cpuPct: number | null;
  memMb: number;
  hasWindow: boolean;
  canEnd: boolean;
}

export interface SecurityStatus {
  ok: boolean;
  reason?: string;
  at?: number;
  defender: {
    realtime: boolean;
    antivirus: boolean;
    tamper: boolean;
    signatureAgeDays: number;
    quickScanAgeDays: number | null;
  } | null;
  firewall: { id: string; name: string; enabled: boolean }[];
  otherAntivirus: { name: string; enabled: boolean }[];
  uacEnabled: boolean | null;
  smartScreen: string | null;
}

export interface BrowserExtension {
  id: string;
  browser: string;
  profile: string;
  name: string;
  version: string;
  enabled: boolean | null;
  level: "high" | "medium" | "low";
  allSites: boolean;
  reasons: string[];
}

export interface NetworkStatus {
  ok: boolean;
  at: number;
  adapter: {
    connected: boolean;
    kind: "wifi" | "ethernet" | "none";
    name: string | null;
    description: string;
    ssid: string | null;
    ip: string | null;
    linkSpeed: string | null;
  };
  downBps: number | null;
  upBps: number | null;
  totalReceived: number | null;
  totalSent: number | null;
}

export interface SpeedTestResult {
  ok: boolean;
  reason?: string;
  at?: number;
  latencyMs?: number;
  downloadMbps?: number;
  uploadMbps?: number;
  server?: string;
}

export interface BluetoothState {
  ok: boolean;
  available: boolean;
  devices: { name: string; connected: boolean }[];
}

export interface CpuBreakdown {
  ok: boolean;
  userPct?: number;
  systemPct?: number;
  idlePct?: number;
}

interface SystemToolsBridge {
  processes?: () => Promise<{ ok: boolean; items: ProcessInfo[] }>;
  endProcess?: (pid: number) => Promise<{ ok: boolean; reason?: string; name?: string }>;
  securityStatus?: () => Promise<SecurityStatus>;
  browserExtensions?: () => Promise<{ ok: boolean; items: BrowserExtension[] }>;
  networkStatus?: () => Promise<NetworkStatus>;
  speedTest?: () => Promise<SpeedTestResult>;
  bluetooth?: () => Promise<BluetoothState>;
  cpuBreakdown?: () => Promise<CpuBreakdown>;
  panelExpand?: (expanded: boolean) => Promise<{ ok: boolean }>;
  panelClose?: () => Promise<{ ok: boolean }>;
  panelOpenApp?: (to?: string) => Promise<{ ok: boolean }>;
  onPanelVisibility?: (handler: (visible: boolean) => void) => () => void;
}

const native = () => getNative() as (ReturnType<typeof getNative> & SystemToolsBridge) | null;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number, spread: number) =>
  Math.max(0, Math.round((base + (Math.random() - 0.5) * spread) * 10) / 10);

/* ------------------------------ Processos ------------------------------ */

let demoProcesses: ProcessInfo[] = [
  { name: "chrome", pid: 1204, cpu: 812, cpuPct: 6.2, memMb: 1890, hasWindow: true, canEnd: true },
  { name: "Code", pid: 3301, cpu: 402, cpuPct: 3.1, memMb: 1120, hasWindow: true, canEnd: true },
  { name: "Discord", pid: 5520, cpu: 120, cpuPct: 1.4, memMb: 640, hasWindow: true, canEnd: true },
  { name: "Spotify", pid: 6120, cpu: 88, cpuPct: 0.9, memMb: 410, hasWindow: true, canEnd: true },
  { name: "explorer", pid: 980, cpu: 64, cpuPct: 0.6, memMb: 210, hasWindow: true, canEnd: false },
  {
    name: "MsMpEng",
    pid: 2820,
    cpu: 340,
    cpuPct: 0.5,
    memMb: 280,
    hasWindow: false,
    canEnd: false,
  },
  { name: "WinCare", pid: 4412, cpu: 22, cpuPct: 0.4, memMb: 168, hasWindow: true, canEnd: false },
  { name: "OneDrive", pid: 7004, cpu: 30, cpuPct: 0.2, memMb: 150, hasWindow: false, canEnd: true },
];

export async function listProcesses(): Promise<ProcessInfo[]> {
  const bridge = native();
  if (bridge?.processes) return (await bridge.processes()).items ?? [];
  await wait(150);
  return demoProcesses.map((p) => ({
    ...p,
    cpuPct: jitter(p.cpuPct ?? 0, 1.2),
    memMb: Math.round(p.memMb * (0.97 + Math.random() * 0.06)),
  }));
}

export async function endProcess(pid: number) {
  const bridge = native();
  if (bridge?.endProcess) return bridge.endProcess(pid);
  const target = demoProcesses.find((p) => p.pid === pid);
  demoProcesses = demoProcesses.filter((p) => p.pid !== pid);
  return { ok: true, name: target?.name };
}

/* ------------------------------ Proteção ------------------------------ */

export async function securityStatus(): Promise<SecurityStatus> {
  const bridge = native();
  if (bridge?.securityStatus) return bridge.securityStatus();
  await wait(500);
  return {
    ok: true,
    at: Date.now(),
    defender: {
      realtime: true,
      antivirus: true,
      tamper: true,
      signatureAgeDays: 0,
      quickScanAgeDays: 2,
    },
    firewall: [
      { id: "domain", name: "Rede de domínio", enabled: true },
      { id: "private", name: "Rede privada", enabled: true },
      { id: "public", name: "Rede pública", enabled: true },
    ],
    otherAntivirus: [],
    uacEnabled: true,
    smartScreen: "Warn",
  };
}

export async function browserExtensions(): Promise<BrowserExtension[]> {
  const bridge = native();
  if (bridge?.browserExtensions) return (await bridge.browserExtensions()).items ?? [];
  await wait(300);
  return [
    {
      id: "chrome:Default:a",
      browser: "Google Chrome",
      profile: "Padrão",
      name: "Cupom Fácil — descontos automáticos",
      version: "4.2.1",
      enabled: true,
      level: "high",
      allSites: true,
      reasons: [
        "ler e alterar dados em todos os sites",
        "ler e alterar cookies (sessões logadas)",
        "ver as abas e endereços abertos",
      ],
    },
    {
      id: "edge:Default:b",
      browser: "Microsoft Edge",
      profile: "Padrão",
      name: "Tradutor de páginas",
      version: "2.0.3",
      enabled: true,
      level: "medium",
      allSites: true,
      reasons: ["ler e alterar dados em todos os sites"],
    },
    {
      id: "chrome:Default:c",
      browser: "Google Chrome",
      profile: "Padrão",
      name: "uBlock Origin",
      version: "1.58.0",
      enabled: true,
      level: "medium",
      allSites: true,
      reasons: ["ler e alterar dados em todos os sites"],
    },
    {
      id: "chrome:Default:d",
      browser: "Google Chrome",
      profile: "Padrão",
      name: "Google Docs Offline",
      version: "1.79.1",
      enabled: true,
      level: "low",
      allSites: false,
      reasons: [],
    },
  ];
}

/* ------------------------------ Rede ------------------------------ */

let demoTotals = { received: 3.8 * 1024 ** 3, sent: 2.7 * 1024 ** 3 };

export async function networkStatus(): Promise<NetworkStatus> {
  const bridge = native();
  if (bridge?.networkStatus) return bridge.networkStatus();
  const down = jitter(1.8e6, 2.4e6);
  const up = jitter(0.25e6, 0.3e6);
  demoTotals = { received: demoTotals.received + down * 2, sent: demoTotals.sent + up * 2 };
  return {
    ok: true,
    at: Date.now(),
    adapter: {
      connected: true,
      kind: "ethernet",
      name: "Ethernet",
      description: "Realtek PCIe 2.5GbE Family Controller",
      ssid: null,
      ip: "192.168.0.130",
      linkSpeed: "1 Gbps",
    },
    downBps: down,
    upBps: up,
    totalReceived: demoTotals.received,
    totalSent: demoTotals.sent,
  };
}

export async function speedTest(): Promise<SpeedTestResult> {
  const bridge = native();
  if (bridge?.speedTest) return bridge.speedTest();
  await wait(2500);
  return {
    ok: true,
    at: Date.now(),
    latencyMs: 18,
    downloadMbps: 411,
    uploadMbps: 49,
    server: "Cloudflare",
  };
}

export async function bluetoothState(): Promise<BluetoothState> {
  const bridge = native();
  if (bridge?.bluetooth) return bridge.bluetooth();
  await wait(200);
  return {
    ok: true,
    available: true,
    devices: [
      { name: "Fone WH-1000XM4", connected: true },
      { name: "Mouse MX Master 3", connected: true },
      { name: "Caixa JBL Flip 5", connected: false },
    ],
  };
}

export async function cpuBreakdown(): Promise<CpuBreakdown> {
  const bridge = native();
  if (bridge?.cpuBreakdown) return bridge.cpuBreakdown();
  const user = Math.round(jitter(9, 8));
  const system = Math.round(jitter(5, 4));
  return { ok: true, userPct: user, systemPct: system, idlePct: Math.max(0, 100 - user - system) };
}

/* ------------------------------ Painel da bandeja ------------------------------ */

export const panelExpand = (expanded: boolean) => native()?.panelExpand?.(expanded);

/** Abre a janela principal na página pedida (no navegador, só navega). */
export function panelOpenApp(to?: string) {
  const bridge = native();
  if (bridge?.panelOpenApp) return bridge.panelOpenApp(to);
  window.location.hash = to || "/";
  return Promise.resolve({ ok: true });
}

export const onPanelVisibility = (handler: (visible: boolean) => void) =>
  native()?.onPanelVisibility?.(handler) ?? (() => undefined);
