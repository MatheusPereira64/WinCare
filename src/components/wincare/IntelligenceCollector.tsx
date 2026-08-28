import { useEffect, useRef } from "react";

import { getNative, isNative, SIMULATED_STARTUP } from "@/lib/wincare/bridge";
import {
  detectGameProcess,
  detectStartupChanges,
  mergeStartupWatch,
  sampleFromSystem,
} from "@/lib/wincare/intelligence";
import { getIntelState, hydrateIntelligence, intelActions } from "@/lib/wincare/intelligenceStore";
import type { TopProcess } from "@/lib/wincare/types";
import { useSystemInfo } from "@/lib/wincare/useSystem";

const SIM_PROCESSES: TopProcess[] = [
  { name: "chrome", pid: 1204, cpu: 18, memMb: 890 },
  { name: "cs2", pid: 5510, cpu: 44, memMb: 2100 },
];

/**
 * Roda no layout raiz: grava saúde, detecta boot novo e sessões de jogo
 * mesmo quando a aba Inteligência não está aberta.
 */
export function IntelligenceCollector() {
  const info = useSystemInfo(8000);
  const idleTicks = useRef(0);
  const infoRef = useRef(info);
  infoRef.current = info;

  useEffect(() => {
    hydrateIntelligence();
  }, []);

  useEffect(() => {
    if (!info.hostname || info.hostname === "…") return;
    intelActions.recordSample(sampleFromSystem(info));
  }, [info.hostname, info.health, info.cpuUsage, info.memoryUsage, info.diskUsage]);

  useEffect(() => {
    let cancelled = false;
    const bootWatch = async () => {
      try {
        const native = getNative();
        const list = native?.listStartup ? await native.listStartup() : SIMULATED_STARTUP;
        if (cancelled || !Array.isArray(list)) return;
        const known = getIntelState().startupKnown;
        const { added } = detectStartupChanges(list, known);
        const merged = mergeStartupWatch(list, known);
        const newIds = known.length === 0 ? [] : added.map((a) => a.id);
        intelActions.setStartupWatch(merged, newIds);
      } catch {
        /* ignore */
      }
    };
    const t = window.setTimeout(() => void bootWatch(), 2500);
    const id = window.setInterval(() => void bootWatch(), 3 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const tickGames = async () => {
      if (inFlight) return;
      inFlight = true;
      const snapshot = infoRef.current;
      const native = getNative();
      let processes: TopProcess[] = [];
      try {
        processes = native?.topProcesses
          ? await native.topProcesses()
          : isNative()
            ? []
            : SIM_PROCESSES;
      } catch {
        processes = [];
      } finally {
        inFlight = false;
      }
      if (cancelled) return;
      const game = detectGameProcess(processes, snapshot.gpuUsage);
      const active = getIntelState().activeSession;
      if (game) {
        idleTicks.current = 0;
        if (active && active.game === game) {
          intelActions.tickSession(snapshot.cpuUsage, snapshot.memoryUsage, snapshot.gpuUsage ?? null);
        } else {
          intelActions.startSession(game, snapshot.cpuUsage, snapshot.memoryUsage, snapshot.gpuUsage ?? null);
        }
      } else if (active) {
        idleTicks.current += 1;
        if (idleTicks.current >= 3) intelActions.endSession();
      }
    };
    const id = window.setInterval(() => void tickGames(), 15000);
    const first = window.setTimeout(() => void tickGames(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.clearTimeout(first);
    };
  }, []);

  return null;
}
