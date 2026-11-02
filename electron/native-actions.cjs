const { ipcMain } = require("electron");
const logger = require("./logger.cjs");
const { cleanCleanerTargets, scanCleanerTargets } = require("./cleaner.cjs");
const {
  listInstalledPrograms,
  removeLeftovers,
  runUninstaller,
  scanLeftovers,
} = require("./uninstaller.cjs");
const {
  listSchedules,
  readHistory,
  removeSchedule,
  runScheduleNow,
  setSchedule,
} = require("./scheduler.cjs");
const { createRestorePoint } = require("./restore-point.cjs");

/** Registra um handler que devolve `{ ok: false, reason }` em vez de rejeitar no renderer. */
function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, payload) => {
    try {
      return await fn(payload ?? {});
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Falha inesperada.";
      logger.error("native", `${channel} falhou`, reason);
      return { ok: false, reason };
    }
  });
}

function registerNativeActions() {
  handle("wincare:cleanerScan", async () => ({
    ok: true,
    items: await scanCleanerTargets(),
  }));
  handle("wincare:cleanerClean", ({ ids }) => cleanCleanerTargets(ids));

  handle("wincare:listPrograms", async () => ({
    ok: true,
    items: await listInstalledPrograms(),
  }));
  handle("wincare:uninstallProgram", ({ id }) => runUninstaller(id));
  handle("wincare:scanLeftovers", ({ id }) => scanLeftovers(id));
  handle("wincare:removeLeftovers", ({ ids }) => removeLeftovers(ids));

  handle("wincare:createRestorePoint", ({ description }) => createRestorePoint(description));

  handle("wincare:listSchedules", async () => ({
    ok: true,
    items: await listSchedules(),
    history: readHistory(),
  }));
  handle("wincare:setSchedule", ({ job, config }) => setSchedule(job, config));
  handle("wincare:removeSchedule", ({ job }) => removeSchedule(job));
  handle("wincare:runScheduleNow", ({ job }) => runScheduleNow(job));
}

module.exports = { registerNativeActions };
