/**
 * Janela escondida (na bandeja) ou minimizada: o Electron marca a página como
 * "hidden". Leituras periódicas pulam a vez — em segundo plano quem vigia é o
 * monitor leve do processo principal (electron/background.cjs).
 */
export const pageHidden = () =>
  typeof document !== "undefined" && document.visibilityState === "hidden";

/** Chama `onVisible` quando a janela volta a aparecer; devolve o cancelamento. */
export function onPageVisible(onVisible: () => void) {
  if (typeof document === "undefined") return () => {};
  const listener = () => {
    if (document.visibilityState === "visible") onVisible();
  };
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}
