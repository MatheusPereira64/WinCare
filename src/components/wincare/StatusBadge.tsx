import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TONE_BADGE, TONE_FILL, type Tone } from "@/lib/wincare/tone";

/**
 * Selo de estado ("Seguro", "Ativa", "SMART OK"). O texto sempre diz o estado —
 * a cor reforça, nunca é a única pista.
 */
export function StatusBadge({
  tone = "neutral",
  dot,
  className,
  title,
  children,
}: {
  tone?: Tone;
  /** Ponto colorido antes do texto (estados "ao vivo"/resumo). */
  dot?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn("rounded-full font-medium", TONE_BADGE[tone], className)}
    >
      {dot && (
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_FILL[tone])} />
      )}
      {children}
    </Badge>
  );
}
