import { useEffect } from "react";

import { loadMaintenanceHistory, onMaintenanceHistoryChanged } from "./bridge";
import type { MaintenanceHistory } from "./types";
import { useResource } from "./useResource";

export interface LoadedHistory extends MaintenanceHistory {
  /** Quando foi lido: base de "hoje", "últimos 7 dias" etc. */
  loadedAt: number;
}

async function load(): Promise<LoadedHistory> {
  const out = await loadMaintenanceHistory();
  if (!out.ok) throw new Error(out.reason);
  return { ...out, loadedAt: Date.now() };
}

/**
 * Histórico de manutenção com atualização automática: quando o app registra
 * uma ação (aviso do processo principal) e quando a janela volta ao foco
 * (a rotina agendada roda em outro processo e grava no mesmo arquivo).
 * Lido só no cliente — o HTML do servidor mostra o estado "carregando".
 */
export function useMaintenanceHistory() {
  const resource = useResource(load, {
    errorMessage: "Não foi possível ler o histórico de manutenção.",
  });
  const { reload } = resource;

  useEffect(() => {
    let timer: number | null = null;
    const refresh = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void reload();
      }, 300);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const off = onMaintenanceHistoryChanged(refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      off();
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reload]);

  return resource;
}
