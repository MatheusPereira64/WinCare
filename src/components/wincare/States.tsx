import type { ComponentType, ReactNode } from "react";
import { CircleAlert, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Resource } from "@/lib/wincare/useResource";
import type { Tone } from "@/lib/wincare/tone";
import { IconChip } from "./IconChip";

/*
 * Estados padrão de conteúdo (docs/design-system.md → "Estados"):
 *   carregando → LoadingState (esqueleto no formato do conteúdo + frase curta)
 *   erro       → ErrorState  (o que falhou + "Tentar novamente")
 *   vazio      → EmptyState  (o que não há + o que fazer)
 * ResourceView aplica a regra a partir de um useResource.
 */

const SKELETON = {
  list: (rows: number) => (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  ),
  cards: (rows: number) => (
    <div className="grid gap-4 @4xl/main:grid-cols-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-48 rounded-2xl" />
      ))}
    </div>
  ),
  block: () => <Skeleton className="h-28 w-full rounded-2xl" />,
};

/**
 * Conteúdo ainda sem dados. Mostra o formato do que vem (sem "pulo" ao chegar)
 * e diz o que está acontecendo; o Narrador anuncia a frase uma vez.
 */
export function LoadingState({
  label,
  variant = "list",
  rows = 3,
  className,
}: {
  /** O que está sendo feito, terminando em "…" ("Lendo programas instalados…"). */
  label: string;
  variant?: keyof typeof SKELETON;
  rows?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-2", className)}>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin" />
        {label}
      </p>
      <div aria-hidden>{SKELETON[variant](rows)}</div>
    </div>
  );
}

/** Falha ao carregar algo que ainda não tinha dados na tela. */
export function ErrorState({
  title = "Não foi possível carregar",
  description,
  onRetry,
  retrying,
  secondaryAction,
  size = "md",
  className,
}: {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  /** Outra saída além de tentar de novo (ex.: "Ir para o início"). */
  secondaryAction?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 text-center",
        size === "sm" ? "px-4 py-5" : "px-6 py-10",
        className,
      )}
    >
      <IconChip icon={CircleAlert} tone="danger" size={size === "sm" ? "sm" : "md"} />
      <div>
        <p className="font-medium">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {(onRetry || secondaryAction) && (
        <div className="flex flex-wrap justify-center gap-2">
          {onRetry && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRetry}
              disabled={retrying}
            >
              {retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Tentar novamente
            </Button>
          )}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

/** Nada para mostrar: diz o que não há e, se fizer sentido, o que fazer. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "neutral",
  size = "md",
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** "success" para estados positivos ("Nada pendente"). */
  tone?: Tone;
  /** sm: dentro de cards, sem borda tracejada. */
  size?: "sm" | "md";
  className?: string;
}) {
  if (size === "sm") {
    return (
      <div className={cn("flex items-center gap-3 py-2", className)}>
        <IconChip icon={icon} tone={tone} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{title}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-10 text-center",
        className,
      )}
    >
      <IconChip icon={icon} tone={tone} size="lg" />
      <div>
        <p className="font-medium">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/**
 * Aplica a regra de estados a um recurso carregado com useResource:
 * sem dados → LoadingState; falhou sem dados → ErrorState com "Tentar novamente";
 * dados vazios → `empty`; senão o conteúdo. Atualizando com dados na tela, o
 * conteúdo continua visível (marcado com aria-busy) e só o botão gira.
 */
export function ResourceView<T>({
  resource,
  loading,
  errorTitle,
  isEmpty,
  empty,
  children,
}: {
  resource: Resource<T>;
  loading: ReactNode;
  errorTitle: string;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const { status, data, error, reload, refreshing } = resource;
  if (status === "loading" || (data === undefined && status !== "error")) return <>{loading}</>;
  if (status === "error" || data === undefined) {
    return (
      <ErrorState
        title={errorTitle}
        description={error ?? undefined}
        onRetry={() => void reload()}
        retrying={refreshing}
      />
    );
  }
  if (isEmpty?.(data) && empty) return <>{empty}</>;
  return <div aria-busy={refreshing || undefined}>{children(data)}</div>;
}
