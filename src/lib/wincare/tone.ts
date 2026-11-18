/**
 * Tons semânticos do design system (ver docs/design-system.md).
 *
 * Todo estado colorido da interface usa um destes cinco tons — nunca uma cor
 * solta. As classes ficam escritas por extenso para o Tailwind encontrá-las.
 */
export type Tone = "neutral" | "primary" | "success" | "warning" | "danger";

/** Texto/ícone no tom (>= 4,5:1 nos dois temas). */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

/** Fundo suave + texto: chips de ícone e marcadores de severidade. */
export const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
};

/** Selo (badge): borda + fundo bem leve + texto. */
export const TONE_BADGE: Record<Tone, string> = {
  neutral: "border-border text-muted-foreground",
  primary: "border-primary/30 bg-primary/10 text-primary",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

/** Preenchimento sólido de barras e pontos de status. */
export const TONE_FILL: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

/** Caixa de aviso dentro de cards e diálogos (borda + fundo leve + texto). */
export const TONE_CALLOUT: Record<Tone, string> = {
  neutral: "border-border bg-muted/40 text-muted-foreground",
  primary: "border-primary/30 bg-primary/10 text-primary",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

/** Tom pelo nível de uso de um recurso (CPU, RAM, disco). */
export function usageTone(percent: number): Tone {
  if (percent >= 90) return "danger";
  if (percent >= 75) return "warning";
  return "primary";
}
