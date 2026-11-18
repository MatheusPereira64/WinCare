import { forwardRef, type ComponentType, type HTMLAttributes, type ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/wincare/tone";
import { IconChip } from "./IconChip";

const PADDING = {
  sm: "p-4",
  md: "p-5",
  lg: "p-5 @xl/main:p-6",
} as const;

const VARIANT = {
  default: "surface-panel border-border/60",
  /** Destaque da página (um por tela, no máximo). */
  hero: "hero-panel border-border/60",
  /** Card que leva a algum lugar ao clicar. */
  interactive: "surface-panel hover-lift border-border/60",
} as const;

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof VARIANT;
  padding?: keyof typeof PADDING;
}

/**
 * Superfície padrão de conteúdo (card). Borda, sombra, raio, espaçamento
 * interno e entre blocos vêm daqui — não repita essas classes à mão.
 */
export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  ({ variant = "default", padding = "md", className, ...props }, ref) => (
    <Card
      ref={ref}
      className={cn("gap-4", VARIANT[variant], PADDING[padding], className)}
      {...props}
    />
  ),
);
Panel.displayName = "Panel";

/**
 * Cabeçalho de card: ícone no tom, título, selos, descrição e ações à direita
 * (que descem para a linha de baixo quando falta espaço).
 */
export function PanelHeader({
  icon,
  tone = "primary",
  title,
  titleAs: Title = "h2",
  titleId,
  badges,
  description,
  actions,
  size = "md",
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  tone?: Tone;
  title: ReactNode;
  titleAs?: "h2" | "h3";
  titleId?: string;
  badges?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** sm: ícone 32px e título menor (cards compactos). */
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      {/* basis-64: com pouco espaço as ações descem para a linha de baixo em vez de espremer o texto. */}
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
        {icon && <IconChip icon={icon} tone={tone} size={size === "sm" ? "sm" : "md"} />}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Title
              id={titleId}
              className={cn(
                "font-semibold tracking-tight",
                size === "sm" ? "text-base" : "text-lg",
              )}
            >
              {title}
            </Title>
            {badges}
          </div>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Lista dentro de um card (programas, execuções, histórico). Passe os <li>
 * como filhos; o divisor e a moldura vêm daqui.
 */
export function ListPanel({
  label,
  className,
  children,
}: {
  /** Nome da lista para o leitor de tela ("Programas instalados"). */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("overflow-hidden rounded-2xl border border-border/60 bg-card/60", className)}
    >
      <ul aria-label={label} className="divide-y divide-border/60">
        {children}
      </ul>
    </div>
  );
}
