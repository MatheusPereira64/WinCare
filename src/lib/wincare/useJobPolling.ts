import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Acompanha um trabalho longo do processo principal (duplicados, fotos):
 * consulta a cada 500 ms enquanto `state === "running"`.
 */
export function useJobPolling<T extends { state: string }>(read: () => Promise<T>) {
  const [state, setState] = useState<T | null>(null);
  const timer = useRef<number | null>(null);
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });

  const poll = useCallback(async () => {
    const run = async () => {
      if (timer.current) window.clearTimeout(timer.current);
      const next = await readRef.current().catch(() => null);
      if (!next) return;
      setState(next);
      if (next.state === "running") timer.current = window.setTimeout(() => void run(), 500);
    };
    await run();
  }, []);

  useEffect(() => {
    void poll();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [poll]);

  return { state, setState, poll };
}
