/**
 * Limpa locks de pointer/scroll/inert deixados pelo Radix (Dialog/Sheet).
 *
 * IMPORTANTE: nunca remove nós do DOM gerenciados pelo React — isso no Electron
 * deixa a UI “morta” (scroll nativo ainda funciona, cliques não).
 */
export function unlockUi() {
  if (typeof document === "undefined") return;

  const clearPe = (el: HTMLElement | null | undefined) => {
    if (!el) return;
    if (el.style.pointerEvents === "none") {
      el.style.removeProperty("pointer-events");
    }
  };

  clearPe(document.body);
  clearPe(document.documentElement);
  document.body.style.removeProperty("overflow");
  document.documentElement.style.removeProperty("overflow");
  document.body.removeAttribute("data-scroll-locked");
  document.documentElement.removeAttribute("data-scroll-locked");
  document.body.removeAttribute("inert");

  const root = document.getElementById("root");
  if (root instanceof HTMLElement) {
    root.removeAttribute("inert");
    root.removeAttribute("aria-hidden");
    root.removeAttribute("data-aria-hidden");
    clearPe(root);
  }

  for (const child of document.body.children) {
    if (!(child instanceof HTMLElement)) continue;
    clearPe(child);
    if (child.hasAttribute("inert") && !child.hasAttribute("data-radix-portal")) {
      child.removeAttribute("inert");
    }
  }

  // Overlays Radix fechados às vezes ficam com opacity 0 e ainda capturam clique.
  document
    .querySelectorAll<HTMLElement>(
      "[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay], [data-vaul-overlay]",
    )
    .forEach((overlay) => {
      const state = overlay.getAttribute("data-state");
      if (state !== "open") {
        overlay.style.pointerEvents = "none";
      }
    });

  document.querySelectorAll<HTMLElement>("[inert]").forEach((el) => {
    if (el.closest('[data-state="open"]')) return;
    el.removeAttribute("inert");
  });
}

/** Reaplica unlock após navegação, sem destruir árvore React. */
export function watchAndUnlockUi(durationMs = 2500): () => void {
  if (typeof document === "undefined") return () => undefined;

  let muted = false;
  const run = () => {
    if (muted) return;
    muted = true;
    try {
      unlockUi();
    } finally {
      window.setTimeout(() => {
        muted = false;
      }, 30);
    }
  };

  run();
  const timers = [0, 100, 400, 1000, durationMs].map((ms) => window.setTimeout(run, ms));

  const obs = new MutationObserver((mutations) => {
    // Só reage a mudanças de atributos de lock — não a childList (evita loops).
    const relevant = mutations.some(
      (m) =>
        m.type === "attributes" &&
        (m.attributeName === "style" ||
          m.attributeName === "inert" ||
          m.attributeName === "data-scroll-locked" ||
          m.attributeName === "aria-hidden"),
    );
    if (relevant) run();
  });

  obs.observe(document.body, {
    attributes: true,
    attributeFilter: ["style", "data-scroll-locked", "inert", "aria-hidden"],
  });
  if (rootExists()) {
    obs.observe(document.getElementById("root")!, {
      attributes: true,
      attributeFilter: ["style", "inert", "aria-hidden", "data-aria-hidden"],
    });
  }

  return () => {
    timers.forEach((id) => window.clearTimeout(id));
    obs.disconnect();
    unlockUi();
  };
}

function rootExists() {
  return !!document.getElementById("root");
}
