import { useEffect, useRef, useState } from "react";

import { pageHidden } from "./pageVisibility";

/** Últimas N leituras de um valor (gráficos dos dashboards). */
export function useHistory(value: number | null | undefined, size = 30) {
  const [values, setValues] = useState<number[]>([]);
  useEffect(() => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    setValues((prev) => [...prev, value].slice(-size));
  }, [value, size]);
  return values;
}

/** Lê algo a cada `ms` (pausa com a janela escondida). `enabled` liga e desliga. */
export function usePolling<T>(load: () => Promise<T>, ms: number, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = () => {
      if (pageHidden()) return;
      loadRef
        .current()
        .then((d) => alive && setData(d))
        .catch(() => undefined);
    };
    tick();
    const id = window.setInterval(tick, ms);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [ms, enabled]);
  return data;
}
