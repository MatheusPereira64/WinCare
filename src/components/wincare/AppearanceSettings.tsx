import type { ReactNode } from "react";
import { Check, LayoutTemplate, Palette, RotateCcw, SwatchBook } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ACCENTS,
  LAYOUT_PRESETS,
  matchLayoutPreset,
  matchThemePreset,
  SURFACES,
  THEME_PRESETS,
  type Appearance,
  type LayoutPreset,
  type SurfaceId,
  type ThemePreset,
} from "@/lib/wincare/appearance";
import { handleRovingKeyDown } from "@/lib/wincare/roving";
import { actions, useStore } from "@/lib/wincare/store";
import { ChoiceChips } from "./ChoiceChips";

/* ------------------------------ Miniaturas ------------------------------ */

/** Cores aproximadas de um tema (mesmas luminosidades do styles.css) para a miniatura. */
function previewColors(mode: "dark" | "light", accentId: string, surface: SurfaceId) {
  const accent = ACCENTS.find((a) => a.id === accentId) ?? ACCENTS[0];
  const sh = surface === "warm" ? 70 : accent.hue;
  const sc =
    surface === "neutral" ? 0 : surface === "warm" ? 0.7 : surface === "midnight" ? 0.6 : 1;
  const sl = surface === "midnight" && mode === "dark" ? -0.075 : 0;
  const s = (l: number, c: number) => `oklch(${l + sl} ${c * sc} ${sh})`;
  if (mode === "light") {
    return {
      bg: `oklch(0.95 ${0.01 * sc} ${sh})`,
      sidebar: `oklch(0.97 ${0.007 * sc} ${sh})`,
      card: "oklch(1 0 0)",
      line: `oklch(0.88 ${0.012 * sc} ${sh})`,
      text: `oklch(0.47 ${0.02 * sc} ${sh})`,
      accent: `oklch(0.48 ${0.18 * accent.chroma} ${accent.hue})`,
    };
  }
  return {
    bg: s(0.145, 0.02),
    sidebar: s(0.165, 0.022),
    card: s(0.195, 0.024),
    line: s(0.29, 0.024),
    text: `oklch(0.71 ${0.02 * sc} ${sh})`,
    accent: `oklch(0.7 ${0.17 * accent.chroma} ${accent.hue})`,
  };
}

function ThemeThumb({ preset }: { preset: ThemePreset }) {
  const c = previewColors(preset.mode, preset.accent, preset.surface);
  return (
    <div
      aria-hidden
      className="flex h-16 overflow-hidden rounded-lg border"
      style={{ background: c.bg, borderColor: c.line }}
    >
      <div
        className="flex w-5 flex-col items-center gap-1 py-1.5"
        style={{ background: c.sidebar }}
      >
        <span className="size-2 rounded-sm" style={{ background: c.accent }} />
        <span className="h-0.5 w-2.5 rounded-full" style={{ background: c.text, opacity: 0.6 }} />
        <span className="h-0.5 w-2.5 rounded-full" style={{ background: c.text, opacity: 0.6 }} />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-1.5">
        <div className="flex-1 rounded-md p-1" style={{ background: c.card }}>
          <span className="block h-1 w-1/2 rounded-full" style={{ background: c.text }} />
          <span className="mt-1 block h-1.5 w-3/4 rounded-full" style={{ background: c.accent }} />
        </div>
        <div className="flex gap-1">
          <span className="h-3 flex-1 rounded-md" style={{ background: c.card }} />
          <span className="h-3 flex-1 rounded-md" style={{ background: c.card }} />
        </div>
      </div>
    </div>
  );
}

