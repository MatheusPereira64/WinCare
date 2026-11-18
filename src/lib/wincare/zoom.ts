/**
 * Zoom da interface (Ctrl +, Ctrl −, Ctrl 0).
 *
 * No app desktop o fator vai para o zoom do Chromium (webFrame), que encolhe a
 * área útil em pixels CSS: os breakpoints e container queries reagem como se a
 * janela fosse menor, então o layout se reorganiza em vez de cortar conteúdo.
 */
export const ZOOM_LEVELS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

export const DEFAULT_ZOOM = 1;
export const MIN_ZOOM = ZOOM_LEVELS[0];
export const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

export type ZoomCommand = "in" | "out" | "reset";

/** Aceita só números dentro da faixa suportada; qualquer outra coisa volta a 100%. */
export function sanitizeZoom(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

/** Próximo nível da escala a partir do atual (funciona mesmo fora da lista). */
export function stepZoom(current: number, command: ZoomCommand): number {
  if (command === "reset") return DEFAULT_ZOOM;
  const value = sanitizeZoom(current);
  const epsilon = 0.001;
  if (command === "in") {
    return ZOOM_LEVELS.find((level) => level > value + epsilon) ?? MAX_ZOOM;
  }
  return [...ZOOM_LEVELS].reverse().find((level) => level < value - epsilon) ?? MIN_ZOOM;
}

export const formatZoom = (value: number) => `${Math.round(value * 100)}%`;
