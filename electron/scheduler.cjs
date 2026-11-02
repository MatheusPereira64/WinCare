const { app, Notification } = require("electron");
const { exec, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const logger = require("./logger.cjs");
const { runScheduledCleanup } = require("./cleaner.cjs");
const {
  psAdminJson,
  psElevatedJson,
  psFileJson,
  psQuote,
  isWindowsAdmin,
} = require("./powershell.cjs");
const { createRestorePoint } = require("./restore-point.cjs");

const JOB_ARG = "--wincare-job=";
const REPAIR_STEP_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_HISTORY = 40;

const JOBS = {
  cleanup: {
    taskName: "WinCare-Limpeza",
    label: "Limpeza agendada",
    runLevel: "LeastPrivilege",
    description: "WinCare: remove temporários antigos e caches de navegadores e apps fechados.",
  },
  "full-check": {
    taskName: "WinCare-Verificacao",
    label: "Verificação completa agendada",
    runLevel: "HighestAvailable",
    description: "WinCare: ponto de restauração, SFC, DISM e verificação de disco.",
  },
};

const FULL_CHECK_STEPS = [
  { name: "Verificar arquivos do sistema", command: "sfc /scannow" },
  { name: "DISM CheckHealth", command: "DISM /Online /Cleanup-Image /CheckHealth" },
  { name: "DISM ScanHealth", command: "DISM /Online /Cleanup-Image /ScanHealth" },
  { name: "Restaurar imagem do Windows", command: "DISM /Online /Cleanup-Image /RestoreHealth" },
  { name: "Verificar disco", command: "chkdsk C:" },
];

const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DEFAULT_CONFIG = { frequency: "weekly", weekDay: 0, monthDay: 1, time: "12:00" };

function parseJobArg(argv = process.argv) {
  const arg = argv.find((a) => String(a).startsWith(JOB_ARG));
  if (!arg) return null;
  const job = arg.slice(JOB_ARG.length);
  return Object.prototype.hasOwnProperty.call(JOBS, job) ? job : null;
}

/** Valida contra a lista fixa que a UI oferece: não há texto livre neste fluxo. */
function normalizeConfig(raw) {
  const config = { ...DEFAULT_CONFIG };
  if (["daily", "weekly", "monthly"].includes(raw?.frequency)) config.frequency = raw.frequency;
  const weekDay = Number(raw?.weekDay);
  if (Number.isInteger(weekDay) && weekDay >= 0 && weekDay <= 6) config.weekDay = weekDay;
  const monthDay = Number(raw?.monthDay);
  if (Number.isInteger(monthDay) && monthDay >= 1 && monthDay <= 28) config.monthDay = monthDay;
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw?.time))) config.time = raw.time;
  return config;
}

