import type {
  CleanerItem,
  CleanerResult,
  DiskDrive,
  DiskUsageFolder,
  InstalledProgram,
  LeftoverItem,
  LeftoverRemoval,
  LeftoverScan,
  RestorePointResult,
  ScheduleConfig,
  ScheduleEntry,
  ScheduleHistoryEntry,
  ScheduleJob,
  ScheduleOverview,
  StartupItem,
  SystemInfo,
  Tool,
  TopProcess,
  UninstallResult,
} from "./types";

/**
 * Bridge to the native layer.
 *
 * When WinCare runs inside its Windows desktop shell (Electron), the preload
 * script exposes `window.wincare`. Commands that require admin trigger UAC
 * automatically when the app is not already elevated.
 */
export interface RunOptions {
  /** Solicita elevação via UAC para este comando (Windows). */
  elevated?: boolean;
  /** Encerra o processo após este tempo (ms) no modo nativo. */
  timeoutMs?: number;
}

export interface RunResult {
  code: number;
  result: string;
  output?: string;
}

export interface UpdateProgress {
  phase: "check" | "download" | "extract" | "apply";
  percent: number;
  received?: number;
  total?: number;
}

export interface UpdateInfo {
  ok: boolean;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseName?: string;
  releaseNotes?: string;
  htmlUrl?: string;
  downloadUrl?: string | null;
  assetName?: string | null;
  assetSize?: number | null;
  canAutoUpdate?: boolean;
  packaged?: boolean;
  reason?: string;
  message?: string;
}

export interface ApplyUpdateResult {
  ok: boolean;
  reason?: string;
  message?: string;
  info?: UpdateInfo;
  logFile?: string;
}

export interface PowerPlanInfo {
  guid: string;
  name: string;
  active: boolean;
}

export interface MemoryOptimizeResult {
  ok: boolean;
  reason?: string;
  message?: string;
  freedMb?: number;
  trimmed?: number;
  skipped?: number;
  standbyPurged?: boolean;
  before?: { totalMb: number; usedMb: number; freeMb: number; usagePct: number };
  after?: { totalMb: number; usedMb: number; freeMb: number; usagePct: number };
}

export interface StorageIntelResult {
  at: number;
  visited: number;
  largeFiles: { path: string; name: string; sizeBytes: number }[];
  duplicates: { name: string; sizeBytes: number; paths: string[] }[];
}

export interface NativeBridge {
  run: (
    command: string,
    onData: (chunk: string) => void,
    options?: RunOptions,
  ) => Promise<RunResult>;
  getAppVersion?: () => Promise<string>;
  checkForUpdate?: () => Promise<UpdateInfo>;
  applyUpdate?: () => Promise<ApplyUpdateResult>;
  openReleasePage?: () => Promise<{ ok: boolean; message?: string; info?: UpdateInfo }>;
  onUpdateProgress?: (handler: (progress: UpdateProgress) => void) => () => void;
  onUpdateAvailable?: (handler: (info: UpdateInfo) => void) => () => void;
  systemInfo: () => Promise<SystemInfo>;
  disks: () => Promise<DiskDrive[]>;
  listStartup: () => Promise<StartupItem[]>;
  setStartupEnabled: (id: string, enabled: boolean) => Promise<{ ok: boolean; reason?: string }>;
  topProcesses?: () => Promise<TopProcess[]>;
  diskUsage: () => Promise<DiskUsageFolder[]>;
  clearDiskFolder: (id: string) => Promise<{ ok: boolean; reason?: string; freedBytes?: number }>;
  storageIntel?: () => Promise<StorageIntelResult>;
  optimizeMemory?: () => Promise<MemoryOptimizeResult>;
  powerPlan?: (payload?: {
    action?: "list" | "set";
    profile?: "balanced" | "gaming" | "work" | "battery";
  }) => Promise<{
    ok: boolean;
    reason?: string;
    plans: PowerPlanInfo[];
    active: PowerPlanInfo | null;
  }>;
  saveTextFile?: (
    content: string,
    defaultName?: string,
  ) => Promise<{ ok: boolean; path?: string; reason?: string }>;
  isElevated: () => Promise<boolean>;
  restartAsAdmin: () => Promise<{ ok: boolean; reason?: string }>;
  clearStorage?: () => Promise<{ ok: boolean }>;
  setNativeTheme?: (theme: "dark" | "light") => Promise<void>;
  cleanerScan?: () => Promise<{ ok: boolean; reason?: string; items: CleanerItem[] }>;
  cleanerClean?: (ids: string[]) => Promise<CleanerResult>;
  listPrograms?: () => Promise<{ ok: boolean; reason?: string; items: InstalledProgram[] }>;
  uninstallProgram?: (id: string) => Promise<UninstallResult>;
  scanLeftovers?: (id: string) => Promise<LeftoverScan>;
  removeLeftovers?: (ids: string[]) => Promise<LeftoverRemoval>;
  createRestorePoint?: (description: string) => Promise<RestorePointResult>;
  listSchedules?: () => Promise<ScheduleOverview>;
  setSchedule?: (
    job: ScheduleJob,
    config: ScheduleConfig,
  ) => Promise<{ ok: boolean; reason?: string }>;
  removeSchedule?: (job: ScheduleJob) => Promise<{ ok: boolean; reason?: string }>;
  runScheduleNow?: (job: ScheduleJob) => Promise<{ ok: boolean; reason?: string }>;
}

