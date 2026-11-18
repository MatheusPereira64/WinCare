import type { KeyboardEvent } from "react";

/**
 * Teclado de grupos de escolha única (radiogroup / tablist), padrão WAI-ARIA:
 * só o item selecionado fica no Tab; setas, Home e End andam entre os itens
 * e já selecionam (a seleção acompanha o foco).
 *
 * Use no onKeyDown do contêiner; `selector` identifica os itens.
 */
export function handleRovingKeyDown(event: KeyboardEvent<HTMLElement>, selector = "[role=radio]") {
  const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(selector)].filter(
    (el) => !(el as HTMLButtonElement).disabled && el.getAttribute("aria-disabled") !== "true",
  );
  if (items.length === 0) return;
  const current = items.indexOf(document.activeElement as HTMLElement);
  const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : forward
          ? (current + 1) % items.length
          : current < 0
            ? items.length - 1
            : (current - 1 + items.length) % items.length;
  event.preventDefault();
  items[next].focus();
  items[next].click();
}
