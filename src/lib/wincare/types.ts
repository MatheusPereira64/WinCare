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
  /** Segundos de CPU acumulados. */
  cpu: number;
  /** % do processador agora (null na primeira leitura). */
  cpuPct?: number | null;
  memMb: number;
  hasWindow?: boolean;
  /** Pode ser encerrado pela tela (não é processo do Windows). */
  canEnd?: boolean;
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
  /** Última vez que foi aberto (UserAssist do Windows), em ms; null = sem registro. */
  lastUsedAt?: number | null;
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

/* Histórico de manutenção (gravado pelo processo principal, ver electron/maintenance-history.cjs). */

export type MaintenanceKind = "cleanup" | "uninstall" | "repair" | "check" | "optimize" | "safety";

export interface MaintenanceEvent {
  id: string;
  /** Quando terminou (ms desde 1970). */
  ts: number;
  kind: MaintenanceKind;
  /** Ação específica ("sfc", "cleaner", "scheduled-cleanup"…). */
  action: string;
  title: string;
  detail?: string;
  /** Nome do programa/app envolvido (desinstalação, inicialização). */
  subject?: string;
  ok: boolean;
  source: "manual" | "scheduled";
  freedBytes?: number;
  /** O espaço é o tamanho informado pelo programa (desinstalação), não medido. */
  estimated?: boolean;
  durationMs?: number;
}

/** Média da nota de saúde em um dia (calendário local, "2026-11-03"). */
export interface HealthDay {
  day: string;
  avg: number;
  min: number;
  max: number;
  /** Leituras no dia (uma a cada 5 min no máximo). */
  n: number;
}

export interface MaintenanceHistory {
  ok: boolean;
  reason?: string;
  events: MaintenanceEvent[];
  health: HealthDay[];
  limits?: { maxEvents: number; maxHealthDays: number };
}

/* Segundo plano: bandeja e alertas (electron/background.cjs + alerts.cjs). */

export type AlertType =
  "disk" | "temperature" | "defender" | "windowsUpdate" | "diskGrowth" | "newProgram";

export interface ActiveAlert {
  type: AlertType;
  title: string;
  body: string;
  /** Texto curto (menu da bandeja). */
  short: string;
  since: number;
  route: string;
}

export interface BackgroundState {
  ok: boolean;
  reason?: string;
  supported: { tray: boolean; notifications: boolean; openAtLogin: boolean };
  closeToTray: boolean;
  openAtLogin: { supported: boolean; enabled: boolean; blockedByWindows?: boolean };
  /** O app abriu com o Windows (sem janela). */
  launchedHidden: boolean;
  monitor: {
    enabled: boolean;
    types: Record<AlertType, boolean>;
    /** Alertas silenciados até (0 = não). */
    snoozeUntil: number;
    lastCheckAt: number;
    /** Última leitura de cada verificação (null = ainda não rodou). */
    checks: Record<AlertType, { at: number; summary: string; ok: boolean } | null>;
    active: ActiveAlert[];
  };
}

export interface BackgroundSettingsPatch {
  closeToTray?: boolean;
  openAtLogin?: boolean;
  monitorEnabled?: boolean;
  types?: Partial<Record<AlertType, boolean>>;
}

/** Pedido vindo da bandeja ou do clique numa notificação. */
export type TrayCommand = { type: "navigate"; to: string } | { type: "quick-checkup" };

/* Bateria (powercfg /batteryreport). Capacidades em mWh. */

export interface BatteryUnit {
  name: string;
  manufacturer: string;
  chemistry: string;
  designMwh: number;
  fullChargeMwh: number;
  /** Ciclos de carga; null quando o firmware não informa. */
  cycleCount: number | null;
}

/** Capacidade de carga total medida no fim de um período (um ponto por mês). */
export interface BatteryCapacityPoint {
  /** AAAA-MM-DD */
  date: string;
  fullChargeMwh: number;
  designMwh: number;
}

export interface BatteryReport {
  ok: boolean;
  reason?: string;
  hasBattery: boolean;
  scannedAt?: string;
  platformRole?: string | null;
  batteries: BatteryUnit[];
  history: BatteryCapacityPoint[];
  runtime?: { fullChargeSec: number | null; designSec: number | null };
  /** Parte do tempo ativo recente passado na tomada (0–1). */
  acShare?: number | null;
  onBattery?: boolean;
  activePlan?: { guid: string; name: string } | null;
}
