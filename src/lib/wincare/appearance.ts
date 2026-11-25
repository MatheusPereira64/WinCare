/**
 * Aparência personalizável: cor de destaque, fundo, modo (claro/escuro/
 * sistema) e layout (densidade, cantos, cartões, largura, animações).
 *
 * Tudo vira atributos no <html> (data-accent, data-surface…) que trocam poucas
 * variáveis de cor em src/styles.css — os componentes não mudam.
 */

export type AccentId =
  "blue" | "violet" | "emerald" | "amber" | "rose" | "cyan" | "crimson" | "graphite";
export type SurfaceId = "default" | "midnight" | "neutral" | "warm";
export type ThemeMode = "dark" | "light" | "system";
export type Density = "comfortable" | "compact";
export type Radius = "round" | "soft" | "square";
export type CardStyle = "glass" | "solid" | "outline";
export type ContentWidth = "limited" | "full";
export type Motion = "full" | "reduced";

export interface Appearance {
  accent: AccentId;
  surface: SurfaceId;
  density: Density;
  radius: Radius;
  cards: CardStyle;
  width: ContentWidth;
  motion: Motion;
}

export const DEFAULT_APPEARANCE: Appearance = {
  accent: "blue",
  surface: "default",
  density: "comfortable",
  radius: "round",
  cards: "glass",
  width: "limited",
  motion: "full",
};

/** Cores de destaque (tom OKLCH usado também nas miniaturas da tela). */
export const ACCENTS: { id: AccentId; label: string; hue: number; chroma: number }[] = [
  { id: "blue", label: "Azul", hue: 255, chroma: 1 },
  { id: "cyan", label: "Ciano", hue: 215, chroma: 1 },
  { id: "violet", label: "Violeta", hue: 295, chroma: 1 },
  { id: "rose", label: "Rosa", hue: 355, chroma: 1 },
  { id: "crimson", label: "Vermelho", hue: 25, chroma: 1 },
  { id: "amber", label: "Âmbar", hue: 62, chroma: 0.95 },
  { id: "emerald", label: "Esmeralda", hue: 160, chroma: 0.9 },
  { id: "graphite", label: "Grafite", hue: 255, chroma: 0.12 },
];

export const SURFACES: { id: SurfaceId; label: string; hint: string }[] = [
  { id: "default", label: "Padrão", hint: "Fundo levemente tingido pela cor de destaque" },
  {
    id: "midnight",
    label: "Meia-noite",
    hint: "Preto profundo, ótimo para telas OLED (tema escuro)",
  },
  { id: "neutral", label: "Neutro", hint: "Cinza sem tom de cor" },
  { id: "warm", label: "Quente", hint: "Tom de areia, mais aconchegante" },
];

export interface ThemePreset {
  id: string;
  label: string;
  description: string;
  mode: Exclude<ThemeMode, "system">;
  accent: AccentId;
  surface: SurfaceId;
}

/** Temas prontos: combinação de modo, destaque e fundo. */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "wincare",
    label: "WinCare",
    description: "O visual original",
    mode: "dark",
    accent: "blue",
    surface: "default",
  },
  {
    id: "midnight",
    label: "Meia-noite",
    description: "Preto profundo com ciano",
    mode: "dark",
    accent: "cyan",
    surface: "midnight",
  },
  {
    id: "amethyst",
    label: "Ametista",
    description: "Violeta sobre azul-noite",
    mode: "dark",
    accent: "violet",
    surface: "default",
  },
  {
    id: "forest",
    label: "Floresta",
    description: "Verde-esmeralda calmo",
    mode: "dark",
    accent: "emerald",
    surface: "default",
  },
  {
    id: "ember",
    label: "Brasa",
    description: "Âmbar quente no escuro",
    mode: "dark",
    accent: "amber",
    surface: "warm",
  },
  {
    id: "graphite",
    label: "Grafite",
    description: "Cinza sóbrio, sem cor",
    mode: "dark",
    accent: "graphite",
    surface: "neutral",
  },
  {
    id: "daylight",
    label: "Dia",
    description: "Claro com azul",
    mode: "light",
    accent: "blue",
    surface: "default",
  },
  {
    id: "lavender",
    label: "Lavanda",
    description: "Claro com violeta",
    mode: "light",
    accent: "violet",
    surface: "default",
  },
  {
    id: "paper",
    label: "Papel",
    description: "Claro, quente e discreto",
    mode: "light",
    accent: "crimson",
    surface: "warm",
  },
  {
    id: "blossom",
    label: "Flor",
    description: "Claro com rosa",
    mode: "light",
    accent: "rose",
    surface: "neutral",
  },
];

