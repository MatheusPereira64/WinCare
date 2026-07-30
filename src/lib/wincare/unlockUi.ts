/** Limpa locks de pointer/scroll/inert deixados pelo Radix (Dialog, AlertDialog, Sheet). */
export function unlockUi() {
  if (typeof document === "undefined") return;

  document.body.style.removeProperty("pointer-events");
  document.body.style.pointerEvents = "";
  document.body.style.removeProperty("overflow");
  document.body.style.overflow = "";
  document.body.removeAttribute("data-scroll-locked");
  document.documentElement.removeAttribute("data-scroll-locked");
  document.documentElement.style.removeProperty("overflow");

  const root = document.getElementById("root");
  if (root) {
    root.removeAttribute("inert");
    root.removeAttribute("aria-hidden");
    root.removeAttribute("data-aria-hidden");
    if (root instanceof HTMLElement) {
      root.style.pointerEvents = "";
    }
  }

  document.querySelectorAll<HTMLElement>("[inert]").forEach((el) => {
    if (el.closest("[data-radix-portal]")) return;
    el.removeAttribute("inert");
  });

  document.querySelectorAll<HTMLElement>('[aria-hidden="true"]').forEach((el) => {
    if (el.closest("[data-radix-portal]")) return;
    if (el.id === "root" || el.hasAttribute("data-aria-hidden")) {
      el.removeAttribute("aria-hidden");
      el.removeAttribute("data-aria-hidden");
    }
  });

  // Remove overlays órfãos — inclusive com data-state=open se não houver content ativo.
  document
    .querySelectorAll<HTMLElement>("[data-radix-alert-dialog-overlay], [data-radix-dialog-overlay]")
    .forEach((el) => {
      const portal = el.closest("[data-radix-portal]");
      const hasOpenContent = portal?.querySelector(
        '[data-radix-alert-dialog-content][data-state="open"], [data-radix-dialog-content][data-state="open"]',
      );
      if (!hasOpenContent) {
        el.remove();
        portal
          ?.querySelectorAll("[data-radix-alert-dialog-content], [data-radix-dialog-content]")
          .forEach((n) => {
            if (n.getAttribute("data-state") !== "open") n.remove();
          });
      }
    });
}
