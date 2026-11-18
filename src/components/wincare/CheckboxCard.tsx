import { useId, type ComponentType, type ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * Opção com caixa de seleção em destaque (ex.: "Criar ponto de restauração antes").
 * A área toda é clicável; título e descrição viram o nome e a descrição da caixa.
 */
export function CheckboxCard({
  checked,
  onCheckedChange,
  icon: Icon,
  title,
  description,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "surface-inset flex cursor-pointer items-start gap-3 p-3 hover:bg-muted/40",
        className,
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        aria-describedby={description ? `${id}-desc` : undefined}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          {Icon && <Icon aria-hidden className="size-4 text-success" />}
          {title}
        </span>
        {description && (
          <span id={`${id}-desc`} className="mt-0.5 block text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
