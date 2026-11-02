import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Brain,
  HardDrive,
  Info,
  Monitor,
  Rocket,
  Sparkles,
  Wifi,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppPath, Recommendation } from "@/lib/wincare/intelligence";

const severityMeta: Record<
  Recommendation["severity"],
  { label: string; icon: typeof AlertCircle; className: string }
> = {
  high: {
    label: "Alta",
    icon: AlertCircle,
    className: "bg-destructive/12 text-destructive",
  },
  medium: {
    label: "Média",
    icon: AlertTriangle,
    className: "bg-warning/12 text-warning",
  },
  low: {
    label: "Baixa",
    icon: Info,
    className: "bg-primary/12 text-primary",
  },
};

function hrefIcon(href: AppPath) {
  switch (href) {
    case "/inicializacao":
      return Rocket;
    case "/disco":
      return HardDrive;
    case "/limpeza":
      return Sparkles;
    case "/monitoramento":
      return Activity;
    case "/sistema":
      return Monitor;
    case "/inteligencia":
      return Brain;
    case "/redes":
      return Wifi;
    default:
      return ArrowRight;
  }
}

export function RecommendationList({
  items,
  compact,
}: {
  items: Recommendation[];
  compact?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma recomendação no momento.</p>;
  }

  return (
    <ul className="divide-y divide-border/40">
      {items.map((rec) => {
        const severity = severityMeta[rec.severity];
        const SeverityIcon = severity.icon;
        const ActionIcon = hrefIcon(rec.href);

        return (
          <li key={rec.id}>
            <Link
              to={rec.href}
              aria-label={`${rec.title}. ${rec.action}`}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-1 transition-colors hover:bg-muted/40",
                compact ? "py-2.5" : "py-3",
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  severity.className,
                )}
                title={`Prioridade ${severity.label.toLowerCase()}`}
              >
                <SeverityIcon className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{rec.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {rec.detail}
                </p>
              </div>
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary"
                title={rec.action}
              >
                <ActionIcon className="size-4" aria-hidden />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function RecommendationsHeaderLink({ className }: { className?: string }) {
  return (
    <Button
      asChild
      size="icon"
      variant="ghost"
      className={cn("size-8 rounded-full text-muted-foreground hover:text-primary", className)}
    >
      <Link to="/inteligencia" title="Abrir Inteligência" aria-label="Abrir Inteligência">
        <Brain className="size-4" />
      </Link>
    </Button>
  );
}
