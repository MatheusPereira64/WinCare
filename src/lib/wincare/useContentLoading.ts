import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import { useAwaitingFirstSystemSample } from "./useSystem";

const SPLASH_MS = 900;
const NAV_MS = 450;
const BOOT_FAILSAFE_MS = 8000;

/**
 * Loading global: splash na abertura, 1ª amostra nativa do sistema, e troca de rota.
 */
export function useContentLoading() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const routerPending = useRouterState({ select: (s) => s.status === "pending" });
  const awaitingSystem = useAwaitingFirstSystemSample();
  const [splash, setSplash] = useState(true);
  const [navBusy, setNavBusy] = useState(false);
  const [bootStuck, setBootStuck] = useState(false);
  const firstNav = useRef(true);

  useEffect(() => {
    const t = window.setTimeout(() => setSplash(false), SPLASH_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!awaitingSystem) return;
    const t = window.setTimeout(() => setBootStuck(true), BOOT_FAILSAFE_MS);
    return () => window.clearTimeout(t);
  }, [awaitingSystem]);

  useEffect(() => {
    if (firstNav.current) {
      firstNav.current = false;
      return;
    }
    setNavBusy(true);
    const t = window.setTimeout(() => setNavBusy(false), NAV_MS);
    return () => window.clearTimeout(t);
  }, [pathname]);

  const booting = splash || (awaitingSystem && !bootStuck);
  const visible = booting || navBusy || routerPending;
  const label = booting ? "Lendo informações do sistema…" : "Carregando…";

  return { visible, label };
}
