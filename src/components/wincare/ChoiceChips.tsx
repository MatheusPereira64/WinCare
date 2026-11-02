import { cn } from "@/lib/utils";

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

/** Seleção por botões: no Electron evitamos campos de texto e menus em portal. */
export function ChoiceChips<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: Props<T>) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border/70 text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
