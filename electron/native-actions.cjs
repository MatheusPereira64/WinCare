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
const history = require("./maintenance-history.cjs");
const {
  cancelScan,
  diskBreakdown,
  childrenOf,
  compareSnapshots,
  deleteSnapshot,
  fileOwners,
  findFiles,
  listSnapshots,
  publicDuplicates,
  publicPhotos,
  publicScan,
  reveal,
  saveSnapshot,
  scanForgotten,
  startDuplicates,
  startPhotos,
  startScan,
  trashFiles,
} = require("./storage-explorer.cjs");
const {
  bluetoothDevices,
  browserExtensions,
  cpuBreakdown,
  endProcess,
  listProcesses,
  networkStatus,
  securityStatus,
  speedTest,
} = require("./system-tools.cjs");
const { exportTable } = require("./exporter.cjs");

const plural = (n, one, many) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

/** Lista curta para o detalhe do histórico: "Chrome, Discord e mais 2". */
function shortList(names) {
  const list = [...new Set((names || []).filter(Boolean))];
  if (list.length <= 3) return list.join(", ");
  return `${list.slice(0, 3).join(", ")} e mais ${list.length - 3}`;
}

/* O que cada ação nativa deixa no histórico de manutenção (resultado real). */
const HISTORY = {
  cleaner(out) {
    if (!out || (!out.freedBytes && !out.removed)) return;
    history.recordEvent({
      kind: "cleanup",
      action: "cleaner",
      title: "Navegadores e apps limpos",
      detail: [shortList(out.apps), out.removed ? plural(out.removed, "arquivo", "arquivos") : ""]
        .filter(Boolean)
        .join(" · "),
      freedBytes: out.freedBytes,
      ok: true,
    });
  },
  uninstall(out) {
    // Cancelado ou ainda instalado: nada foi removido.
    if (!out || out.stillInstalled || out.ok === false) return;
    history.recordEvent({
      kind: "uninstall",
      action: "uninstall",
      title: `${out.programName || "Programa"} desinstalado`,
      subject: out.programName,
      // Tamanho informado pelo próprio programa no registro: é uma estimativa.
      freedBytes: out.sizeBytes,
      estimated: true,
      ok: true,
    });
  },
  leftovers(out) {
    if (!out || !out.removed) return;
    history.recordEvent({
      kind: "cleanup",
      action: "leftovers",
      title: out.programName
        ? `Sobras de ${out.programName} removidas`
        : "Sobras de programa removidas",
      subject: out.programName,
      detail: `${plural(out.removed, "item removido", "itens removidos")}${
        out.failed?.length ? ` · ${plural(out.failed.length, "falhou", "falharam")}` : ""
      }`,
      freedBytes: out.freedBytes,
      // Parte removida já liberou espaço; as falhas ficam no detalhe.
      ok: true,
    });
  },
  restorePoint(out) {
    // "recent": o Windows já tinha um ponto das últimas 24 h; "cancelled": UAC recusado.
    if (!out || out.status === "recent" || out.status === "cancelled") return;
    history.recordEvent({
      kind: "safety",
      action: "restore-point",
      title: out.ok ? "Ponto de restauração criado" : "Ponto de restauração não foi criado",
      detail: out.ok ? undefined : out.message,
      ok: !!out.ok,
    });
  },
};

/** Executa a ação e registra o resultado sem atrasar nem quebrar a resposta. */
const withHistory = (fn, note) => async (payload) => {
  const out = await fn(payload);
  try {
    note(out, payload);
  } catch (error) {
    logger.warn("history", "Falha ao registrar", error instanceof Error ? error.message : error);
  }
  return out;
};

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
  handle(
    "wincare:cleanerClean",
    withHistory(({ ids }) => cleanCleanerTargets(ids), HISTORY.cleaner),
  );

  handle("wincare:listPrograms", async () => ({
    ok: true,
    items: await listInstalledPrograms(),
  }));
  handle(
    "wincare:uninstallProgram",
    withHistory(({ id }) => runUninstaller(id), HISTORY.uninstall),
  );
  handle("wincare:scanLeftovers", ({ id }) => scanLeftovers(id));
  handle(
    "wincare:removeLeftovers",
    withHistory(({ ids }) => removeLeftovers(ids), HISTORY.leftovers),
  );

  handle(
    "wincare:createRestorePoint",
    withHistory(({ description }) => createRestorePoint(description), HISTORY.restorePoint),
  );

  handle("wincare:listSchedules", async () => ({
    ok: true,
    items: await listSchedules(),
    history: readHistory(),
  }));
  handle("wincare:setSchedule", ({ job, config }) => setSchedule(job, config));
  handle("wincare:removeSchedule", ({ job }) => removeSchedule(job));
  handle("wincare:runScheduleNow", ({ job }) => runScheduleNow(job));

  handle("wincare:maintenanceHistory", async () => ({
    ok: true,
    ...history.readHistory(),
    limits: { maxEvents: history.LIMITS.maxEvents, maxHealthDays: history.LIMITS.maxHealthDays },
  }));
  handle("wincare:clearMaintenanceHistory", async () => ({ ok: history.clearHistory() }));

  // Mapa do disco, busca, duplicados, fotos parecidas, esquecidos e análises salvas.
  handle("wincare:storageScanStart", (p) => startScan(p));
  handle("wincare:storageScanStatus", async () => publicScan());
  handle("wincare:storageScanCancel", async () => cancelScan());
  handle("wincare:storageChildren", async (p) => childrenOf(p));
  handle("wincare:storageFind", async (p) => findFiles(p));
  handle("wincare:storageOwners", (p) => fileOwners(p));
  handle("wincare:storageReveal", async (p) => reveal(p));
  handle("wincare:storageTrash", (p) => trashFiles(p));
  handle("wincare:storageDuplicatesStart", async (p) => startDuplicates(p));
  handle("wincare:storageDuplicates", async () => ({ ok: true, ...publicDuplicates() }));
  handle("wincare:storagePhotosStart", async () => startPhotos());
  handle("wincare:storagePhotos", async () => ({ ok: true, ...publicPhotos() }));
  handle("wincare:storageForgotten", (p) => scanForgotten(p));
  handle("wincare:storageSnapshots", async () => listSnapshots());
  handle("wincare:storageSnapshotSave", async () => saveSnapshot());
  handle("wincare:storageSnapshotDelete", async (p) => deleteSnapshot(p));
  handle("wincare:storageSnapshotCompare", async (p) => compareSnapshots(p));
  handle("wincare:exportTable", (p) => exportTable(p));
  handle("wincare:diskBreakdown", async (p) => diskBreakdown(p));

  // Processos, proteção, extensões, rede e Bluetooth.
  handle("wincare:processes", async () => ({ ok: true, items: await listProcesses() }));
  handle("wincare:endProcess", async (p) => endProcess(p));
  handle("wincare:securityStatus", () => securityStatus());
  handle("wincare:browserExtensions", async () => browserExtensions());
  handle("wincare:networkStatus", () => networkStatus());
  handle("wincare:speedTest", () => speedTest());
  handle("wincare:bluetooth", () => bluetoothDevices());
  handle("wincare:cpuBreakdown", async () => ({ ok: true, ...cpuBreakdown() }));
}

module.exports = { registerNativeActions };
