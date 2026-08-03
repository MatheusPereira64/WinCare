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
