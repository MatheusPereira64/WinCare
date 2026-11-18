import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import { TONE_SOFT, type Tone } from "@/lib/wincare/tone";

type IconType = ComponentType<{ className?: string }>;

const SIZE = {
  sm: "size-8 rounded-lg [&_svg]:size-4",
  md: "size-10 rounded-xl [&_svg]:size-5",
  lg: "size-11 rounded-xl [&_svg]:size-5",
} as const;

/** Quadrado com ícone no tom (cabeçalhos de card, listas). Decorativo para o leitor de tela. */
export function IconChip({
  icon: Icon,
  tone = "primary",
  size = "md",
  className,
}: {
  icon: IconType;
  tone?: Tone;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center",
        SIZE[size],
        TONE_SOFT[tone],
        className,
      )}
    >
      <Icon />
    </span>
  );
}
