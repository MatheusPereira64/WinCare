import type { ComponentType, ReactNode } from "react";

interface Props {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
        <Icon className="size-6" />
      </span>
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
