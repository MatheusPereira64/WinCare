import * as React from "react";

/**
 * `true` enquanto a área visível (em pixels CSS) for mais estreita que `breakpoint`.
 *
 * Lê o valor já no primeiro render (useSyncExternalStore), sem o "pulo" de um
 * layout largo que só depois se ajusta. Com zoom ou escala do Windows a
 * largura CSS já vem reduzida, então os mesmos limites valem para tudo.
 */
export function useViewportBelow(breakpoint: number) {
  const query = `(max-width: ${breakpoint - 0.02}px)`;

  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
