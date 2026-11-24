import { useCallback, useEffect, useRef, useState } from "react";

import { scanCancel, scanStart, scanStatus, type ScanStatus } from "./explorer";

/**
 * Estado da análise de disco (unidade ou pasta). Enquanto varre, consulta o
 * processo principal a cada 400 ms. `version` muda quando há dados novos
 * (análise concluída ou arquivos removidos): as abas recarregam por ela.
 */
export function useStorageScan() {
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [version, setVersion] = useState(0);
  const [starting, setStarting] = useState(false);
  const timer = useRef<number | null>(null);
  const alive = useRef(true);

  const stopPolling = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const poll = useCallback(async () => {
    const run = async () => {
      stopPolling();
      const next = await scanStatus().catch(() => null);
      if (!alive.current || !next) return;
      setStatus((prev) => {
        if (next.state === "done" && prev?.state !== "done") setVersion((v) => v + 1);
        return next;
      });
      if (next.state === "scanning") timer.current = window.setTimeout(() => void run(), 400);
    };
    await run();
  }, []);

  useEffect(() => {
    alive.current = true;
    void poll();
    return () => {
      alive.current = false;
      stopPolling();
    };
  }, [poll]);

  const start = useCallback(
    async (target: "drive" | "folder", drive?: string) => {
      setStarting(true);
      try {
        const out = await scanStart({ target, drive });
        if (out.ok) {
          setStatus(out);
          void poll();
        }
        return out;
      } finally {
        setStarting(false);
      }
    },
    [poll],
  );

  const cancel = useCallback(async () => {
    await scanCancel();
    await poll();
  }, [poll]);

  /** Depois de mandar arquivos para a Lixeira: totais e mapa mudam. */
  const invalidate = useCallback(() => {
    setVersion((v) => v + 1);
    void poll();
  }, [poll]);

  return { status, version, starting, start, cancel, invalidate };
}

export type StorageScan = ReturnType<typeof useStorageScan>;