export interface LayoutPreset {
  id: string;
  label: string;
  description: string;
  values: Pick<Appearance, "density" | "radius" | "cards" | "width" | "motion">;
  /** Barra lateral expandida (true) ou só ícones (false). */
  sidebarOpen: boolean;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "default",
    label: "Padrão",
    description: "Confortável, cantos arredondados e cartões com brilho",
    values: {
      density: "comfortable",
      radius: "round",
      cards: "glass",
      width: "limited",
      motion: "full",
    },
    sidebarOpen: true,
  },
  {
    id: "compact",
    label: "Compacto",
    description: "Mais informação por tela e barra lateral só com ícones",
    values: {
      density: "compact",
      radius: "soft",
      cards: "solid",
      width: "limited",
      motion: "full",
    },
    sidebarOpen: false,
  },
  {
    id: "wide",
    label: "Amplo",
    description: "Conteúdo ocupando a janela toda, para monitores largos",
    values: {
      density: "comfortable",
      radius: "round",
      cards: "glass",
      width: "full",
      motion: "full",
    },
    sidebarOpen: true,
  },
  {
    id: "minimal",
    label: "Minimalista",
    description: "Só contornos, cantos retos e sem animações",
    values: {
      density: "comfortable",
      radius: "square",
      cards: "outline",
      width: "limited",
      motion: "reduced",
    },
    sidebarOpen: true,
  },
];

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Valores salvos de versões anteriores ou corrompidos voltam ao padrão. */
export function sanitizeAppearance(raw: unknown): Appearance {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<Appearance>;
  return {
    accent: pick(
      v.accent,
      ACCENTS.map((a) => a.id),
      DEFAULT_APPEARANCE.accent,
    ),
    surface: pick(
      v.surface,
      SURFACES.map((s) => s.id),
      DEFAULT_APPEARANCE.surface,
    ),
    density: pick(v.density, ["comfortable", "compact"] as const, DEFAULT_APPEARANCE.density),
    radius: pick(v.radius, ["round", "soft", "square"] as const, DEFAULT_APPEARANCE.radius),
    cards: pick(v.cards, ["glass", "solid", "outline"] as const, DEFAULT_APPEARANCE.cards),
    width: pick(v.width, ["limited", "full"] as const, DEFAULT_APPEARANCE.width),
    motion: pick(v.motion, ["full", "reduced"] as const, DEFAULT_APPEARANCE.motion),
  };
}

export const sanitizeThemeMode = (value: unknown, fallback: ThemeMode): ThemeMode =>
  pick(value, ["dark", "light", "system"] as const, fallback);

/** Tema efetivo: "Sistema" segue o claro/escuro do Windows. */
export function resolveTheme(mode: ThemeMode): "dark" | "light" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Escreve os atributos no <html> (o CSS faz o resto). Padrão = sem atributo. */
export function applyAppearance(appearance: Appearance) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(appearance)) {
    const attr = `data-${key}`;
    if (value === DEFAULT_APPEARANCE[key as keyof Appearance]) root.removeAttribute(attr);
    else root.setAttribute(attr, value);
  }
}

/** Qual tema/layout pronto corresponde à escolha atual (para marcar na tela). */
export function matchThemePreset(mode: ThemeMode, a: Appearance) {
  return THEME_PRESETS.find(
    (p) => p.mode === mode && p.accent === a.accent && p.surface === a.surface,
  )?.id;
}

export function matchLayoutPreset(a: Appearance, sidebarOpen: boolean) {
  return LAYOUT_PRESETS.find(
    (p) =>
      p.sidebarOpen === sidebarOpen &&
      (Object.keys(p.values) as (keyof LayoutPreset["values"])[]).every(
        (k) => p.values[k] === a[k],
      ),
  )?.id;
}
