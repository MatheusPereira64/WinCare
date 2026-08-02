const { contextBridge, ipcRenderer } = require("electron");

const LAUNCHERS =
  /^(start ms-settings:|devmgmt|diskmgmt|services|regedit|eventvwr|taskmgr|control|cleanmgr)/i;

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
    const limitMs = options.timeoutMs || 60000;

    return withTimeout(
      ipcRenderer.invoke("wincare:run", {
        command,
        runId,
        elevated: !!options.elevated,
        timeoutMs: options.timeoutMs,
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
  systemInfo: () => ipcRenderer.invoke("wincare:systemInfo"),
  disks: () => ipcRenderer.invoke("wincare:disks"),
  isElevated: () => ipcRenderer.invoke("wincare:isElevated"),
  restartAsAdmin: () => ipcRenderer.invoke("wincare:restartAsAdmin"),
  clearStorage: () => ipcRenderer.invoke("wincare:clearStorage"),
});
