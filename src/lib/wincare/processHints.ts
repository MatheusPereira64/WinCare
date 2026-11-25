/**
 * O que é cada processo do Windows que costuma aparecer no topo da lista —
 * em português e sem jargão. Usado na lista de processos e no assistente do
 * Windows Update.
 */
const HINTS: Record<string, string> = {
  tiworker: "Windows Update instalando atualizações",
  trustedinstaller: "Windows Update instalando componentes",
  mousocoreworker: "Windows Update procurando e baixando atualizações",
  usoclient: "Windows Update",
  wuauclt: "Windows Update",
  msmpeng: "Antivírus do Windows (Defender) verificando arquivos",
  mpdefendercoreservice: "Antivírus do Windows (Defender)",
  searchindexer: "Indexação da busca do Windows",
  searchprotocolhost: "Indexação da busca do Windows",
  compattelrunner: "Telemetria de compatibilidade do Windows",
  dwm: "Desenho das janelas e efeitos visuais",
  explorer: "Explorador e barra de tarefas",
  svchost: "Serviços do Windows",
  "system interrupts": "Interrupções de hardware (drivers)",
  memcompression: "Compressão de memória do Windows",
  audiodg: "Áudio do Windows",
  wmiprvse: "Consultas de sistema (WMI)",
  onedrive: "Sincronização do OneDrive",
  wincare: "Este app",
};

export function processHint(name: string): string | null {
  const key = name.toLowerCase().replace(/\.exe$/, "");
  return HINTS[key] ?? null;
}

/** Processos que indicam o Windows Update trabalhando. */
const WINDOWS_UPDATE_PROCESSES = ["tiworker", "trustedinstaller", "mousocoreworker"];

export const isWindowsUpdateProcess = (name: string) =>
  WINDOWS_UPDATE_PROCESSES.includes(name.toLowerCase().replace(/\.exe$/, ""));
