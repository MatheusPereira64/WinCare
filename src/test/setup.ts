/**
 * Ambiente comum dos testes do renderer (Vitest + jsdom + Testing Library).
 * O que o jsdom não tem e os componentes usam é preenchido aqui.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { invalidateSystemData } from "@/lib/wincare/systemData";

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete (window as unknown as { wincare?: unknown }).wincare;
  // Cache das leituras compartilhadas (bateria, discos…) não passa de um teste para outro.
  invalidateSystemData();
});

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn();
