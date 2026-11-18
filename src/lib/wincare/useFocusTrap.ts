import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable=true]",
].join(",");

/** Atributo que o `unlockUi()` respeita: inert colocado de propósito por um modal aberto. */
export const INERT_MARKER = "data-wincare-inert";

/** Elementos alcançáveis por Tab dentro de `root`, na ordem do documento. */
function getFocusable(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      !el.closest("[inert]") &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== "hidden",
  );
}

/* Pilha de armadilhas ativas: só a do topo reage ao teclado. */
const stack: symbol[] = [];
let inertCount = 0;

function setAppInert(on: boolean) {
  const root = document.getElementById("root");
  if (!root) return;
  inertCount = Math.max(0, inertCount + (on ? 1 : -1));
  if (inertCount > 0) {
    root.setAttribute("inert", "");
    root.setAttribute(INERT_MARKER, "");
  } else {
    root.removeAttribute("inert");
    root.removeAttribute(INERT_MARKER);
  }
}

interface Options {
  /** Elemento que recebe o foco ao abrir (padrão: o próprio contêiner). */
  initialFocus?: () => HTMLElement | null | undefined;
  /**
   * Torna o resto do app inerte (fora da árvore de acessibilidade e sem
   * clique/foco). Use em modais renderizados em portal fora de #root.
   */
  inertApp?: boolean;
}

/**
 * Mantém o foco do teclado dentro de `ref` enquanto `active`:
 * Tab e Shift+Tab circulam, foco que escapa volta, e ao fechar o foco
 * retorna para onde estava (botão que abriu o diálogo).
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  options: Options = {},
) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const id = Symbol("focus-trap");
    stack.push(id);
    const isTop = () => stack[stack.length - 1] === id;
    const previous = document.activeElement as HTMLElement | null;
    const { inertApp } = optionsRef.current;
    const inertHere = !!inertApp && !document.getElementById("root")?.contains(container);
    if (inertHere) setAppInert(true);

    const focusInitial = () => {
      const target = optionsRef.current.initialFocus?.() ?? container;
      if (target === container && !container.hasAttribute("tabindex")) {
        container.setAttribute("tabindex", "-1");
      }
      target.focus({ preventScroll: true });
    };
    // Depois da pintura: o conteúdo do diálogo já está no DOM.
    const raf = requestAnimationFrame(focusInitial);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !isTop()) return;
      const items = getFocusable(container);
      if (items.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement as HTMLElement | null;
      const inside = !!current && container.contains(current);
      if (event.shiftKey && (!inside || current === first || current === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || current === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!isTop()) return;
      const target = event.target as Node | null;
      if (target && !container.contains(target)) {
        (getFocusable(container)[0] ?? container).focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      const index = stack.indexOf(id);
      if (index >= 0) stack.splice(index, 1);
      if (inertHere) setAppInert(false);
      // Devolve o foco a quem abriu; se o botão sumiu (ex.: programa desinstalado),
      // vai para o conteúdo da página em vez de cair no <body>.
      requestAnimationFrame(() => {
        if (previous && previous.isConnected && previous !== document.body) {
          previous.focus({ preventScroll: true });
        } else if (document.activeElement === document.body) {
          document.getElementById("conteudo")?.focus({ preventScroll: true });
        }
      });
    };
  }, [active, ref]);
}
