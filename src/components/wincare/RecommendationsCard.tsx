import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarClock,
  CircleAlert,
  Lightbulb,
  PackageX,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { listSchedules, openWindowsTarget } from "@/lib/wincare/bridge";
import { buildRecommendations, type RecommendationLevel } from "@/lib/wincare/recommendations";
import { useStore } from "@/lib/wincare/store";
import type { DiskDrive, ScheduleEntry, SystemInfo } from "@/lib/wincare/types";

const LEVEL: Record<RecommendationLevel, { icon: typeof CircleAlert; tone: string }> = {
  critical: { icon: CircleAlert, tone: "bg-destructive/15 text-destructive" },
  warning: { icon: TriangleAlert, tone: "bg-warning/15 text-warning" },
  tip: { icon: Lightbulb, tone: "bg-primary/15 text-primary" },
};

/* Aviso de inicialização: uma vez por abertura do app, não a cada visita ao Dashboard. */
let startupCheckDone = false;

export function RecommendationsCard({
  system,
  disks,
  loading,
}: {
  system: SystemInfo;
  disks: DiskDrive[];
  loading: boolean;
}) {
  const [schedules, setSchedules] = useState<ScheduleEntry[] | null>(null);
  const autoCheck = useStore((s) => s.autoCheck);
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void listSchedules()
      .then((out) => {
        if (!cancelled && out.ok) setSchedules(out.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(
    () => (loading ? [] : buildRecommendations(system, disks, schedules)),
    [loading, system, disks, schedules],
  );

  const urgent = items.filter((i) => i.level !== "tip").length;

  useEffect(() => {
    if (loading || !autoCheck || startupCheckDone || disks.length === 0) return;
    startupCheckDone = true;
    if (urgent > 0) {
      toast.warning(
        urgent === 1 ? "1 item precisa de atenção" : `${urgent} itens precisam de atenção`,
        {
          action: {
            label: "Ver",
            onClick: () => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
          },
        },
      );
    }
  }, [loading, autoCheck, disks.length, urgent]);

  return (
    <Card ref={cardRef} className="surface-panel gap-3 border-border/50 p-5">
      <h2 className="text-sm font-semibold tracking-tight">Manutenção</h2>
      {items.length === 0 ? (
        <div className="flex items-center gap-3 py-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium">
              {loading ? "Analisando o computador…" : "Nada pendente"}
            </p>
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Isso leva só alguns segundos."
                : "Espaço, proteção e atualizações estão dentro do esperado."}
            </p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.slice(0, 4).map((item) => {
            const meta = LEVEL[item.level];
            const Icon = meta.icon;
            return (
              <li key={item.id} className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    meta.tone,
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 rounded-full text-primary"
                  onClick={() => {
                    if (item.to) void navigate({ to: item.to });
                    else if (item.command) void openWindowsTarget(item.command);
                  }}
                >
                  {item.actionLabel}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const QUICK_ACTIONS = [
  {
    to: "/limpeza",
    icon: Sparkles,
    title: "Liberar espaço",
    hint: "Navegadores, apps e temporários",
  },
  {
    to: "/programas",
    icon: PackageX,
    title: "Remover programas",
    hint: "Desinstala e limpa resíduos",
  },
  {
    to: "/reparo",
    icon: Wrench,
    title: "Reparar o Windows",
    hint: "SFC, DISM e disco",
  },
  {
    to: "/agendamento",
    icon: CalendarClock,
    title: "Agendar manutenção",
    hint: "Roda sozinha em horário fixo",
  },
] as const;

export function QuickActions() {
  return (
    <Card className="surface-panel gap-3 border-border/50 p-5">
      <h2 className="text-sm font-semibold tracking-tight">Ações rápidas</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/40 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <action.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{action.title}</span>
              <span className="block text-xs text-muted-foreground">{action.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
