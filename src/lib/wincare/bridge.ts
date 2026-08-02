import type { DiskDrive, SystemInfo, Tool } from "./types";

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
  isElevated: () => Promise<boolean>;
  restartAsAdmin: () => Promise<{ ok: boolean; reason?: string }>;
  clearStorage?: () => Promise<{ ok: boolean }>;
}

export function getNative(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { wincare?: NativeBridge }).wincare ?? null;
}

export const isNative = () => getNative() !== null;

const SIM_OUTPUT: Record<string, string[]> = {
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
  shutdown: [
    "Uma conta de usuário está usando este computador.",
    "O sistema será desligado em breve.",
    "Desligamento agendado com êxito.",
  ],
  "shutdown-abort": [
    "O desligamento foi cancelado.",
  ],
};

const SIM_RESULT: Record<string, string> = {
  sfc: "Nenhuma violação de integridade encontrada.",
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
  shutdown: "Desligamento agendado.",
  "shutdown-abort": "Desligamento cancelado.",
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
  diskUsage: 72,
  diskTotalGb: 476,
  uptime: "2 dias, 06:14",
  defenderStatus: "Ativo e atualizado",
  lastUpdate: "24/07/2026",
  health: 87,
  simulated: true,
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
