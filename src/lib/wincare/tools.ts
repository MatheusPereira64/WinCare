import type { Tool } from "./types";

export const TOOLS: Tool[] = [
  // ---------------- Reparo ----------------
  {
    id: "sfc",
    name: "Verificar arquivos do sistema",
    description:
      "Analisa todos os arquivos protegidos do Windows e substitui automaticamente os que estiverem corrompidos por cópias íntegras.",
    command: "sfc /scannow",
    category: "repair",
    risk: "safe",
    requiresAdmin: true,
    estimate: 22000,
  },
  {
    id: "dism-check",
    name: "DISM CheckHealth",
    description:
      "Verificação rápida que informa se a imagem do Windows já foi marcada como corrompida.",
    command: "DISM /Online /Cleanup-Image /CheckHealth",
    category: "repair",
    risk: "safe",
    requiresAdmin: true,
    estimate: 6000,
  },
  {
    id: "dism-scan",
    name: "DISM ScanHealth",
    description:
      "Faz uma varredura completa da imagem do Windows procurando corrupção de componentes.",
    command: "DISM /Online /Cleanup-Image /ScanHealth",
    category: "repair",
    risk: "safe",
    requiresAdmin: true,
    estimate: 18000,
  },
  {
    id: "dism-restore",
    name: "Restaurar imagem do Windows",
    description:
      "Repara a imagem do Windows baixando os arquivos íntegros do Windows Update. Requer internet.",
    command: "DISM /Online /Cleanup-Image /RestoreHealth",
    category: "repair",
    risk: "warning",
    requiresAdmin: true,
    requiresConfirmation: true,
    estimate: 26000,
  },
  {
    id: "chkdsk",
    name: "Verificar disco (somente leitura)",
    description:
      "Analisa a estrutura do sistema de arquivos da unidade C: sem alterar nada no disco.",
    command: "chkdsk C:",
    category: "repair",
    risk: "safe",
    estimate: 14000,
  },
  {
    id: "chkdsk-fix",
    name: "Verificar e corrigir disco",
    description:
      "Agenda a correção de erros do sistema de arquivos. Normalmente exige reiniciar o computador.",
    command: "chkdsk C: /f",
    category: "repair",
    risk: "advanced",
    requiresAdmin: true,
    requiresConfirmation: true,
    estimate: 12000,
  },
  {
    id: "wu-cache",
    name: "Limpar cache do Windows Update",
    description:
      "Rotina automática: para os serviços wuauserv e bits, limpa SoftwareDistribution e catroot2 e reinicia os serviços.",
    command:
      'net stop wuauserv && net stop bits && rd /s /q "%windir%\\SoftwareDistribution" && rd /s /q "%windir%\\System32\\catroot2" && net start wuauserv && net start bits',
    category: "repair",
    risk: "warning",
    requiresAdmin: true,
    requiresConfirmation: true,
    estimate: 15000,
  },

  // ---------------- Rede ----------------
  {
    id: "flushdns",
    name: "Limpar DNS",
    description: "Apaga o cache de resolução de nomes, corrigindo sites que não abrem.",
    command: "ipconfig /flushdns",
    category: "network",
    risk: "safe",
    estimate: 3000,
  },
  {
    id: "renew-ip",
    name: "Renovar IP",
    description: "Libera o endereço IP atual e solicita um novo ao servidor DHCP.",
    command: "ipconfig /release && ipconfig /renew",
    category: "network",
    risk: "warning",
    requiresConfirmation: true,
    estimate: 12000,
    timeoutMs: 90000,
  },
  {
    id: "winsock",
    name: "Reset Winsock",
    description:
      "Restaura o catálogo Winsock para o padrão. Reinicie o computador após executar.",
    command: "netsh winsock reset",
    category: "network",
    risk: "warning",
    requiresAdmin: true,
    requiresConfirmation: true,
    estimate: 5000,
  },
  {
    id: "tcpip",
    name: "Reset TCP/IP",
    description: "Reinstala a pilha TCP/IP, resolvendo problemas persistentes de conexão.",
    command: "netsh int ip reset",
    category: "network",
    risk: "advanced",
    requiresAdmin: true,
    requiresConfirmation: true,
    estimate: 6000,
  },
  {
    id: "ping",
    name: "Teste de Internet",
    description: "Envia 4 pacotes para um servidor e mede a latência e a perda de pacotes.",
    command: "ping -n 4 -w 2000 8.8.8.8",
    category: "network",
    risk: "safe",
    estimate: 9000,
    timeoutMs: 15000,
    input: { label: "Destino", placeholder: "8.8.8.8 ou google.com", defaultValue: "8.8.8.8" },
  },
  {
    id: "tracert",
    name: "Traceroute",
    description: "Mostra os saltos de rede até o destino (máx. 12 saltos, timeout 1,5 s por salto).",
    command: "tracert -h 12 -w 1500 -d google.com",
    category: "network",
    risk: "safe",
    estimate: 35000,
    timeoutMs: 90000,
    input: { label: "Destino", placeholder: "google.com", defaultValue: "google.com" },
  },
  {
    id: "nslookup",
    name: "Consulta DNS",
    description: "Consulta os registros DNS de um domínio e mostra qual servidor respondeu.",
    command: "nslookup google.com",
    category: "network",
    risk: "safe",
    estimate: 4000,
    timeoutMs: 10000,
    input: { label: "Domínio", placeholder: "google.com", defaultValue: "google.com" },
  },
  {
    id: "speedtest",
    name: "Velocidade da conexão",
    description: "Baixa 1 MB de um servidor de teste e calcula a velocidade de download.",
    command:
      "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$ErrorActionPreference='Stop'; $sw=[Diagnostics.Stopwatch]::StartNew(); Invoke-WebRequest -Uri 'https://speed.cloudflare.com/__down?bytes=1048576' -UseBasicParsing | Out-Null; $sw.Stop(); $s=$sw.Elapsed.TotalSeconds; $mb=[math]::Round(8/$s,1); Write-Output ('Download: ' + $mb + ' Mbps em ' + [math]::Round($s,1) + 's')\"",
    commandPreview: "powershell … download de teste Cloudflare (1 MB)",
    category: "network",
    risk: "safe",
    estimate: 15000,
    timeoutMs: 45000,
  },

  // ---------------- Limpeza ----------------
  {
    id: "temp",
    name: "Limpar arquivos temporários",
    description: "Remove o conteúdo de %temp% e da pasta Temp do Windows.",
    command:
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath ($env:TEMP + \'\\*\') -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath ($env:WINDIR + \'\\Temp\\*\') -Recurse -Force -ErrorAction SilentlyContinue; Write-Output \'Limpeza de temporarios concluida.\'"',
    category: "cleanup",
    risk: "safe",
    estimate: 9000,
  },
  {
    id: "prefetch",
    name: "Limpar Prefetch",
    description:
      "Apaga os arquivos de pré-carregamento. O Windows recria conforme você usa os programas.",
    command:
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath ($env:WINDIR + \'\\Prefetch\\*\') -Force -ErrorAction SilentlyContinue; Write-Output \'Prefetch limpo.\'"',
    category: "cleanup",
    risk: "warning",
    requiresAdmin: true,
    requiresConfirmation: true,
    estimate: 5000,
  },
  {
    id: "icon-cache",
    name: "Limpar cache do Windows",
    description: "Recria o cache de ícones e miniaturas, corrigindo imagens quebradas.",
    command:
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; Remove-Item -LiteralPath ($env:LOCALAPPDATA + \'\\Microsoft\\Windows\\Explorer\\*.db\') -Force -ErrorAction SilentlyContinue; Start-Process explorer; Write-Output \'Cache de icones recriado.\'"',
    category: "cleanup",
    risk: "warning",
    requiresConfirmation: true,
    estimate: 6000,
  },
  {
    id: "cleanmgr",
    name: "Abrir Limpeza de Disco",
    description: "Abre a ferramenta nativa cleanmgr para escolher o que remover.",
    command: "cleanmgr",
    category: "cleanup",
    risk: "safe",
    launcher: true,
    estimate: 1500,
  },

  // ---------------- Sistema ----------------
  {
    id: "devmgmt",
    name: "Gerenciador de Dispositivos",
    description: "Drivers e hardware instalados.",
    command: "devmgmt.msc",
    category: "system",
    risk: "safe",
    launcher: true,
    estimate: 1200,
  },
  {
    id: "diskmgmt",
    name: "Gerenciamento de Disco",
    description: "Partições, volumes e letras de unidade.",
    command: "diskmgmt.msc",
    category: "system",
    risk: "warning",
    launcher: true,
    estimate: 1200,
  },
  {
    id: "services",
    name: "Serviços",
    description: "Serviços do Windows e seu tipo de inicialização.",
    command: "services.msc",
    category: "system",
    risk: "warning",
    launcher: true,
    estimate: 1200,
  },
  {
    id: "regedit",
    name: "Editor de Registro",
    description: "Alterações incorretas aqui podem impedir o Windows de iniciar.",
    command: "regedit",
    category: "system",
    risk: "advanced",
    requiresConfirmation: true,
    launcher: true,
    estimate: 1200,
  },
  {
    id: "eventvwr",
    name: "Visualizador de Eventos",
    description: "Logs de erros, avisos e travamentos do sistema.",
    command: "eventvwr",
    category: "system",
    risk: "safe",
    launcher: true,
    estimate: 1200,
  },
  {
    id: "taskmgr",
    name: "Gerenciador de Tarefas",
    description: "Processos, desempenho e programas de inicialização.",
    command: "taskmgr",
    category: "system",
    risk: "safe",
    launcher: true,
    estimate: 1000,
  },
  {
    id: "control",
    name: "Painel de Controle",
    description: "Painel de Controle clássico do Windows.",
    command: "control",
    category: "system",
    risk: "safe",
    launcher: true,
    estimate: 1000,
  },
  {
    id: "ms-settings",
    name: "Configurações",
    description: "Aplicativo Configurações do Windows 11.",
    command: "start ms-settings:",
    category: "system",
    risk: "safe",
    launcher: true,
    estimate: 1000,
  },

  // ---------------- Disco / integridade ----------------
  {
    id: "smart",
    name: "Status SMART dos discos",
    description: "Consulta o autodiagnóstico dos discos instalados via WMIC.",
    command: "wmic diskdrive get model,status,size",
    category: "disk",
    risk: "safe",
    estimate: 5000,
  },
  {
    id: "disk-space",
    name: "Espaço livre por unidade",
    description: "Lista as unidades com espaço livre e total.",
    command: "wmic logicaldisk get caption,freespace,size",
    category: "disk",
    risk: "safe",
    estimate: 4000,
  },
];

export const FULL_CHECK_IDS = [
  "sfc",
  "dism-check",
  "dism-scan",
  "dism-restore",
  "flushdns",
  "winsock",
  "chkdsk",
];

export const getTool = (id: string) => TOOLS.find((t) => t.id === id);

export function getCommandPreview(tool: Tool) {
  return tool.commandPreview ?? tool.command;
}

/** Substitui o host/domínio final quando a ferramenta aceita um destino customizado. */
export function resolveCommand(tool: Tool, target?: string): string {
  const host = target?.trim();
  if (!host || !tool.input) return tool.command;
  return tool.command.replace(/[^ ]+$/, host);
}

export const RISK_LABEL: Record<string, string> = {
  safe: "Seguro",
  warning: "Atenção",
  advanced: "Avançado",
};
