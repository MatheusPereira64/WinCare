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
  /** Oferece criar um ponto de restauração do Windows antes de executar. */
  restorePoint?: boolean;
  /** Executa uma ação do processo principal em vez de `command`. */
  nativeAction?: "restore-point";
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
  /** A ação não foi executada porque o ponto de restauração falhou. */
  restorePointFailed?: boolean;
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

export interface StartupItem {
  id: string;
  name: string;
  command: string;
  location: StartupLocation;
  enabled: boolean;
  /** itens HKLM exigem admin para alterar */
  requiresAdmin?: boolean;
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

export interface RestorePointResult {
  ok: boolean;
  status: "created" | "recent" | "failed" | "cancelled";
  message?: string;
  createdAt?: string;
}

export type CleanerCategory = "cache" | "cookies" | "history";

export interface CleanerSample {
  path: string;
  sizeBytes: number;
}

export interface CleanerItem {
  id: string;
  appId: string;
  appName: string;
  appKind: "browser" | "app";
  profile: string;
  category: CleanerCategory;
  sizeBytes: number;
  fileCount: number;
  samples: CleanerSample[];
  /** O navegador/app está aberto agora. */
  running: boolean;
}

export interface CleanerResult {
  ok: boolean;
  reason?: string;
  freedBytes?: number;
  removed?: number;
  skipped?: number;
  /** Apps cujos cookies/histórico não foram tocados por estarem abertos. */
  blocked?: string[];
}

export interface InstalledProgram {
  id: string;
  name: string;
  publisher: string;
  version: string;
  /** yyyy-mm-dd */
  installDate: string | null;
  sizeBytes: number;
  installLocation: string;
  scope: "machine" | "user";
  /** Componente do qual outros programas costumam depender. */
  critical: boolean;
  icon: string | null;
}

export interface UninstallResult {
  ok: boolean;
  reason?: string;
  message?: string;
  exitCode?: number;
  stillInstalled?: boolean;
}

export interface LeftoverItem {
  id: string;
  kind: "folder" | "registry";
  path: string;
  reason: string;
  sizeBytes: number;
  fileCount: number;
  requiresAdmin: boolean;
}

export interface LeftoverScan {
  ok: boolean;
  reason?: string;
  items: LeftoverItem[];
}

export interface LeftoverRemoval {
  ok: boolean;
  removed: number;
  freedBytes: number;
  failed: { path: string; reason: string }[];
  backupDir: string | null;
}

export type ScheduleJob = "cleanup" | "full-check";

export interface ScheduleConfig {
  frequency: "daily" | "weekly" | "monthly";
  /** 0 = domingo */
  weekDay: number;
  monthDay: number;
  /** HH:mm */
  time: string;
}

export interface ScheduleEntry {
  job: ScheduleJob;
  enabled: boolean;
  config: ScheduleConfig;
  requiresAdmin: boolean;
  nextRun: string | null;
  lastRun: string | null;
  /** A tarefa aponta para um executável que mudou de lugar. */
  stale: boolean;
}

export interface ScheduleHistoryEntry {
  id: string;
  job: ScheduleJob;
  label: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  summary: string;
  freedBytes?: number;
  steps: { name: string; ok: boolean; detail?: string }[];
}

export interface ScheduleOverview {
  ok: boolean;
  reason?: string;
  items: ScheduleEntry[];
  history: ScheduleHistoryEntry[];
}
