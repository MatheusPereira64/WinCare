import { useCallback, useEffect } from "react";

import { getBackgroundState, onBackgroundChanged, updateBackgroundSettings } from "./bridge";
import type { BackgroundSettingsPatch, BackgroundState } from "./types";
import { useResource } from "./useResource";

async function load(): Promise<BackgroundState> {
  const state = await getBackgroundState();
  if (!state.ok) throw new Error(state.reason);
  return state;
}

/**
 * Estado da bandeja e dos alertas, atualizado sozinho quando o processo
 * principal verifica algo ou quando a bandeja muda uma opção.
 */
export function useBackground() {
  const resource = useResource(load, {
    errorMessage: "Não foi possível ler as opções de segundo plano.",
  });
  const { setData } = resource;

  useEffect(() => onBackgroundChanged((state) => setData(state)), [setData]);

  const update = useCallback(
    async (patch: BackgroundSettingsPatch) => {
      const state = await updateBackgroundSettings(patch);
      setData(state);
      return state;
    },
    [setData],
  );

  return { ...resource, update };
}