const xmlEscape = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function nextStartBoundary(config, now = new Date()) {
  const [hours, minutes] = config.time.split(":").map(Number);
  const start = new Date(now);
  start.setHours(hours, minutes, 0, 0);
  if (start <= now) start.setDate(start.getDate() + 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(hours)}:${pad(minutes)}:00`;
}

function scheduleElement(config) {
  if (config.frequency === "daily") {
    return "<ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>";
  }
  if (config.frequency === "weekly") {
    return `<ScheduleByWeek><WeeksInterval>1</WeeksInterval><DaysOfWeek><${WEEK_DAYS[config.weekDay]} /></DaysOfWeek></ScheduleByWeek>`;
  }
  const months = MONTHS.map((m) => `<${m} />`).join("");
  return `<ScheduleByMonth><DaysOfMonth><Day>${config.monthDay}</Day></DaysOfMonth><Months>${months}</Months></ScheduleByMonth>`;
}

function buildTaskXml(job, config, launch, userId, now = new Date()) {
  const def = JOBS[job];
  const args = [...launch.args.map((a) => `"${a}"`), `${JOB_ARG}${job}`].join(" ");
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>WinCare</Author>
    <Description>${xmlEscape(def.description)}</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>${nextStartBoundary(config, now)}</StartBoundary>
      <Enabled>true</Enabled>
      ${scheduleElement(config)}
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${xmlEscape(userId)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>${def.runLevel}</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>true</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT3H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xmlEscape(launch.exe)}</Command>
      <Arguments>${xmlEscape(args)}</Arguments>
      <WorkingDirectory>${xmlEscape(launch.cwd)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
}

/** Como relançar o próprio WinCare, em release ou em desenvolvimento. */
function resolveSelfLaunch() {
  const projectRoot = path.resolve(path.join(__dirname, ".."));
  const brandedExe = path.join(projectRoot, ".electron-dev", "WinCare.exe");
  const realAsar = path.join(path.dirname(process.execPath), "resources", "app.asar");
  // .electron-dev copia o Electron com default_app.asar — app.isPackaged fica true
  // mesmo em desenvolvimento. Só o app.asar de release é pacote real.
  const isReleaseBuild = fs.existsSync(realAsar);
  return {
    isReleaseBuild,
    exe: !isReleaseBuild && fs.existsSync(brandedExe) ? brandedExe : process.execPath,
    args: isReleaseBuild ? [] : [projectRoot],
    cwd: isReleaseBuild ? path.dirname(process.execPath) : projectRoot,
  };
}

const sharedDataDir = () => path.join(app.getPath("appData"), app.getName());
const configFile = () => path.join(sharedDataDir(), "schedules.json");
const historyFile = () => path.join(sharedDataDir(), "schedule-history.json");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

const taskUserId = () =>
  process.env.USERDOMAIN
    ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
    : os.userInfo().username;

const runSchtasks = (args, timeout = 20000) =>
  new Promise((resolve) => {
    exec(`schtasks ${args}`, { windowsHide: true, timeout }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: `${stdout || ""}${stderr || ""}`.trim() });
    });
  });

async function listSchedules() {
  const stored = readJson(configFile(), {});
  const names = Object.entries(JOBS).map(([job, def]) => ({ job, taskName: def.taskName }));
  const rows = await psFileJson(
    String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$out = @()
foreach ($name in @(${names.map((n) => psQuote(n.taskName)).join(",")})) {
  $task = Get-ScheduledTask -TaskName $name
  if (-not $task) { continue }
  $info = $task | Get-ScheduledTaskInfo
  $out += [ordered]@{
    taskName = $name
    state = [string]$task.State
    nextRun = if ($info.NextRunTime) { $info.NextRunTime.ToString('o') } else { $null }
    lastRun = if ($info.LastRunTime -and $info.LastRunTime.Year -ge 2000) { $info.LastRunTime.ToString('o') } else { $null }
    lastResult = [int64]$info.LastTaskResult
    command = [string]$task.Actions[0].Execute
  }
}
,@($out) | ConvertTo-Json -Compress -Depth 3
`,
    30000,
  ).catch(() => []);
  const tasks = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const launch = resolveSelfLaunch();

  return names.map(({ job, taskName }) => {
    const task = tasks.find((t) => t.taskName === taskName);
    return {
      job,
      enabled: !!task,
      config: normalizeConfig(stored[job]),
      requiresAdmin: JOBS[job].runLevel === "HighestAvailable",
      nextRun: task?.nextRun ?? null,
      lastRun: task?.lastRun ?? null,
      /* O ZIP é portátil: se a pasta mudar de lugar a tarefa aponta para um .exe antigo. */
      stale: !!task && String(task.command).toLowerCase() !== launch.exe.toLowerCase(),
    };
  });
}

async function setSchedule(job, rawConfig) {
  const def = JOBS[job];
  if (!def) return { ok: false, reason: "Rotina desconhecida." };
  const config = normalizeConfig(rawConfig);
  const launch = resolveSelfLaunch();
  const xmlPath = path.join(os.tmpdir(), `wincare-task-${Date.now()}.xml`);
  const xml = buildTaskXml(job, config, launch, taskUserId());
  fs.writeFileSync(xmlPath, Buffer.from(`\uFEFF${xml}`, "utf16le"));

  try {
    const body = `$output = & schtasks.exe /Create /TN ${psQuote(def.taskName)} /XML ${psQuote(xmlPath)} /F 2>&1 | Out-String
@{ ok = ($LASTEXITCODE -eq 0); reason = $output.Trim() } | ConvertTo-Json -Compress`;
    /* Tarefa com privilégio máximo só pode ser registrada por um processo elevado. */
    const out =
      def.runLevel === "HighestAvailable"
        ? await psAdminJson(body, 60000)
        : await psFileJson(body, 30000);
    if (!out?.ok) {
      return {
        ok: false,
        reason:
          out?.reason === "cancelled"
            ? "Permissão de administrador negada ou cancelada."
            : out?.reason,
      };
    }
    const stored = readJson(configFile(), {});
    stored[job] = config;
    writeJson(configFile(), stored);
    logger.log("schedule", "Rotina agendada", { job, config });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Falha ao agendar." };
  } finally {
    try {
      fs.unlinkSync(xmlPath);
    } catch {
      /* ignore */
    }
  }
}

