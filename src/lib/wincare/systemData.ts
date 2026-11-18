import { useEffect, useState, useSyncExternalStore } from "react";

import {
  getNative,
  isNative,
  listSchedules,
  loadBatteryReport,
  SIMULATED_DISK_USAGE,
  SIMULATED_DISKS,
  SIMULATED_STARTUP,
} from "./bridge";
import type {
  BatteryReport,
  DiskDrive,
  DiskUsageFolder,
  ScheduleEntry,
  StartupItem,
} from "./types";

/*
 * Leituras compartilhadas entre telas (Dashboard e Inteligência) com cache curto:
 * evita repetir IPC pesado (ícones da inicialização, varredura de pastas) a cada
 * troca de página. Telas que alteram esses dados chamam `invalidateSystemData`,
 * e quem usa `useSystemDataVersion` lê de novo na hora (recomendações, discos).
 */

const TTL_MS = 60_000;

interface Entry<T> {
  at: number;
  promise: Promise<T>;
}

const cache = new Map<string, Entry<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = load().catch((err) => {
    cache.delete(key); // falha não fica em cache
    throw err;
  });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

type DataKey = "startup" | "folders" | "schedules" | "disks" | "battery";

let version = 0;
const versionListeners = new Set<() => void>();

export function invalidateSystemData(key?: DataKey) {
  if (key) cache.delete(key);
  else cache.clear();
  version += 1;
  versionListeners.forEach((listener) => listener());
}

/** Muda a cada invalidação: use como dependência para ler de novo. */
export function useSystemDataVersion() {
  return useSyncExternalStore(
    (onChange) => {
      versionListeners.add(onChange);
      return () => versionListeners.delete(onChange);
    },
    () => version,
    () => 0,
  );
}

export function loadDisks(): Promise<DiskDrive[]> {
  return cached("disks", async () => {
    const native = getNative();
    if (!native) return SIMULATED_DISKS;
    const rows = await native.disks();
    return Array.isArray(rows) ? rows : [];
  });
}

export function loadStartupItems(): Promise<StartupItem[]> {
  return cached("startup", async () => {
    const native = getNative();
    if (!native?.listStartup) return isNative() ? [] : SIMULATED_STARTUP;
    const list = await native.listStartup();
    return Array.isArray(list) ? list : [];
  });
}

export function loadDiskUsageFolders(): Promise<DiskUsageFolder[]> {
  return cached("folders", async () => {
    const native = getNative();
    if (!native?.diskUsage) return isNative() ? [] : SIMULATED_DISK_USAGE;
    const list = await native.diskUsage();
    return Array.isArray(list) ? list : [];
  });
}

export function loadSchedules(): Promise<ScheduleEntry[]> {
  return cached("schedules", async () => {
    const out = await listSchedules();
    if (!out.ok) throw new Error(out.reason);
    return out.items;
  });
}

/** Relatório de bateria (gerar o do Windows leva ~1 s; Sistema, Dashboard e recomendações dividem). */
export function loadBattery(): Promise<BatteryReport> {
  return cached("battery", loadBatteryReport);
}

/**
 * Relatório de bateria compartilhado (Dashboard). null enquanto carrega ou se
 * a leitura falhar — quem usa trata como "sem bateria" e não mostra nada.
 */
export function useBatteryReport(): BatteryReport | null {
  const [report, setReport] = useState<BatteryReport | null>(null);
  const dataVersion = useSystemDataVersion();
  useEffect(() => {
    let cancelled = false;
    void loadBattery().then(
      (value) => !cancelled && setReport(value),
      () => !cancelled && setReport(null),
    );
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);
  return report;
}
