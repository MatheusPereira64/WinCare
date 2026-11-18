import { useEffect, useMemo, useState } from "react";

import { useIntel } from "./intelligenceStore";
import { buildRecommendations, partitionRecommendations } from "./recommendations";
import { useStore } from "./store";
import {
  loadBattery,
  loadDiskUsageFolders,
  loadSchedules,
  loadStartupItems,
  useSystemDataVersion,
} from "./systemData";
import type {
  BatteryReport,
  DiskUsageFolder,
  ScheduleEntry,
  StartupItem,
  SystemInfo,
} from "./types";
import { isSystemInfoLoading, useDisks } from "./useSystem";

/**
 * Junta tudo o que o motor de recomendações usa e separa o que aparece do que
 * o usuário adiou/ignorou. Leituras pesadas vêm do cache compartilhado
 * (systemData); `deferMs` adia essas leituras ao abrir a tela.
 */
export function useRecommendations(info: SystemInfo, { deferMs = 0 }: { deferMs?: number } = {}) {
  const disks = useDisks();
  const trend = useIntel((s) => s.samples);
  const startupNewIds = useIntel((s) => s.startupNewIds);
  const startupKnown = useIntel((s) => s.startupKnown);
  const dismissed = useStore((s) => s.dismissedRecommendations);
  const [startup, setStartup] = useState<StartupItem[] | undefined>(undefined);
  const [folders, setFolders] = useState<DiskUsageFolder[]>([]);
  const [schedules, setSchedules] = useState<ScheduleEntry[] | null>(null);
  const [battery, setBattery] = useState<BatteryReport | null>(null);
  // Invalidação (checkup, mudança na inicialização, limpeza) = ler de novo na hora.
  const dataVersion = useSystemDataVersion();

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      // Cada leitura é independente: se uma falhar, as regras dela só não rodam.
      void loadStartupItems().then(
        (items) => !cancelled && setStartup(items),
        () => {},
      );
      void loadDiskUsageFolders().then(
        (items) => !cancelled && setFolders(items),
        () => {},
      );
      void loadSchedules().then(
        (items) => !cancelled && setSchedules(items),
        () => {},
      );
      void loadBattery().then(
        (report) => !cancelled && setBattery(report),
        () => {},
      );
    }, deferMs);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [deferMs, dataVersion]);

  const newcomers = useMemo(() => {
    const ids = new Set(startupNewIds);
    return startupKnown.filter((k) => ids.has(k.id));
  }, [startupNewIds, startupKnown]);

  const loading = isSystemInfoLoading(info);
  const all = useMemo(
    () =>
      loading
        ? []
        : buildRecommendations({
            info,
            disks,
            schedules,
            startup,
            folders,
            newcomers,
            trend,
            battery,
          }),
    [loading, info, disks, schedules, startup, folders, newcomers, trend, battery],
  );

  const { active, hidden } = useMemo(
    () => partitionRecommendations(all, dismissed),
    [all, dismissed],
  );

  return { active, hidden, loading };
}
