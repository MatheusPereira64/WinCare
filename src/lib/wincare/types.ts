export type RiskLevel = "safe" | "warning" | "advanced";

export type ToolCategory = "repair" | "network" | "system" | "cleanup" | "disk";

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
  /** accepts a free-text target (host, domain...) */
  input?: { label: string; placeholder: string; defaultValue?: string };
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
  diskUsage: number;
  diskTotalGb: number;
  uptime: string;
  defenderStatus: string;
  lastUpdate: string;
  health: number;
  simulated: boolean;
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