function LayoutThumb({ preset }: { preset: LayoutPreset }) {
  const { density, radius, cards, width } = preset.values;
  const r = radius === "square" ? 1 : radius === "soft" ? 3 : 5;
  const gap = density === "compact" ? 2 : 4;
  const cardStyle =
    cards === "outline"
      ? { border: "1px solid var(--border)", background: "transparent" }
      : { background: "color-mix(in oklab, var(--primary) 18%, var(--card))" };
  return (
    <div
      aria-hidden
      className="flex h-16 overflow-hidden rounded-lg border border-border bg-background"
    >
      <div className={cn("bg-sidebar", preset.sidebarOpen ? "w-7" : "w-3")} />
      <div className="flex flex-1 justify-center p-1.5">
        <div className={cn("flex flex-col", width === "full" ? "w-full" : "w-4/5")} style={{ gap }}>
          {Array.from({ length: density === "compact" ? 4 : 3 }, (_, i) => (
            <span key={i} className="flex-1" style={{ ...cardStyle, borderRadius: r }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Peças ------------------------------ */

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Palette;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon aria-hidden className="size-4 text-primary" /> {title}
        </h3>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function PresetCard({
  active,
  focusable,
  label,
  description,
  thumb,
  onSelect,
}: {
  active: boolean;
  /** Recebe o Tab (o marcado, ou o primeiro quando nenhum está marcado). */
  focusable: boolean;
  label: string;
  description: string;
  thumb: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={focusable ? 0 : -1}
      onClick={onSelect}
      className={cn(
        "group relative space-y-2 rounded-xl border bg-card/60 p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring",
        active
          ? "border-primary ring-2 ring-primary/30"
          : "border-border/70 hover:border-primary/50",
      )}
    >
      {thumb}
      <span className="block px-0.5">
        <span className="flex items-center gap-1 text-sm font-semibold">
          {label}
          {active && <Check aria-hidden className="size-3.5 text-primary" />}
        </span>
        <span className="block text-[11px] leading-snug text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/* ------------------------------ Tela ------------------------------ */

/**
 * Configurações → Aparência: temas prontos, modo, cor de destaque, fundo,
 * layouts prontos e ajustes finos. Tudo aplica na hora e fica salvo.
 */
export function AppearanceSettings() {
  const themeMode = useStore((s) => s.themeMode);
  const appearance = useStore((s) => s.appearance);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const activeTheme = matchThemePreset(themeMode, appearance);
  const activeLayout = matchLayoutPreset(appearance, sidebarOpen);
  const set = (patch: Partial<Appearance>) => actions.setAppearance(patch);
  // Sem preset marcado (combinação própria), o primeiro recebe o Tab.
  const focusable = (id: string, index: number, active: string | undefined) =>
    active ? active === id : index === 0;

  return (
    <div className="space-y-6" data-wincare-appearance>
      <Section
        icon={SwatchBook}
        title="Temas prontos"
        hint="Escolha um para trocar modo, cor e fundo de uma vez."
      >
        <div
          role="radiogroup"
          aria-label="Temas prontos"
          onKeyDown={(e) => handleRovingKeyDown(e)}
          className="grid grid-cols-2 gap-2.5 @lg/main:grid-cols-3 @2xl/main:grid-cols-5"
        >
          {THEME_PRESETS.map((preset, i) => (
            <PresetCard
              key={preset.id}
              active={activeTheme === preset.id}
              focusable={focusable(preset.id, i, activeTheme)}
              label={preset.label}
              description={preset.description}
              thumb={<ThemeThumb preset={preset} />}
              onSelect={() => actions.applyThemePreset(preset.id)}
            />
          ))}
        </div>
      </Section>

      <Section icon={Palette} title="Cores" hint="Ou monte o seu: os ajustes abaixo valem na hora.">
        <div className="grid gap-4 @xl/main:grid-cols-2">
          <Field label="Modo">
            <ChoiceChips
              label="Modo de cor"
              value={themeMode}
              options={[
                { value: "dark", label: "Escuro" },
                { value: "light", label: "Claro" },
                { value: "system", label: "Igual ao Windows" },
              ]}
              onChange={actions.setThemeMode}
            />
          </Field>
          <Field label="Fundo">
            <ChoiceChips
              label="Fundo"
              value={appearance.surface}
              options={SURFACES.map((s) => ({ value: s.id, label: s.label }))}
              onChange={(surface) => set({ surface })}
            />
            <p className="text-[11px] text-muted-foreground">
              {SURFACES.find((s) => s.id === appearance.surface)?.hint}
            </p>
          </Field>
        </div>
        <Field label="Cor de destaque">
          <div
            role="radiogroup"
            aria-label="Cor de destaque"
            onKeyDown={(e) => handleRovingKeyDown(e)}
            className="flex flex-wrap gap-2.5"
          >
            {ACCENTS.map((accent) => {
              const active = appearance.accent === accent.id;
              return (
                <button
                  key={accent.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={accent.label}
                  title={accent.label}
                  tabIndex={active ? 0 : -1}
                  onClick={() => set({ accent: accent.id })}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border-2 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active ? "scale-110 border-foreground" : "border-transparent hover:scale-105",
                  )}
                  style={{ background: `oklch(0.62 ${0.19 * accent.chroma} ${accent.hue})` }}
                >
                  {active && <Check aria-hidden className="size-4 text-white drop-shadow" />}
                </button>
              );
            })}
          </div>
        </Field>
      </Section>

      <Section
        icon={LayoutTemplate}
        title="Layout"
        hint="Densidade, cantos, cartões e barra lateral."
      >
        <div
          role="radiogroup"
          aria-label="Layouts prontos"
          onKeyDown={(e) => handleRovingKeyDown(e)}
          className="grid grid-cols-2 gap-2.5 @2xl/main:grid-cols-4"
        >
          {LAYOUT_PRESETS.map((preset, i) => (
            <PresetCard
              key={preset.id}
              active={activeLayout === preset.id}
              focusable={focusable(preset.id, i, activeLayout)}
              label={preset.label}
              description={preset.description}
              thumb={<LayoutThumb preset={preset} />}
              onSelect={() => actions.applyLayoutPreset(preset.id)}
            />
          ))}
        </div>

        <div className="grid gap-4 rounded-xl border border-border/60 bg-card/40 p-4 @xl/main:grid-cols-2">
          <Field label="Densidade">
            <ChoiceChips
              label="Densidade"
              value={appearance.density}
              options={[
                { value: "comfortable", label: "Confortável" },
                { value: "compact", label: "Compacta" },
              ]}
              onChange={(density) => set({ density })}
            />
          </Field>
          <Field label="Cantos">
            <ChoiceChips
              label="Cantos"
              value={appearance.radius}
              options={[
                { value: "round", label: "Arredondados" },
                { value: "soft", label: "Suaves" },
                { value: "square", label: "Retos" },
              ]}
              onChange={(radius) => set({ radius })}
            />
          </Field>
          <Field label="Cartões">
            <ChoiceChips
              label="Estilo dos cartões"
              value={appearance.cards}
              options={[
                { value: "glass", label: "Com brilho" },
                { value: "solid", label: "Sólidos" },
                { value: "outline", label: "Só contorno" },
              ]}
              onChange={(cards) => set({ cards })}
            />
          </Field>
          <Field label="Largura do conteúdo">
            <ChoiceChips
              label="Largura do conteúdo"
              value={appearance.width}
              options={[
                { value: "limited", label: "Centralizada" },
                { value: "full", label: "Janela toda" },
              ]}
              onChange={(width) => set({ width })}
            />
          </Field>
          <Field label="Barra lateral">
            <ChoiceChips
              label="Barra lateral"
              value={sidebarOpen ? "open" : "icons"}
              options={[
                { value: "open", label: "Expandida" },
                { value: "icons", label: "Só ícones" },
              ]}
              onChange={(v) => actions.setSidebarOpen(v === "open")}
            />
          </Field>
          <Field label="Animações">
            <ChoiceChips
              label="Animações"
              value={appearance.motion}
              options={[
                { value: "full", label: "Ligadas" },
                { value: "reduced", label: "Desligadas" },
              ]}
              onChange={(motion) => set({ motion })}
            />
          </Field>
        </div>
      </Section>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={actions.resetAppearance}
        >
          <RotateCcw /> Restaurar aparência padrão
        </Button>
      </div>
    </div>
  );
}
