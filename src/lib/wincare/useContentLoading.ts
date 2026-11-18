import { useEffect, useState } from "react";

import { useAwaitingFirstSystemSample } from "./useSystem";

const SPLASH_MS = 900;
const BOOT_FAILSAFE_MS = 8000;

/**
 * Único carregamento de tela inteira: a abertura do app (marca + 1ª leitura
 * do sistema, no máximo 8 s). Trocar de página não mostra carregamento
 * artificial — cada tela mostra LoadingState onde ainda faltam dados
 * (docs/design-system.md → "Estados").
 */
export function useContentLoading() {
  const awaitingSystem = useAwaitingFirstSystemSample();
  const [splash, setSplash] = useState(true);
  const [bootStuck, setBootStuck] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSplash(false), SPLASH_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!awaitingSystem) return;
    const t = window.setTimeout(() => setBootStuck(true), BOOT_FAILSAFE_MS);
    return () => window.clearTimeout(t);
  }, [awaitingSystem]);

  const visible = splash || (awaitingSystem && !bootStuck);
  return { visible, label: "Lendo informações do sistema…" };
}
