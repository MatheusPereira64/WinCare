const { contextBridge, ipcRenderer } = require("electron");

const LAUNCHERS = /^(start ms-settings:|devmgmt|diskmgmt|services|regedit|eventvwr|taskmgr|control|cleanmgr)/i;

contextBridge.exposeInMainWorld("wincare", {
  run: (command, onData, options = {}) => {
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    if (LAUNCHERS.test(command.trim())) {
      const target = command.replace(/^start\s+/, "");
      return ipcRenderer.invoke("wincare:open", target);
    }

    const listener = (_e, payload) => {
      if (payload.runId === runId) onData(payload.chunk);
    };
    ipcRenderer.on("wincare:data", listener);

    return ipcRenderer
      .invoke("wincare:run", { command, runId, elevated: !!options.elevated })
      .finally(() => ipcRenderer.removeListener("wincare:data", listener));
  },
  systemInfo: () => ipcRenderer.invoke("wincare:systemInfo"),
  disks: () => ipcRenderer.invoke("wincare:disks"),
  isElevated: () => ipcRenderer.invoke("wincare:isElevated"),
  restartAsAdmin: () => ipcRenderer.invoke("wincare:restartAsAdmin"),
});
