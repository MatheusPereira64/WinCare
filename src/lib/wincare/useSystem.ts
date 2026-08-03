import { useEffect, useState } from "react";
import { getNative, isNative, SIMULATED_DISKS, SIMULATED_SYSTEM } from "./bridge";
import type { DiskDrive, SystemInfo } from "./types";

/** Última amostra nativa — evita flash do mock ao trocar de aba. */
let nativeInfoCache: SystemInfo | null = null;
let nativeDisksCache: DiskDrive[] | null = null;

const NATIVE_PLACEHOLDER: SystemInfo = {
  hostname: "…",
  osName: "Carregando informações do sistema…",
  build: "—",
  cpuUsage: 0,
  memoryUsage: 0,
  memoryTotalGb: 0,
  memoryUsedGb: null,
  diskUsage: 0,
  diskTotalGb: 0,
  uptime: "—",
  defenderStatus: "—",
  lastUpdate: "—",
  health: 0,
  simulated: false,
  cpuTemperature: null,
  memoryTemperature: null,
  gpuName: null,
  gpuUsage: null,
  gpuTemperature: null,
  gpuMemoryUsedMb: null,
  gpuMemoryTotalMb: null,
  gpuMemoryUsage: null,
};

function initialSystemInfo(): SystemInfo {
  if (typeof window !== "undefined" && isNative()) {
    return nativeInfoCache ?? NATIVE_PLACEHOLDER;
  }
  return SIMULATED_SYSTEM;
}

function initialDisks(): DiskDrive[] {
  if (typeof window !== "undefined" && isNative()) {
    return nativeDisksCache ?? [];
  }
  return SIMULATED_DISKS;
}

/**
 * No app desktop (Electron): só dados reais — sem DESKTOP-WINCARE / simulação.
 * No navegador: mantém demo com SIMULATED_SYSTEM.
 */
export function useSystemInfo(pollMs = 3000) {
  const [info, setInfo] = useState<SystemInfo>(initialSystemInfo);

  useEffect(() => {
    let alive = true;
    const native = getNative();

    const tick = async () => {
      if (native) {
        try {
          const data = await native.systemInfo();
          if (!alive) return;
          nativeInfoCache = data;
          setInfo(data);
        } catch {
          // Mantém o último valor real ou o placeholder — nunca volta ao mock.
          if (alive && !nativeInfoCache) {
            setInfo(NATIVE_PLACEHOLDER);
          }
        }
        return;
      }

      // Somente modo demonstração (browser sem bridge).
      if (!alive) return;
      setInfo((prev) => {
        const base = prev.simulated ? prev : SIMULATED_SYSTEM;
        const jitter = (v: number, amp: number) =>
          Math.max(3, Math.min(99, Math.round(v + (Math.random() - 0.5) * amp)));
        const cpuUsage = jitter(base.cpuUsage, 14);
        const memoryUsage = jitter(base.memoryUsage, 5);
        const gpuUsage =
          typeof base.gpuUsage === "number" ? jitter(base.gpuUsage, 12) : jitter(20, 10);
        const cpuTemperature =
          typeof base.cpuTemperature === "number"
            ? Math.max(35, Math.min(95, Math.round(base.cpuTemperature + (Math.random() - 0.5) * 3)))
            : 48;
        const gpuTemperature =
          typeof base.gpuTemperature === "number"
            ? Math.max(35, Math.min(95, Math.round(base.gpuTemperature + (Math.random() - 0.5) * 4)))
            : 52;
        const memoryUsedGb =
          Math.round(((memoryUsage / 100) * (base.memoryTotalGb || 32)) * 10) / 10;
        return {
          ...base,
          simulated: true,
          cpuUsage,
          memoryUsage,
          memoryUsedGb,
          gpuUsage,
          cpuTemperature,
          gpuTemperature,
          gpuMemoryUsage:
            typeof base.gpuMemoryUsage === "number"
              ? jitter(base.gpuMemoryUsage, 8)
              : jitter(25, 8),
        };
      });
    };

    void tick();
    const id = setInterval(() => void tick(), pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return info;
}

export function useDisks() {
  const [disks, setDisks] = useState<DiskDrive[]>(initialDisks);

  useEffect(() => {
    const native = getNative();
    if (!native) {
      setDisks(SIMULATED_DISKS);
      return;
    }
    native
      .disks()
      .then((rows) => {
        nativeDisksCache = rows;
        setDisks(rows);
      })
      .catch(() => {
        // Sem fallback mock no desktop.
        if (!nativeDisksCache) setDisks([]);
      });
  }, []);

  return disks;
}

/** Útil para UI: true enquanto o desktop ainda não recebeu a 1ª amostra real. */
export function isSystemInfoLoading(info: SystemInfo) {
  return !info.simulated && info.hostname === "…" && !nativeInfoCache;
}
