import { cn } from "@/lib/utils";
import { handleRovingKeyDown } from "@/lib/wincare/roving";

interface Option<T> {
  value: T;
  label: string;
  /** Nome acessível quando o texto visível é curto demais (ex.: "#"). */
  ariaLabel?: string;
}

interface Props<T> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  /** "chip" (pílula) ou "letter" (quadrado compacto, filtro por inicial). */
  variant?: "chip" | "letter";
}

/**
 * Escolha única por botões (no Electron evitamos campos de texto e menus em portal).
 *
 * Acessibilidade: radiogroup com um único ponto no Tab; setas/Home/End trocam a
 * opção. O selecionado é preenchido (não só outra cor), visível também nos
 * temas de contraste do Windows.
 */
export function ChoiceChips<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
  variant = "chip",
}: Props<T>) {
  const hasSelection = options.some((o) => o.value === value);

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={(e) => handleRovingKeyDown(e)}
      className={cn("flex flex-wrap", variant === "letter" ? "gap-1" : "gap-1.5", className)}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel}
            tabIndex={active || (!hasSelection && index === 0) ? 0 : -1}
            disabled={disabled}
            onClick={() => {
              if (!active) onChange(option.value);
            }}
            className={cn(
              "border text-xs font-medium transition-colors disabled:opacity-50",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden",
              variant === "letter" ? "h-7 min-w-7 rounded-md px-1.5" : "rounded-full px-3 py-1",
              active
                ? "border-primary-solid bg-primary-solid text-primary-foreground forced-colors:forced-color-adjust-none forced-colors:border-[Highlight] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
                : variant === "letter"
                  ? "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  : "border-input/70 text-muted-foreground hover:border-input hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
