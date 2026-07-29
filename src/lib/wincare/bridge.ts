import type { DiskDrive, SystemInfo, Tool } from "./types";

/**
 * Bridge to the native layer.
 *
 * When WinCare runs inside its Windows desktop shell (Electron), the preload
 * script exposes `window.wincare` and every command runs for real, elevated.
 * In the browser preview there is no OS to talk to, so we stream a realistic
 * simulation and flag it as such in the UI.
 */
export interface NativeBridge {
  run: (
    command: string,
    onData: (chunk: string) => void,
  ) => Promise<{ code: number; result: string }>;
  systemInfo: () => Promise<SystemInfo>;
  disks: () => Promise<DiskDrive[]>;
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
  flushdns: ["Configuração de IP do Windows", "Cache do Resolvedor de DNS liberado com êxito."],
  "renew-ip": [
    "Adaptador Ethernet: endereço liberado.",
    "Solicitando novo endereço ao DHCP...",
    "Endereço IPv4: 192.168.0.24",
    "Gateway padrão: 192.168.0.1",
  ],
  winsock: [
    "Catálogo Winsock redefinido com êxito.",
    "Você deve reiniciar o computador para concluir a redefinição.",
  ],
  tcpip: [
    "Redefinindo Interface, OK!",
    "Redefinindo Vizinho, OK!",
    "Reinicie o computador para concluir esta ação.",
  ],
  ping: [
    "Disparando contra google.com [142.250.218.174] com 32 bytes de dados:",
    "Resposta de 142.250.218.174: bytes=32 tempo=12ms TTL=115",
    "Resposta de 142.250.218.174: bytes=32 tempo=11ms TTL=115",
    "Resposta de 142.250.218.174: bytes=32 tempo=13ms TTL=115",
    "Pacotes: Enviados = 4, Recebidos = 4, Perdidos = 0 (0% de perda), Média = 12ms",
  ],
  tracert: [
    "Rastreando a rota para google.com com no máximo 30 saltos",
    "  1     1 ms     1 ms     1 ms  192.168.0.1",
    "  2     8 ms     9 ms     8 ms  10.20.0.1",
    "  3    11 ms    12 ms    11 ms  core-router.isp.net",
    "  4    12 ms    12 ms    12 ms  142.250.218.174",
    "Rastreamento concluído.",
  ],
  nslookup: [
    "Servidor:  dns.google",
    "Address:  8.8.8.8",
    "Resposta não autoritativa:",
    "Nome:    google.com",
    "Addresses: 2800:3f0:4001:830::200e, 142.250.218.174",
  ],
  speedtest: [
    "Medindo latência...  12 ms",
    "Medindo download... 248,6 Mbps",
    "Medindo upload...    96,4 Mbps",
    "Teste concluído.",
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
};

const SIM_RESULT: Record<string, string> = {
  sfc: "Nenhuma violação de integridade encontrada.",
  "dism-check": "Imagem íntegra.",
  "dism-scan": "Nenhuma corrupção detectada.",
  "dism-restore": "Imagem restaurada com êxito.",
  chkdsk: "Sistema de arquivos sem problemas.",
  "chkdsk-fix": "Verificação agendada para a próxima reinicialização.",
  "wu-cache": "Cache do Windows Update limpo (1,8 GB).",
  flushdns: "Cache DNS liberado.",
  "renew-ip": "Novo IP obtido: 192.168.0.24",
  winsock: "Winsock redefinido. Reinicie o computador.",
  tcpip: "TCP/IP redefinido. Reinicie o computador.",
  ping: "0% de perda, latência média 12 ms.",
  tracert: "Rota completa em 4 saltos.",
  nslookup: "Domínio resolvido com sucesso.",
  speedtest: "248,6 Mbps download / 96,4 Mbps upload.",
  temp: "2,7 GB liberados.",
  prefetch: "142 MB liberados.",
  "icon-cache": "Cache de ícones recriado.",
  smart: "Todos os discos com status OK.",
  "disk-space": "2 unidades analisadas.",
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
