import { useEffect, useState, useSyncExternalStore } from "react";
import { getNative, isNative, SIMULATED_DISKS, SIMULATED_SYSTEM } from "./bridge";
import { onPageVisible, pageHidden } from "./pageVisibility";
import { loadDisks, useSystemDataVersion } from "./systemData";
import type { DiskDrive, SystemInfo } from "./types";

const bootListeners = new Set<() => void>();
let firstSystemAttemptDone = false;

function notifyBootListeners() {
  bootListeners.forEach((listener) => listener());
}

function markFirstSystemAttemptDone() {
  if (firstSystemAttemptDone) return;
  firstSystemAttemptDone = true;
  notifyBootListeners();
}

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
          markFirstSystemAttemptDone();
          setInfo(data);
        } catch {
          // Mantém o último valor real ou o placeholder — nunca volta ao mock.
          markFirstSystemAttemptDone();
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
            ? Math.max(
                35,
                Math.min(95, Math.round(base.cpuTemperature + (Math.random() - 0.5) * 3)),
              )
            : 48;
        const gpuTemperature =
          typeof base.gpuTemperature === "number"
            ? Math.max(
                35,
                Math.min(95, Math.round(base.gpuTemperature + (Math.random() - 0.5) * 4)),
              )
            : 52;
        const memoryUsedGb = Math.round((memoryUsage / 100) * (base.memoryTotalGb || 32) * 10) / 10;
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
    // Escondida na bandeja/minimizada: não lê; ao voltar, lê na hora.
    const id = setInterval(() => {
      if (!pageHidden()) void tick();
    }, pollMs);
    const offVisible = onPageVisible(() => void tick());
    return () => {
      alive = false;
      clearInterval(id);
      offVisible();
    };
  }, [pollMs]);

  return info;
}

/** Unidades com estado de carga (para telas que mostram carregando/vazio). */
export function useDiskList() {
  const [disks, setDisks] = useState<DiskDrive[]>(initialDisks);
  const [loading, setLoading] = useState(
    () => typeof window !== "undefined" && isNative() && !nativeDisksCache,
  );
  // Lê de novo quando alguém invalida os dados (ex.: checkup rápido).
  const dataVersion = useSystemDataVersion();

  useEffect(() => {
    let alive = true;
    loadDisks()
      .then((rows) => {
        if (isNative()) nativeDisksCache = rows;
        if (alive) setDisks(rows);
      })
      .catch(() => {
        // Sem fallback mock no desktop.
        if (alive && !nativeDisksCache) setDisks([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  return { disks, loading };
}

export function useDisks() {
  return useDiskList().disks;
}

/** Útil para UI: true enquanto o desktop ainda não recebeu a 1ª amostra real. */
export function isSystemInfoLoading(info: SystemInfo) {
  return !info.simulated && info.hostname === "…" && !nativeInfoCache;
}

/** True no Electron até a primeira chamada de systemInfo terminar (sucesso ou erro). */
export function useAwaitingFirstSystemSample() {
  return useSyncExternalStore(
    (onStoreChange) => {
      bootListeners.add(onStoreChange);
      return () => bootListeners.delete(onStoreChange);
    },
    () => isNative() && !firstSystemAttemptDone && !nativeInfoCache,
    () => false,
  );
}
