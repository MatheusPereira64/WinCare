const { ipcMain } = require("electron");
const logger = require("./logger.cjs");
const cleaner = require("./cleaner.cjs");
const uninstaller = require("./uninstaller.cjs");
const scheduler = require("./scheduler.cjs");
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
    items: await cleaner.scanCleanerTargets(),
  }));
  handle("wincare:cleanerClean", ({ ids }) => cleaner.cleanCleanerTargets(ids));

  handle("wincare:listPrograms", async () => ({
    ok: true,
    items: await uninstaller.listInstalledPrograms(),
  }));
  handle("wincare:uninstallProgram", ({ id }) => uninstaller.runUninstaller(id));
  handle("wincare:scanLeftovers", ({ id }) => uninstaller.scanLeftovers(id));
  handle("wincare:removeLeftovers", ({ ids }) => uninstaller.removeLeftovers(ids));

  handle("wincare:createRestorePoint", ({ description }) => createRestorePoint(description));

  handle("wincare:listSchedules", async () => ({
    ok: true,
    items: await scheduler.listSchedules(),
    history: scheduler.readHistory(),
  }));
  handle("wincare:setSchedule", ({ job, config }) => scheduler.setSchedule(job, config));
  handle("wincare:removeSchedule", ({ job }) => scheduler.removeSchedule(job));
  handle("wincare:runScheduleNow", ({ job }) => scheduler.runScheduleNow(job));
}

module.exports = { registerNativeActions };
