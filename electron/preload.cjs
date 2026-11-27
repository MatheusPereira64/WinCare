const { contextBridge, ipcRenderer, webFrame } = require("electron");

/* Mesma faixa da tela de Configurações (80%–200%); o resto é ignorado. */
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 2;
const ZOOM_COMMANDS = new Set(["in", "out", "reset"]);

const LAUNCHERS =
  /^(start ms-settings:|devmgmt|diskmgmt|services|regedit|eventvwr|taskmgr|control|cleanmgr|rstrui|SystemPropertiesProtection)/i;

/** Um único listener IPC para comandos longos com streaming. */
const streamHandlers = new Map();

ipcRenderer.on("wincare:data", (_e, payload) => {
  const handler = streamHandlers.get(payload.runId);
  if (handler) handler(payload.chunk);
});

const withTimeout = (promise, timeoutMs) => {
  const limitMs = timeoutMs + 8000;
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error(`Tempo limite de ${Math.round(limitMs / 1000)}s atingido.`)),
      limitMs,
    );
  });
  return Promise.race([promise, timeoutPromise]);
};

contextBridge.exposeInMainWorld("wincare", {
  run: (command, onData, options = {}) => {
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    if (LAUNCHERS.test(command.trim())) {
      const target = command.replace(/^start\s+/, "");
      return ipcRenderer.invoke("wincare:open", target);
    }

    streamHandlers.set(runId, onData);
    // Alinha com o main: reparos longos (sfc/dism/chkdsk) têm 30 min sem timeoutMs explícito.
    const isLongRepair = /^(sfc|dism|chkdsk)(\.exe)?(\s|$)/i.test(String(command || "").trim());
    const limitMs = options.timeoutMs || (isLongRepair ? 30 * 60 * 1000 : 60000);

    return withTimeout(
      ipcRenderer.invoke("wincare:run", {
        command,
        runId,
        elevated: !!options.elevated,
        timeoutMs: options.timeoutMs || (isLongRepair ? limitMs : undefined),
      }),
      limitMs,
    )
      .then((result) => {
        if (result?.output && onData) onData(result.output);
        return { code: result.code, result: result.result, output: result.output };
      })
      .finally(() => {
        streamHandlers.delete(runId);
      });
  },
  getLogPath: () => ipcRenderer.invoke("wincare:getLogPath"),
  getAppVersion: () => ipcRenderer.invoke("wincare:getAppVersion"),
  checkForUpdate: () => ipcRenderer.invoke("wincare:checkForUpdate"),
  applyUpdate: () => ipcRenderer.invoke("wincare:applyUpdate"),
  openReleasePage: () => ipcRenderer.invoke("wincare:openReleasePage"),
  onUpdateProgress: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on("wincare:updateProgress", listener);
    return () => ipcRenderer.removeListener("wincare:updateProgress", listener);
  },
  onUpdateAvailable: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on("wincare:updateAvailable", listener);
    return () => ipcRenderer.removeListener("wincare:updateAvailable", listener);
  },
  optimizeMemory: () => ipcRenderer.invoke("wincare:optimizeMemory"),
  systemInfo: () => ipcRenderer.invoke("wincare:systemInfo"),
  disks: () => ipcRenderer.invoke("wincare:disks"),
  listStartup: () => ipcRenderer.invoke("wincare:listStartup"),
  setStartupEnabled: (id, enabled) =>
    ipcRenderer.invoke("wincare:setStartupEnabled", { id, enabled }),
  topProcesses: () => ipcRenderer.invoke("wincare:topProcesses"),
  diskUsage: () => ipcRenderer.invoke("wincare:diskUsage"),
  clearDiskFolder: (id) => ipcRenderer.invoke("wincare:clearDiskFolder", { id }),
  storageIntel: () => ipcRenderer.invoke("wincare:storageIntel"),
  powerPlan: (payload) => ipcRenderer.invoke("wincare:powerPlan", payload || {}),
  batteryReport: () => ipcRenderer.invoke("wincare:batteryReport"),
  openBatteryReport: () => ipcRenderer.invoke("wincare:openBatteryReport"),
  saveTextFile: (content, defaultName, title) =>
    ipcRenderer.invoke("wincare:saveTextFile", { content, defaultName, title }),
  isElevated: () => ipcRenderer.invoke("wincare:isElevated"),
  restartAsAdmin: () => ipcRenderer.invoke("wincare:restartAsAdmin"),
  clearStorage: () => ipcRenderer.invoke("wincare:clearStorage"),
  setNativeTheme: (theme) => ipcRenderer.invoke("wincare:setNativeTheme", theme),
  setZoomFactor: (factor) => {
    const value = Number(factor);
    if (!Number.isFinite(value)) return;
    webFrame.setZoomFactor(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)));
  },
  onPageShortcut: (handler) => {
    const listener = (_e, digit) => {
      if (typeof digit === "string" && /^[0-9]$/.test(digit)) handler(digit);
    };
    ipcRenderer.on("wincare:pageShortcut", listener);
    return () => ipcRenderer.removeListener("wincare:pageShortcut", listener);
  },
  onShowShortcuts: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("wincare:showShortcuts", listener);
    return () => ipcRenderer.removeListener("wincare:showShortcuts", listener);
  },
  onZoomCommand: (handler) => {
    const listener = (_e, command) => {
      if (ZOOM_COMMANDS.has(command)) handler(command);
    };
    ipcRenderer.on("wincare:zoomCommand", listener);
    return () => ipcRenderer.removeListener("wincare:zoomCommand", listener);
  },
  cleanerScan: () => ipcRenderer.invoke("wincare:cleanerScan"),
  cleanerClean: (ids) => ipcRenderer.invoke("wincare:cleanerClean", { ids }),
  listPrograms: () => ipcRenderer.invoke("wincare:listPrograms"),
  uninstallProgram: (id) => ipcRenderer.invoke("wincare:uninstallProgram", { id }),
  scanLeftovers: (id) => ipcRenderer.invoke("wincare:scanLeftovers", { id }),
  removeLeftovers: (ids) => ipcRenderer.invoke("wincare:removeLeftovers", { ids }),
  createRestorePoint: (description) =>
    ipcRenderer.invoke("wincare:createRestorePoint", { description }),
  listSchedules: () => ipcRenderer.invoke("wincare:listSchedules"),
  setSchedule: (job, config) => ipcRenderer.invoke("wincare:setSchedule", { job, config }),
  removeSchedule: (job) => ipcRenderer.invoke("wincare:removeSchedule", { job }),
  runScheduleNow: (job) => ipcRenderer.invoke("wincare:runScheduleNow", { job }),
  maintenanceHistory: () => ipcRenderer.invoke("wincare:maintenanceHistory"),
  clearMaintenanceHistory: () => ipcRenderer.invoke("wincare:clearMaintenanceHistory"),
  backgroundState: () => ipcRenderer.invoke("wincare:backgroundState"),
  setBackgroundSettings: (patch) => ipcRenderer.invoke("wincare:setBackgroundSettings", patch),
  checkAlertsNow: () => ipcRenderer.invoke("wincare:checkAlertsNow"),
  snoozeAlerts: (hours) => ipcRenderer.invoke("wincare:snoozeAlerts", { hours }),
  testNotification: () => ipcRenderer.invoke("wincare:testNotification"),
  takeTrayCommand: () => ipcRenderer.invoke("wincare:takeTrayCommand"),
  onBackgroundChanged: (handler) => {
    const listener = (_e, state) => handler(state);
    ipcRenderer.on("wincare:backgroundChanged", listener);
    return () => ipcRenderer.removeListener("wincare:backgroundChanged", listener);
  },
  onTrayCommand: (handler) => {
    const listener = (_e, command) => {
      if (command && typeof command.type === "string") handler(command);
    };
    ipcRenderer.on("wincare:trayCommand", listener);
    return () => ipcRenderer.removeListener("wincare:trayCommand", listener);
  },
  // Armazenamento: só ids e escolhas de lista chegam ao processo principal.
  storageScanStart: (options) => ipcRenderer.invoke("wincare:storageScanStart", options || {}),
  storageScanStatus: () => ipcRenderer.invoke("wincare:storageScanStatus"),
  storageScanCancel: () => ipcRenderer.invoke("wincare:storageScanCancel"),
  storageChildren: (id) => ipcRenderer.invoke("wincare:storageChildren", { id }),
  storageFind: (filters) => ipcRenderer.invoke("wincare:storageFind", filters || {}),
  storageOwners: (ids) => ipcRenderer.invoke("wincare:storageOwners", { ids }),
  storageReveal: (id) => ipcRenderer.invoke("wincare:storageReveal", { id }),
  storageTrash: (ids, source) => ipcRenderer.invoke("wincare:storageTrash", { ids, source }),
  storageDuplicatesStart: (minSize) =>
    ipcRenderer.invoke("wincare:storageDuplicatesStart", { minSize }),
  storageDuplicates: () => ipcRenderer.invoke("wincare:storageDuplicates"),
  storagePhotosStart: () => ipcRenderer.invoke("wincare:storagePhotosStart"),
  storagePhotos: () => ipcRenderer.invoke("wincare:storagePhotos"),
  storageForgotten: (age) => ipcRenderer.invoke("wincare:storageForgotten", { age }),
  storageSnapshots: () => ipcRenderer.invoke("wincare:storageSnapshots"),
  storageSnapshotSave: () => ipcRenderer.invoke("wincare:storageSnapshotSave"),
  storageSnapshotDelete: (id) => ipcRenderer.invoke("wincare:storageSnapshotDelete", { id }),
  storageSnapshotCompare: (a, b) => ipcRenderer.invoke("wincare:storageSnapshotCompare", { a, b }),
  exportTable: (payload) => ipcRenderer.invoke("wincare:exportTable", payload),
  diskBreakdown: (drive, refresh) =>
    ipcRenderer.invoke("wincare:diskBreakdown", { drive, refresh: !!refresh }),
  diskHealth: (details) => ipcRenderer.invoke("wincare:diskHealth", { details: !!details }),
  programUpdates: () => ipcRenderer.invoke("wincare:programUpdates"),
  updateProgram: (id) => ipcRenderer.invoke("wincare:updateProgram", { id }),
  processes: () => ipcRenderer.invoke("wincare:processes"),
  endProcess: (pid) => ipcRenderer.invoke("wincare:endProcess", { pid }),
  securityStatus: () => ipcRenderer.invoke("wincare:securityStatus"),
  browserExtensions: () => ipcRenderer.invoke("wincare:browserExtensions"),
  networkStatus: () => ipcRenderer.invoke("wincare:networkStatus"),
  speedTest: () => ipcRenderer.invoke("wincare:speedTest"),
  bluetooth: () => ipcRenderer.invoke("wincare:bluetooth"),
  cpuBreakdown: () => ipcRenderer.invoke("wincare:cpuBreakdown"),
  shortcuts: () => ipcRenderer.invoke("wincare:shortcuts"),
  bootTimes: () => ipcRenderer.invoke("wincare:bootTimes"),
  setShortcuts: (patch) => ipcRenderer.invoke("wincare:setShortcuts", patch || {}),
  panelExpand: (expanded) => ipcRenderer.invoke("wincare:panelExpand", { expanded: !!expanded }),
  panelClose: () => ipcRenderer.invoke("wincare:panelClose"),
  panelOpenApp: (to) => ipcRenderer.invoke("wincare:panelOpenApp", { to }),
  onPanelVisibility: (handler) => {
    const listener = (_e, visible) => handler(!!visible);
    ipcRenderer.on("wincare:panelVisibility", listener);
    return () => ipcRenderer.removeListener("wincare:panelVisibility", listener);
  },
  onHistoryChanged: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("wincare:historyChanged", listener);
    return () => ipcRenderer.removeListener("wincare:historyChanged", listener);
  },
});
