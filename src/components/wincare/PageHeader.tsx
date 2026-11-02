import type { ComponentType, ReactNode } from "react";

interface Props {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: ReactNode;
  /** Selos ao lado do título. */
  badges?: ReactNode;
  /** Ações alinhadas à direita. */
  actions?: ReactNode;
}

export function PageHeader({ icon: Icon, title, subtitle, badges, actions }: Props) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon && (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {badges}
          </div>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
