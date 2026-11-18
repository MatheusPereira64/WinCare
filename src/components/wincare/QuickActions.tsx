import { Link } from "@tanstack/react-router";
import { CalendarClock, PackageX, Sparkles, Wrench } from "lucide-react";

import { IconChip } from "./IconChip";
import { Panel } from "./Panel";

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
  { to: "/reparo", icon: Wrench, title: "Reparar o Windows", hint: "SFC, DISM e disco" },
  {
    to: "/agendamento",
    icon: CalendarClock,
    title: "Agendar manutenção",
    hint: "Roda sozinha em horário fixo",
  },
] as const;

/** Atalhos para as tarefas mais comuns (Dashboard). */
export function QuickActions() {
  return (
    <Panel className="@container gap-3" aria-labelledby="quick-actions-title" role="region">
      <h2 id="quick-actions-title" className="text-sm font-semibold tracking-tight">
        Ações rápidas
      </h2>
      <ul className="grid gap-2 @sm:grid-cols-2 @4xl:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <li key={action.to}>
            <Link
              to={action.to}
              className="surface-inset flex h-full items-center gap-3 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <IconChip icon={action.icon} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{action.title}</span>
                <span className="block text-xs text-muted-foreground">{action.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
