export type RiskLevel = "safe" | "warning" | "advanced";

export type ToolCategory = "repair" | "system" | "cleanup" | "disk" | "network";

export interface Tool {
  id: string;
  name: string;
  description: string;
  command: string;
  /** Versão curta exibida na UI quando o comando completo é muito longo. */
  commandPreview?: string;
  category: ToolCategory;
  risk: RiskLevel;
  requiresConfirmation?: boolean;
  requiresAdmin?: boolean;
  /** estimated duration in ms, used for progress pacing in demo mode */
  estimate?: number;
  /** kills the process after this many ms (native mode) */
  timeoutMs?: number;
  /** true when the tool just opens a native Windows app */
  launcher?: boolean;
  /** accepts a free-text target (host, domain, minutes...) */
  input?: {
    label: string;
    placeholder: string;
    defaultValue?: string;
    /** Multiply UI value before injecting into the command (e.g. minutes → seconds = 60). */
    toCommandFactor?: number;
    /** Hint shown next to the field (e.g. "minutos"). */
    unitLabel?: string;
    presets?: { label: string; value: string }[];
  };
}

export interface LogLine {
  time: string;
  text: string;
  kind: "info" | "output" | "success" | "error" | "warn";
}

export interface RunRecord {
  id: string;
  toolId: string;
  toolName: string;
  command: string;
  startedAt: number;
  finishedAt?: number;
  status: "running" | "success" | "error";
  lines: LogLine[];
  result?: string;
}

export interface SystemInfo {
  hostname: string;
  osName: string;
  build: string;
  cpuUsage: number;
  memoryUsage: number;
  memoryTotalGb: number;
  /** Memória física em uso (GB). */
  memoryUsedGb?: number | null;
  diskUsage: number;
  diskTotalGb: number;
  uptime: string;
  defenderStatus: string;
  lastUpdate: string;
  health: number;
  simulated: boolean;
  /** °C via zona térmica ACPI — nem sempre disponível. */
  cpuTemperature?: number | null;
  /** Quase nunca exposta no Windows sem sensor dedicado. */
  memoryTemperature?: number | null;
  gpuName?: string | null;
  gpuUsage?: number | null;
  gpuTemperature?: number | null;
  gpuMemoryUsedMb?: number | null;
  gpuMemoryTotalMb?: number | null;
  gpuMemoryUsage?: number | null;
}

export interface DiskDrive {
  letter: string;
  model: string;
  type: "SSD" | "HDD";
  smart: string;
  freeGb: number;
  totalGb: number;
  temperature?: number;
}

export type StartupLocation = "hkcu-run" | "hklm-run" | "startup-folder";

export type StartupImpact = "high" | "medium" | "low" | "unknown";

export type StartupAdvice = "keep" | "consider" | "disable";

export interface StartupItem {
  id: string;
  name: string;
  command: string;
  location: StartupLocation;
  enabled: boolean;
  /** itens HKLM exigem admin para alterar */
  requiresAdmin?: boolean;
  /** Nome do processo (.exe sem extensão), quando identificável */
  processName?: string;
  /** Processo correspondente está na memória agora */
  running?: boolean;
  /** RAM atual do processo (MB), soma de todas as instâncias */
  memMb?: number;
  processCount?: number;
  /** PNG em data URL extraído do .exe / .lnk no Windows */
  iconDataUrl?: string;
  impact?: StartupImpact;
  recommendation?: StartupAdvice;
  recommendationReason?: string;
}

export interface TopProcess {
  name: string;
  pid: number;
  cpu: number;
  memMb: number;
}

export interface DiskUsageFolder {
  id: string;
  label: string;
  path: string;
  sizeBytes: number;
  clearable: boolean;
  hint?: string;
}