export function getNative(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { wincare?: NativeBridge }).wincare ?? null;
}

export const isNative = () => getNative() !== null;

const SIM_OUTPUT: Record<string, string[]> = {
  "restore-point": ["Criando ponto de restauração...", "Ponto de restauração criado."],
  sfc: [
    "Início da verificação do sistema.",
    "Verificação da fase 1 de 3 concluída.",
    "Verificação da fase 2 de 3 concluída.",
    "Verificação da fase 3 de 3 concluída.",
    "A Proteção de Recursos do Windows não encontrou nenhuma violação de integridade.",
  ],
  "dism-check": [
    "Ferramenta de Gerenciamento e Manutenção de Imagens de Implantação",
    "Versão: 10.0.26100.1",
    "Versão da Imagem: 10.0.26100.2894",
    "Nenhuma corrupção de componente detectada.",
    "A operação foi concluída com êxito.",
  ],
  "dism-scan": [
    "Verificando integridade dos componentes...",
    "[==========                20.0% ]",
    "[====================      55.0% ]",
    "[==========================100.0%]",
    "Nenhuma corrupção de repositório de componentes detectada.",
    "A operação foi concluída com êxito.",
  ],
  "dism-restore": [
    "Iniciando restauração da imagem...",
    "Baixando arquivos de origem do Windows Update...",
    "[==============            48.0% ]",
    "[==========================100.0%]",
    "A operação de restauração foi concluída com êxito.",
  ],
  chkdsk: [
    "O tipo do sistema de arquivos é NTFS.",
    "Estágio 1: examinando a estrutura básica do sistema de arquivos...",
    "Estágio 2: examinando a vinculação de nomes de arquivo...",
    "Estágio 3: examinando descritores de segurança...",
    "O Windows verificou o sistema de arquivos e não encontrou problemas.",
  ],
  "chkdsk-fix": [
    "Não é possível bloquear a unidade atual.",
    "Deseja agendar a verificação na próxima reinicialização? (S/N) S",
    "Esta unidade será verificada na próxima vez que o sistema for reiniciado.",
  ],
  "wu-cache": [
    "Parando o serviço wuauserv...",
    "Parando o serviço bits...",
    "Removendo SoftwareDistribution (1,8 GB liberados)...",
    "Removendo catroot2...",
    "Iniciando serviços novamente...",
    "Cache do Windows Update limpo com êxito.",
  ],
  temp: [
    "Removendo C:\\Users\\Usuario\\AppData\\Local\\Temp\\...",
    "1.842 arquivos removidos",
    "Removendo C:\\Windows\\Temp\\...",
    "612 arquivos removidos",
    "2,7 GB liberados no disco.",
  ],
  prefetch: ["Removendo C:\\Windows\\Prefetch\\...", "318 arquivos removidos (142 MB)."],
  "icon-cache": [
    "Encerrando explorer.exe...",
    "Removendo bancos de cache de ícones e miniaturas...",
    "Reiniciando explorer.exe...",
    "Cache recriado com êxito.",
  ],
  smart: [
    "Model                          Status  Size",
    "Samsung SSD 980 PRO 1TB        OK      1000204886016",
    "Seagate BarraCuda 2TB          OK      2000398934016",
  ],
  "disk-space": [
    "Caption  FreeSpace      Size",
    "C:       142857483264   511101108224",
    "D:       1204857483264  2000398934016",
  ],
  "shutdown-1": ["Desligamento agendado para daqui a 60 segundos."],
  "shutdown-5": ["Desligamento agendado para daqui a 5 minutos."],
  "shutdown-15": ["Desligamento agendado para daqui a 15 minutos."],
  "shutdown-60": ["Desligamento agendado para daqui a 1 hora."],
  "shutdown-abort": ["O desligamento foi cancelado."],
  "ping-google": [
    "Disparando ping para 8.8.8.8 com 32 bytes de dados:",
    "Resposta de 8.8.8.8: bytes=32 tempo=14ms TTL=117",
    "Resposta de 8.8.8.8: bytes=32 tempo=13ms TTL=117",
    "Resposta de 8.8.8.8: bytes=32 tempo=12ms TTL=117",
    "Resposta de 8.8.8.8: bytes=32 tempo=13ms TTL=117",
    "Estatísticas: Enviados = 4, Recebidos = 4, Perdidos = 0 (0% perda)",
  ],
  "ping-cloudflare": [
    "Disparando ping para 1.1.1.1 com 32 bytes de dados:",
    "Resposta de 1.1.1.1: bytes=32 tempo=9ms TTL=58",
    "Resposta de 1.1.1.1: bytes=32 tempo=8ms TTL=58",
    "Resposta de 1.1.1.1: bytes=32 tempo=9ms TTL=58",
    "Resposta de 1.1.1.1: bytes=32 tempo=8ms TTL=58",
    "Estatísticas: Enviados = 4, Recebidos = 4, Perdidos = 0 (0% perda)",
  ],
  "dns-google": [
    "Servidor:  dns.google",
    "Address:  8.8.8.8",
    "",
    "Nome:    google.com",
    "Address:  142.250.190.14",
  ],
  "dns-cloudflare": [
    "Servidor:  one.one.one.one",
    "Address:  1.1.1.1",
    "",
    "Nome:    cloudflare.com",
    "Address:  104.16.132.229",
  ],
  "tracert-google": [
    "Rastreando a rota para google.com [142.250.190.14]",
    "com no máximo 12 saltos:",
    "",
    "  1    <1 ms    <1 ms    <1 ms  192.168.0.1",
    "  2     8 ms     7 ms     8 ms  10.20.0.1",
    "  3    12 ms    11 ms    12 ms  142.250.190.14",
    "Rastreamento concluído.",
  ],
  "ipconfig-all": [
    "Adaptador Ethernet Ethernet:",
    "   Endereço IPv4. . . . . . . .  . . . . . . . : 192.168.0.42",
    "   Máscara de Sub-rede . . . . . . . . . . . . : 255.255.255.0",
    "   Gateway Padrão. . . . . . . . . . . . . . . : 192.168.0.1",
    "   Servidores DNS. . . . . . . . . . . . . . . : 1.1.1.1",
  ],
  flushdns: ["Configuração de IP do Windows", "Liberado com êxito o Cache de Resolução de DNS."],
  "renew-ip": [
    "Adaptador Ethernet Ethernet:",
    "   Liberação do IP...",
    "   Renovação do IP...",
    "   Endereço IPv4. . . . . . . . : 192.168.0.55",
  ],
  winsock: ["Reinicialização do Catálogo Winsock concluída com êxito.", "Reinicie o computador."],
  tcpip: ["Reinicialização do protocolo da Internet IPv4.", "Reinicie o computador para concluir."],
  speedtest: ["Download: 94.2 Mbps em 0.1s"],
  "wifi-profiles": [
    "Perfis de usuário",
    "---------------------------------",
    "    Todos os Perfis de Usuário : Casa",
    "    Todos os Perfis de Usuário : Trabalho",
  ],
  "wifi-interfaces": [
    "Há 1 interface no sistema:",
    "",
    "    Nome                   : Wi-Fi",
    "    Estado                 : conectado",
    "    SSID                   : Casa",
    "    Sinal                  : 88%",
  ],
};

