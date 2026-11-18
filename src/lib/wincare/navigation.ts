import {
  Activity,
  Brain,
  Brush,
  CalendarClock,
  Gauge,
  HardDrive,
  History,
  LayoutDashboard,
  Network,
  PackageX,
  Rocket,
  ScrollText,
  Settings,
  Wrench,
} from "lucide-react";

export interface NavItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  /** Tecla do atalho Alt+N (código físico `DigitN`, funciona em ABNT2/US/AZERTY). */
  shortcut?: string;
}

/**
 * Páginas na ordem da barra lateral. Alt+1…9 seguem essa ordem e
 * Alt+0 abre as Configurações (mesma fonte para barra, atalhos e ajuda).
 */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Visão geral",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard, shortcut: "1" },
      { title: "Monitoramento", url: "/monitoramento", icon: Activity, shortcut: "2" },
      { title: "Inteligência", url: "/inteligencia", icon: Brain, shortcut: "3" },
    ],
  },
  {
    label: "Manutenção",
    items: [
      { title: "Reparo", url: "/reparo", icon: Wrench, shortcut: "4" },
      { title: "Limpeza", url: "/limpeza", icon: Brush, shortcut: "5" },
      { title: "Programas", url: "/programas", icon: PackageX, shortcut: "6" },
      { title: "Disco", url: "/disco", icon: HardDrive, shortcut: "7" },
      { title: "Inicialização", url: "/inicializacao", icon: Rocket, shortcut: "8" },
      { title: "Agendamento", url: "/agendamento", icon: CalendarClock, shortcut: "9" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Sistema", url: "/sistema", icon: Gauge },
      { title: "Redes", url: "/redes", icon: Network },
    ],
  },
  {
    label: "Registro",
    items: [
      { title: "Histórico", url: "/historico", icon: History },
      { title: "Logs", url: "/logs", icon: ScrollText },
      { title: "Configurações", url: "/configuracoes", icon: Settings, shortcut: "0" },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export const PAGE_TITLES: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.url, item.title]),
);

/** Páginas com atalho, na ordem 1…9 e depois 0. */
export const SHORTCUT_PAGES = NAV_ITEMS.filter((item) => item.shortcut).sort(
  (a, b) => (Number(a.shortcut) || 10) - (Number(b.shortcut) || 10),
);

/** Rótulo legível do atalho de uma página ("Alt+1"). */
export const pageShortcutLabel = (item: NavItem) =>
  item.shortcut ? `Alt+${item.shortcut}` : undefined;
