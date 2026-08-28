import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Brain,
  Brush,
  Gauge,
  HardDrive,
  LayoutDashboard,
  Network,
  Rocket,
  ScrollText,
  Settings,
  Wrench,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { isNative } from "@/lib/wincare/bridge";
import appLogo from "@/assets/wincare-icon.png";

interface NavItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
}

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "Visão geral",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Monitoramento", url: "/monitoramento", icon: Activity },
      { title: "Inteligência", url: "/inteligencia", icon: Brain },
    ],
  },
  {
    label: "Manutenção",
    items: [
      { title: "Reparo", url: "/reparo", icon: Wrench },
      { title: "Limpeza", url: "/limpeza", icon: Brush },
      { title: "Disco", url: "/disco", icon: HardDrive },
      { title: "Inicialização", url: "/inicializacao", icon: Rocket },
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
      { title: "Logs", url: "/logs", icon: ScrollText },
      { title: "Configurações", url: "/configuracoes", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="pt-4">
        <div className="mb-3 flex items-center gap-2.5 px-3">
          <img
            src={appLogo}
            alt="WinCare"
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-xl object-cover glow-ring shadow-sm"
            draggable={false}
          />
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">WinCare</p>
              <p className="text-[11px] text-muted-foreground">Central de manutenção</p>
            </div>
          )}
        </div>

        {groups.map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = path === item.url;
                  return (
                    <SidebarMenuItem key={item.url}>
                      {/*
                        Sem Tooltip Radix — no Electron o portal do tooltip
                        trava cliques da sidebar (hover / modo ícone).
                        title nativo só quando recolhida.
                      */}
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className={
                          active
                            ? "rounded-lg border-l-2 border-l-primary bg-primary/15 font-medium text-primary data-[active=true]:bg-primary/15 data-[active=true]:text-primary"
                            : "rounded-lg border-l-2 border-l-transparent"
                        }
                      >
                        <Link
                          to={item.url}
                          title={collapsed ? item.title : undefined}
                          className="flex items-center gap-2.5"
                          onClick={() => {
                            if (isMobile) setOpenMobile(false);
                          }}
                        >
                          <item.icon className="size-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {!collapsed && (
        <SidebarFooter className="px-3 pb-3">
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 px-3 py-2">
            <p className="text-[11px] font-medium text-sidebar-foreground/80">
              {isNative() ? "Modo nativo" : "Modo demonstração"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {isNative() ? "Comandos reais do Windows" : "Saídas simuladas no navegador"}
            </p>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
