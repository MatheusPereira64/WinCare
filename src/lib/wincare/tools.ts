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

  // ---------------- Limpeza ----------------
  {
    id: "temp",
    name: "Limpar arquivos temporários",
    description: "Remove o conteúdo de %temp% e da pasta Temp do Windows.",
    command:
      "powershell -NoProfile -ExecutionPolicy Bypass -Command \"Remove-Item -LiteralPath ($env:TEMP + '\\*') -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath ($env:WINDIR + '\\Temp\\*') -Recurse -Force -ErrorAction SilentlyContinue; Write-Output 'Limpeza de temporarios concluida.'\"",
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
      "powershell -NoProfile -ExecutionPolicy Bypass -Command \"Remove-Item -LiteralPath ($env:WINDIR + '\\Prefetch\\*') -Force -ErrorAction SilentlyContinue; Write-Output 'Prefetch limpo.'\"",
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
      "powershell -NoProfile -ExecutionPolicy Bypass -Command \"Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; Remove-Item -LiteralPath ($env:LOCALAPPDATA + '\\Microsoft\\Windows\\Explorer\\*.db') -Force -ErrorAction SilentlyContinue; Start-Process explorer; Write-Output 'Cache de icones recriado.'\"",
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
  {
    id: "shutdown-1",
    name: "Desligar em 1 minuto",
    description: "Agenda o desligamento do Windows em 60 segundos (shutdown /s /t 60).",
    command: "shutdown /s /t 60",
    category: "system",
    risk: "advanced",
    requiresConfirmation: true,
    estimate: 2000,
  },
  {
    id: "shutdown-5",
    name: "Desligar em 5 minutos",
    description: "Agenda o desligamento do Windows em 5 minutos (shutdown /s /t 300).",
    command: "shutdown /s /t 300",
    category: "system",
    risk: "advanced",
    requiresConfirmation: true,
    estimate: 2000,
  },
  {
    id: "shutdown-15",
    name: "Desligar em 15 minutos",
    description: "Agenda o desligamento do Windows em 15 minutos (shutdown /s /t 900).",
    command: "shutdown /s /t 900",
    category: "system",
    risk: "advanced",
    requiresConfirmation: true,
    estimate: 2000,
  },
  {
    id: "shutdown-60",
    name: "Desligar em 1 hora",
    description: "Agenda o desligamento do Windows em 60 minutos (shutdown /s /t 3600).",
    command: "shutdown /s /t 3600",
    category: "system",
    risk: "advanced",
    requiresConfirmation: true,
    estimate: 2000,
  },
  {
    id: "shutdown-abort",
    name: "Cancelar desligamento",
    description: "Cancela um desligamento ou reinício já agendado (shutdown /a).",
    command: "shutdown /a",
    category: "system",
    risk: "safe",
    estimate: 1500,
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

  // ---------------- Redes ----------------
  // Destinos fixos (sem input controlado). Para host customizado use NetworkProbeCard.
  {
    id: "ping-google",
    name: "Ping — Google DNS",
    description: "Envia 4 pacotes para 8.8.8.8 e mede latência e perda.",
    command: "ping -n 4 -w 2000 8.8.8.8",
    category: "network",
    risk: "safe",
    estimate: 9000,
    timeoutMs: 15000,
  },
  {
    id: "ping-cloudflare",
    name: "Ping — Cloudflare",
    description: "Envia 4 pacotes para 1.1.1.1 e mede latência e perda.",
    command: "ping -n 4 -w 2000 1.1.1.1",
    category: "network",
    risk: "safe",
    estimate: 9000,
    timeoutMs: 15000,
  },
  {
    id: "dns-google",
    name: "DNS — google.com",
    description: "Consulta DNS de google.com via nslookup.",
    command: "nslookup google.com",
    category: "network",
    risk: "safe",
    estimate: 4000,
    timeoutMs: 10000,
  },
  {
    id: "dns-cloudflare",
    name: "DNS — cloudflare.com",
    description: "Consulta DNS de cloudflare.com via nslookup.",
    command: "nslookup cloudflare.com",
    category: "network",
    risk: "safe",
    estimate: 4000,
    timeoutMs: 10000,
  },
  {
    id: "tracert-google",
    name: "Tracert — google.com",
    description: "Mostra os saltos até google.com (máx. 12 saltos).",
    command: "tracert -h 12 -w 1500 -d google.com",
    category: "network",
    risk: "safe",
    estimate: 35000,
    timeoutMs: 90000,
  },
  {
    id: "ipconfig-all",
    name: "Configuração de IP (completa)",
    description: "Lista adaptadores, endereços IP, DNS e gateways (ipconfig /all).",
    command: "ipconfig /all",
    category: "network",
    risk: "safe",
    estimate: 4000,
    timeoutMs: 15000,
  },
  {
    id: "flushdns",
    name: "Limpar cache DNS",
    description: "Apaga o cache de resolução de nomes (ipconfig /flushdns).",
    command: "ipconfig /flushdns",
    category: "network",
    risk: "safe",
    estimate: 3000,
  },
  {
    id: "renew-ip",
    name: "Renovar IP",
    description: "Libera o IP atual e solicita um novo ao DHCP (release + renew).",
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
    description: "Redefine o catálogo Winsock. Pode exigir reiniciar o PC.",
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
    description: "Redefine a pilha TCP/IP. Pode exigir reiniciar o PC.",
    command: "netsh int ip reset",
    category: "network",
    risk: "advanced",
    requiresAdmin: true,
    requiresConfirmation: true,
    estimate: 6000,
  },
  {
    id: "speedtest",
    name: "Velocidade da conexão",
    description: "Baixa 1 MB de um servidor Cloudflare e estima o download em Mbps.",
    command:
      "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$ErrorActionPreference='Stop'; $sw=[Diagnostics.Stopwatch]::StartNew(); Invoke-WebRequest -Uri 'https://speed.cloudflare.com/__down?bytes=1048576' -UseBasicParsing | Out-Null; $sw.Stop(); $s=$sw.Elapsed.TotalSeconds; $mb=[math]::Round(8/$s,1); Write-Output ('Download: ' + $mb + ' Mbps em ' + [math]::Round($s,1) + 's')\"",
    commandPreview: "powershell … download de teste Cloudflare (1 MB)",
    category: "network",
    risk: "safe",
    estimate: 15000,
    timeoutMs: 45000,
  },
  {
    id: "wifi-profiles",
    name: "Perfis Wi‑Fi salvos",
    description: "Lista os perfis de rede sem fio guardados neste PC.",
    command: "netsh wlan show profiles",
    category: "network",
    risk: "safe",
    estimate: 4000,
    timeoutMs: 15000,
  },
  {
    id: "wifi-interfaces",
    name: "Interfaces Wi‑Fi",
    description: "Mostra o estado das interfaces WLAN (conexão, sinal, canal).",
    command: "netsh wlan show interfaces",
    category: "network",
    risk: "safe",
    estimate: 4000,
    timeoutMs: 15000,
  },
];

export const FULL_CHECK_IDS = ["sfc", "dism-check", "dism-scan", "dism-restore", "chkdsk"];

export const getTool = (id: string) => TOOLS.find((t) => t.id === id);

export function getCommandPreview(tool: Tool) {
  return tool.commandPreview ?? tool.command;
}

/** Substitui o último token do comando quando a ferramenta aceita um parâmetro (host, minutos…). */
export function resolveCommand(tool: Tool, target?: string): string {
  const raw = target?.trim();
  if (!raw || !tool.input) return tool.command;

  const factor = tool.input.toCommandFactor ?? 1;
  const n = Number(raw.replace(",", "."));
  const value =
    Number.isFinite(n) && factor !== 1
      ? String(Math.max(0, Math.round(n * factor)))
      : raw;

  return tool.command.replace(/[^ ]+$/, value);
}

export const RISK_LABEL: Record<string, string> = {
  safe: "Seguro",
  warning: "Atenção",
  advanced: "Avançado",
};
