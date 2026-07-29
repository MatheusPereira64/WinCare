import { useEffect, useState } from "react";
import { getNative, SIMULATED_DISKS, SIMULATED_SYSTEM } from "./bridge";
import type { DiskDrive, SystemInfo } from "./types";

export function useSystemInfo(pollMs = 3000) {
  const [info, setInfo] = useState<SystemInfo>(SIMULATED_SYSTEM);

  useEffect(() => {
    let alive = true;
    const native = getNative();

    const tick = async () => {
      if (native) {
        try {
          const data = await native.systemInfo();
          if (alive) setInfo(data);
          return;
        } catch {
          /* fall through to simulation */
        }
      }
      if (!alive) return;
      setInfo((prev) => {
        const jitter = (v: number, amp: number) =>
          Math.max(3, Math.min(99, Math.round(v + (Math.random() - 0.5) * amp)));
        return { ...prev, cpuUsage: jitter(prev.cpuUsage, 14), memoryUsage: jitter(prev.memoryUsage, 5) };
      });
    };

    tick();
    const id = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return info;
}

export function useDisks() {
  const [disks, setDisks] = useState<DiskDrive[]>(SIMULATED_DISKS);
  useEffect(() => {
    const native = getNative();
    if (!native) return;
    native.disks().then(setDisks).catch(() => undefined);
  }, []);
  return disks;
}