async function removeSchedule(job) {
  const def = JOBS[job];
  if (!def) return { ok: false, reason: "Rotina desconhecida." };
  const direct = await runSchtasks(`/Delete /TN "${def.taskName}" /F`);
  if (direct.ok) return { ok: true };
  if (await isWindowsAdmin()) return { ok: false, reason: direct.output };
  const out = await psElevatedJson(
    `$output = & schtasks.exe /Delete /TN ${psQuote(def.taskName)} /F 2>&1 | Out-String
@{ ok = ($LASTEXITCODE -eq 0); reason = $output.Trim() } | ConvertTo-Json -Compress`,
    30000,
  );
  return out?.ok
    ? { ok: true }
    : { ok: false, reason: "Permissão de administrador negada ou cancelada." };
}

async function runScheduleNow(job) {
  const def = JOBS[job];
  if (!def) return { ok: false, reason: "Rotina desconhecida." };
  const direct = await runSchtasks(`/Run /TN "${def.taskName}"`);
  return direct.ok ? { ok: true } : { ok: false, reason: direct.output };
}

const readHistory = () => {
  const rows = readJson(historyFile(), []);
  return Array.isArray(rows) ? rows : [];
};

function appendHistory(entry) {
  writeJson(historyFile(), [entry, ...readHistory()].slice(0, MAX_HISTORY));
}

function runCommand(command, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn("cmd.exe", ["/c", command], { windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => {
      exec(`taskkill /PID ${child.pid} /T /F`, { windowsHide: true });
      resolve(1);
    }, timeoutMs);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(1);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}

async function runCleanupJob(dryRun) {
  const totals = await runScheduledCleanup(process.env, { dryRun });
  return {
    ok: true,
    freedBytes: totals.freedBytes,
    summary: `${totals.removed} arquivos removidos, ${totals.skipped} mantidos (recentes ou em uso).`,
    steps: [{ name: "Temporários e caches", ok: true }],
  };
}

async function runFullCheckJob(dryRun) {
  const steps = [];
  if (dryRun) {
    return {
      ok: true,
      summary: "Execução de teste: nenhum comando foi executado.",
      steps: FULL_CHECK_STEPS.map((s) => ({ name: s.name, ok: true })),
    };
  }

  const restore = await createRestorePoint("verificação agendada");
  steps.push({ name: "Ponto de restauração", ok: !!restore.ok, detail: restore.message });
  /* Sem ponto de restauração os reparos não rodam sem ninguém olhando. */
  if (!restore.ok) {
    return {
      ok: false,
      summary: `Verificação não executada: ${restore.message || "sem ponto de restauração."}`,
      steps,
    };
  }

  for (const step of FULL_CHECK_STEPS) {
    const code = await runCommand(step.command, REPAIR_STEP_TIMEOUT_MS);
    steps.push({
      name: step.name,
      ok: code === 0,
      detail: code === 0 ? undefined : `Código ${code}`,
    });
  }
  const failures = steps.filter((s) => !s.ok).length;
  return {
    ok: failures === 0,
    summary: failures
      ? `${failures} etapa(s) com erro. Abra o WinCare para detalhes.`
      : "Todas as etapas concluídas.",
    steps,
  };
}

/** Modo sem janela: chamado pelo Agendador de Tarefas com --wincare-job=<rotina>. */
async function runScheduledJob(job) {
  const def = JOBS[job];
  const dryRun = process.env.WINCARE_JOB_DRY_RUN === "1";
  const startedAt = new Date().toISOString();
  logger.log("schedule", "Rotina iniciada", { job, dryRun });

  let outcome;
  try {
    outcome = job === "cleanup" ? await runCleanupJob(dryRun) : await runFullCheckJob(dryRun);
  } catch (error) {
    outcome = {
      ok: false,
      summary: error instanceof Error ? error.message : "Falha na rotina agendada.",
      steps: [],
    };
  }

  appendHistory({
    id: `${job}-${Date.now()}`,
    job,
    label: def.label,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...outcome,
  });
  logger.log("schedule", "Rotina concluída", { job, ok: outcome.ok, summary: outcome.summary });

  if (Notification.isSupported() && !dryRun) {
    new Notification({ title: `WinCare: ${def.label}`, body: outcome.summary }).show();
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  return outcome.ok ? 0 : 1;
}

module.exports = {
  buildTaskXml,
  listSchedules,
  nextStartBoundary,
  normalizeConfig,
  parseJobArg,
  readHistory,
  removeSchedule,
  resolveSelfLaunch,
  runScheduledJob,
  runScheduleNow,
  setSchedule,
};