const SIM_RESULT: Record<string, string> = {
  sfc: "Nenhuma violação de integridade encontrada.",
  "restore-point": "Ponto de restauração criado.",
  "dism-check": "Imagem íntegra.",
  "dism-scan": "Nenhuma corrupção detectada.",
  "dism-restore": "Imagem restaurada com êxito.",
  chkdsk: "Sistema de arquivos sem problemas.",
  "chkdsk-fix": "Verificação agendada para a próxima reinicialização.",
  "wu-cache": "Cache do Windows Update limpo (1,8 GB).",
  temp: "2,7 GB liberados.",
  prefetch: "142 MB liberados.",
  "icon-cache": "Cache de ícones recriado.",
  smart: "Todos os discos com status OK.",
  "disk-space": "2 unidades analisadas.",
  "shutdown-1": "Desligamento agendado (1 min).",
  "shutdown-5": "Desligamento agendado (5 min).",
  "shutdown-15": "Desligamento agendado (15 min).",
  "shutdown-60": "Desligamento agendado (1 h).",
  "shutdown-abort": "Desligamento cancelado.",
  "ping-google": "4 respostas, 0% perda (~13 ms).",
  "ping-cloudflare": "4 respostas, 0% perda (~8 ms).",
  "dns-google": "google.com → 142.250.190.14",
  "dns-cloudflare": "cloudflare.com → 104.16.132.229",
  "tracert-google": "Rota até google.com (3 saltos).",
  "ipconfig-all": "Configuração de adaptores listada.",
  flushdns: "Cache DNS liberado.",
  "renew-ip": "IP renovado com êxito.",
  winsock: "Winsock reiniciado — reinicie o PC.",
  tcpip: "TCP/IP reiniciado — reinicie o PC.",
  speedtest: "Download ≈ 94 Mbps.",
  "wifi-profiles": "2 perfis Wi‑Fi listados.",
  "wifi-interfaces": "Wi‑Fi conectado (88%).",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function simulateRun(
  tool: Tool,
  onData: (chunk: string) => void,
): Promise<{ code: number; result: string }> {
  if (tool.launcher) {
    await sleep(700);
    onData(`Abrindo ${tool.name} (${tool.command})...`);
    await sleep(500);
    onData("Ferramenta nativa aberta em uma nova janela.");
    return { code: 0, result: `${tool.name} aberto.` };
  }

  const lines = SIM_OUTPUT[tool.id] ?? ["Executando...", "Concluído."];
  const step = Math.max(400, (tool.estimate ?? 6000) / lines.length);
  for (const line of lines) {
    await sleep(step);
    onData(line);
  }
  return { code: 0, result: SIM_RESULT[tool.id] ?? "Comando concluído com êxito." };
}

export const SIMULATED_SYSTEM: SystemInfo = {
  hostname: "DESKTOP-WINCARE",
  osName: "Windows 11 Pro 24H2",
  build: "26100.2894",
  cpuUsage: 23,
  memoryUsage: 46,
  memoryTotalGb: 32,
  memoryUsedGb: 14.7,
  diskUsage: 72,
  diskTotalGb: 476,
  uptime: "2 dias, 06:14",
  defenderStatus: "Ativo e atualizado",
  lastUpdate: "24/07/2026",
  health: 87,
  simulated: true,
  cpuTemperature: 48,
  memoryTemperature: null,
  gpuName: "NVIDIA GeForce RTX 4060",
  gpuUsage: 18,
  gpuTemperature: 52,
  gpuMemoryUsedMb: 2048,
  gpuMemoryTotalMb: 8192,
  gpuMemoryUsage: 25,
};

export const SIMULATED_DISKS: DiskDrive[] = [
  {
    letter: "C:",
    model: "Samsung SSD 980 PRO 1TB",
    type: "SSD",
    smart: "OK",
    freeGb: 133,
    totalGb: 476,
    temperature: 42,
  },
  {
    letter: "D:",
    model: "Seagate BarraCuda 2TB",
    type: "HDD",
    smart: "OK",
    freeGb: 1122,
    totalGb: 1863,
    temperature: 38,
  },
];

export const SIMULATED_STARTUP: StartupItem[] = [
  {
    id: "hkcu-run:OneDrive",
    name: "OneDrive",
    command: '"C:\\Users\\Usuario\\AppData\\Local\\Microsoft\\OneDrive\\OneDrive.exe" /background',
    location: "hkcu-run",
    enabled: true,
    processName: "OneDrive",
    running: true,
    memMb: 92,
    processCount: 2,
  },
  {
    id: "hkcu-run:Discord",
    name: "Discord",
    command: '"C:\\Users\\Usuario\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe',
    location: "hkcu-run",
    enabled: true,
    processName: "Discord",
    running: true,
    memMb: 268,
    processCount: 4,
  },
  {
    id: "hkcu-run:Steam",
    name: "Steam",
    command: '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent',
    location: "hkcu-run",
    enabled: true,
    processName: "steam",
    running: true,
    memMb: 186,
    processCount: 3,
  },
  {
    id: "hkcu-run:Spotify",
    name: "Spotify",
    command: '"C:\\Users\\Usuario\\AppData\\Roaming\\Spotify\\Spotify.exe" --autostart',
    location: "hkcu-run",
    enabled: true,
    processName: "Spotify",
    running: true,
    memMb: 154,
    processCount: 2,
  },
  {
    id: "hklm-run:SecurityHealth",
    name: "SecurityHealth",
    command: "%windir%\\system32\\SecurityHealthSystray.exe",
    location: "hklm-run",
    enabled: true,
    requiresAdmin: true,
    processName: "SecurityHealthSystray",
    running: true,
    memMb: 18,
    processCount: 1,
  },
];

export const SIMULATED_DISK_USAGE: DiskUsageFolder[] = [
  {
    id: "temp-user",
    label: "Temporários do usuário",
    path: "C:\\Users\\Usuario\\AppData\\Local\\Temp",
    sizeBytes: 2_450_000_000,
    clearable: true,
    hint: "%TEMP%",
  },
  {
    id: "temp-win",
    label: "Temp do Windows",
    path: "C:\\Windows\\Temp",
    sizeBytes: 820_000_000,
    clearable: true,
  },
  {
    id: "downloads",
    label: "Downloads",
    path: "C:\\Users\\Usuario\\Downloads",
    sizeBytes: 6_100_000_000,
    clearable: false,
    hint: "Revise manualmente antes de apagar",
  },
  {
    id: "recycle",
    label: "Lixeira",
    path: "RecycleBin",
    sizeBytes: 1_200_000_000,
    clearable: true,
  },
  {
    id: "inet-cache",
    label: "Cache do Internet Explorer/Edge legado",
    path: "C:\\Users\\Usuario\\AppData\\Local\\Microsoft\\Windows\\INetCache",
    sizeBytes: 340_000_000,
    clearable: true,
  },
];

const SIMULATED_CLEANER: CleanerItem[] = [
  {
    id: "chrome|Pessoal|cache",
    appId: "chrome",
    appName: "Google Chrome",
    appKind: "browser",
    profile: "Pessoal",
    category: "cache",
    sizeBytes: 1_480_000_000,
    fileCount: 18_240,
    running: false,
    samples: [
      {
        path: "C:\\Users\\Usuario\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache\\Cache_Data\\f_0041a7",
        sizeBytes: 48_300_000,
      },
      {
        path: "C:\\Users\\Usuario\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Code Cache\\js\\7ac41e0",
        sizeBytes: 12_100_000,
      },
      {
        path: "C:\\Users\\Usuario\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\GPUCache\\data_1",
        sizeBytes: 4_200_000,
      },
    ],
  },
  {
    id: "chrome|Pessoal|cookies",
    appId: "chrome",
    appName: "Google Chrome",
    appKind: "browser",
    profile: "Pessoal",
    category: "cookies",
    sizeBytes: 2_100_000,
    fileCount: 2,
    running: false,
    samples: [
      {
        path: "C:\\Users\\Usuario\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Network\\Cookies",
        sizeBytes: 2_080_000,
      },
    ],
  },
  {
    id: "chrome|Pessoal|history",
    appId: "chrome",
    appName: "Google Chrome",
    appKind: "browser",
    profile: "Pessoal",
    category: "history",
    sizeBytes: 86_000_000,
    fileCount: 3,
    running: false,
    samples: [
      {
        path: "C:\\Users\\Usuario\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\History",
        sizeBytes: 81_000_000,
      },
    ],
  },
  {
    id: "edge|Default|cache",
    appId: "edge",
    appName: "Microsoft Edge",
    appKind: "browser",
    profile: "Default",
    category: "cache",
    sizeBytes: 640_000_000,
    fileCount: 7_120,
    running: true,
    samples: [
      {
        path: "C:\\Users\\Usuario\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache\\Cache_Data\\f_00a1b2",
        sizeBytes: 21_000_000,
      },
    ],
  },
  {
    id: "edge|Default|cookies",
    appId: "edge",
    appName: "Microsoft Edge",
    appKind: "browser",
    profile: "Default",
    category: "cookies",
    sizeBytes: 1_400_000,
    fileCount: 2,
    running: true,
    samples: [],
  },
  {
    id: "firefox|default-release|cache",
    appId: "firefox",
    appName: "Mozilla Firefox",
    appKind: "browser",
    profile: "default-release",
    category: "cache",
    sizeBytes: 512_000_000,
    fileCount: 4_880,
    running: false,
    samples: [
      {
        path: "C:\\Users\\Usuario\\AppData\\Local\\Mozilla\\Firefox\\Profiles\\abc.default-release\\cache2\\entries\\0A1F",
        sizeBytes: 9_400_000,
      },
    ],
  },
  {
    id: "discord||cache",
    appId: "discord",
    appName: "Discord",
    appKind: "app",
    profile: "",
    category: "cache",
    sizeBytes: 730_000_000,
    fileCount: 3_210,
    running: false,
    samples: [
      {
        path: "C:\\Users\\Usuario\\AppData\\Roaming\\discord\\Cache\\Cache_Data\\f_00c931",
        sizeBytes: 16_000_000,
      },
    ],
  },
  {
    id: "vscode||cache",
    appId: "vscode",
    appName: "Visual Studio Code",
    appKind: "app",
    profile: "",
    category: "cache",
    sizeBytes: 305_000_000,
    fileCount: 1_140,
    running: false,
    samples: [
      {
        path: "C:\\Users\\Usuario\\AppData\\Roaming\\Code\\CachedData\\abc123\\workbench.js",
        sizeBytes: 7_800_000,
      },
    ],
  },
];

const demoProgram = (
  id: string,
  name: string,
  publisher: string,
  version: string,
  gb: number,
  installDate: string,
  extra: Partial<InstalledProgram> = {},
): InstalledProgram => ({
  id,
  name,
  publisher,
  version,
  installDate,
  sizeBytes: gb * 1024 ** 3,
  installLocation: `C:\\Program Files\\${name}`,
  scope: "machine",
  critical: false,
  icon: null,
  ...extra,
});

const SIMULATED_PROGRAMS: InstalledProgram[] = [
  demoProgram("p1", "7-Zip 24.09 (x64)", "Igor Pavlov", "24.09", 0.005, "2026-02-11"),
  demoProgram("p2", "Adobe Acrobat Reader", "Adobe", "24.5", 1.1, "2026-05-02"),
  demoProgram("p3", "Blender", "Blender Foundation", "4.2", 1.6, "2026-09-18"),
  demoProgram("p4", "Discord", "Discord Inc.", "1.0.9", 0.4, "2026-10-21", { scope: "user" }),
  demoProgram("p5", "Google Chrome", "Google LLC", "130.0", 0.65, "2026-10-29"),
  demoProgram("p6", "GIMP 2.10", "The GIMP Team", "2.10.38", 0.9, "2026-03-27"),
  demoProgram(
    "p7",
    "Microsoft Visual C++ 2015-2022 Redistributable (x64)",
    "Microsoft Corporation",
    "14.40",
    0.02,
    "2026-01-14",
    { critical: true },
  ),
  demoProgram("p8", "Mozilla Firefox (x64 pt-BR)", "Mozilla", "131.0", 0.26, "2026-10-12"),
  demoProgram("p9", "Notepad++ (64-bit x64)", "Notepad++ Team", "8.6.9", 0.015, "2026-07-30"),
  demoProgram("p10", "OBS Studio", "OBS Project", "30.2", 0.55, "2026-08-14"),
  demoProgram("p11", "Spotify", "Spotify AB", "1.2.45", 0.42, "2026-10-25", { scope: "user" }),
  demoProgram("p12", "Steam", "Valve Corporation", "2.10", 2.8, "2025-12-03"),
  demoProgram("p13", "VLC media player", "VideoLAN", "3.0.21", 0.17, "2026-06-05"),
  demoProgram("p14", "Visual Studio Code", "Microsoft Corporation", "1.94", 0.48, "2026-10-03", {
    scope: "user",
  }),
];

const SIMULATED_LEFTOVERS: LeftoverItem[] = [
  {
    id: "lo-1",
    kind: "folder",
    path: "C:\\Users\\Usuario\\AppData\\Roaming\\Programa",
    reason: "Pasta com o nome do programa",
    sizeBytes: 214_000_000,
    fileCount: 412,
    requiresAdmin: false,
  },
  {
    id: "lo-2",
    kind: "folder",
    path: "C:\\Program Files\\Programa",
    reason: "Pasta de instalação informada pelo programa",
    sizeBytes: 38_000_000,
    fileCount: 57,
    requiresAdmin: true,
  },
  {
    id: "lo-3",
    kind: "registry",
    path: "HKCU\\Software\\Programa",
    reason: "Configurações do programa",
    sizeBytes: 0,
    fileCount: 0,
    requiresAdmin: false,
  },
];

let simulatedSchedules: ScheduleEntry[] = [
  {
    job: "cleanup",
    enabled: true,
    config: { frequency: "weekly", weekDay: 0, monthDay: 1, time: "12:00" },
    requiresAdmin: false,
    nextRun: "2026-11-08T12:00:00",
    lastRun: "2026-11-01T12:00:00",
    stale: false,
  },
  {
    job: "full-check",
    enabled: false,
    config: { frequency: "monthly", weekDay: 0, monthDay: 1, time: "20:00" },
    requiresAdmin: true,
    nextRun: null,
    lastRun: null,
    stale: false,
  },
];

const SIMULATED_SCHEDULE_HISTORY: ScheduleHistoryEntry[] = [
  {
    id: "h1",
    job: "cleanup",
    label: "Limpeza agendada",
    startedAt: "2026-11-01T12:00:04",
    finishedAt: "2026-11-01T12:00:41",
    ok: true,
    summary: "6.214 arquivos removidos, 183 mantidos (recentes ou em uso).",
    freedBytes: 2_140_000_000,
    steps: [{ name: "Temporários e caches", ok: true }],
  },
  {
    id: "h2",
    job: "cleanup",
    label: "Limpeza agendada",
    startedAt: "2026-10-25T12:00:02",
    finishedAt: "2026-10-25T12:00:29",
    ok: true,
    summary: "4.871 arquivos removidos, 96 mantidos (recentes ou em uso).",
    freedBytes: 1_320_000_000,
    steps: [{ name: "Temporários e caches", ok: true }],
  },
];

/* Operações abaixo: nativo quando há bridge, simulado (sem efeito real) no navegador. */

export async function createRestorePoint(description: string): Promise<RestorePointResult> {
  const native = getNative();
  if (native?.createRestorePoint) return native.createRestorePoint(description);
  await sleep(1400);
  return { ok: true, status: "created", message: "Ponto de restauração criado (demonstração)." };
}

export async function scanCleaner(): Promise<{
  ok: boolean;
  reason?: string;
  items: CleanerItem[];
}> {
  const native = getNative();
  if (native?.cleanerScan) return native.cleanerScan();
  await sleep(900);
  return { ok: true, items: SIMULATED_CLEANER };
}

export async function cleanCleaner(ids: string[]): Promise<CleanerResult> {
  const native = getNative();
  if (native?.cleanerClean) return native.cleanerClean(ids);
  await sleep(1100);
  const items = SIMULATED_CLEANER.filter((i) => ids.includes(i.id));
  return {
    ok: true,
    freedBytes: items.reduce((sum, i) => sum + i.sizeBytes, 0),
    removed: items.reduce((sum, i) => sum + i.fileCount, 0),
    skipped: 0,
    blocked: [],
  };
}

export async function listPrograms(): Promise<{
  ok: boolean;
  reason?: string;
  items: InstalledProgram[];
}> {
  const native = getNative();
  if (native?.listPrograms) return native.listPrograms();
  await sleep(600);
  return { ok: true, items: SIMULATED_PROGRAMS };
}

export async function uninstallProgram(id: string): Promise<UninstallResult> {
  const native = getNative();
  if (native?.uninstallProgram) return native.uninstallProgram(id);
  await sleep(1800);
  return { ok: true, exitCode: 0, stillInstalled: false };
}

export async function scanLeftovers(id: string): Promise<LeftoverScan> {
  const native = getNative();
  if (native?.scanLeftovers) return native.scanLeftovers(id);
  await sleep(900);
  return { ok: true, items: SIMULATED_LEFTOVERS };
}

export async function removeLeftovers(ids: string[]): Promise<LeftoverRemoval> {
  const native = getNative();
  if (native?.removeLeftovers) return native.removeLeftovers(ids);
  await sleep(900);
  const items = SIMULATED_LEFTOVERS.filter((i) => ids.includes(i.id));
  return {
    ok: true,
    removed: items.length,
    freedBytes: items.reduce((sum, i) => sum + i.sizeBytes, 0),
    failed: [],
    backupDir: null,
  };
}

export async function listSchedules(): Promise<ScheduleOverview> {
  const native = getNative();
  if (native?.listSchedules) return native.listSchedules();
  return { ok: true, items: simulatedSchedules, history: SIMULATED_SCHEDULE_HISTORY };
}

export async function saveSchedule(
  job: ScheduleJob,
  config: ScheduleConfig,
): Promise<{ ok: boolean; reason?: string }> {
  const native = getNative();
  if (native?.setSchedule) return native.setSchedule(job, config);
  await sleep(500);
  simulatedSchedules = simulatedSchedules.map((s) =>
    s.job === job
      ? { ...s, enabled: true, config, nextRun: new Date(Date.now() + 86_400_000).toISOString() }
      : s,
  );
  return { ok: true };
}

export async function removeSchedule(job: ScheduleJob): Promise<{ ok: boolean; reason?: string }> {
  const native = getNative();
  if (native?.removeSchedule) return native.removeSchedule(job);
  await sleep(300);
  simulatedSchedules = simulatedSchedules.map((s) =>
    s.job === job ? { ...s, enabled: false, nextRun: null } : s,
  );
  return { ok: true };
}

export async function runScheduleNow(job: ScheduleJob): Promise<{ ok: boolean; reason?: string }> {
  const native = getNative();
  if (native?.runScheduleNow) return native.runScheduleNow(job);
  await sleep(300);
  return { ok: true };
}

export async function openWindowsTarget(command: string): Promise<void> {
  const native = getNative();
  if (native) await native.run(command, () => {});
}
