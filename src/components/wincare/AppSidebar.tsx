import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Brush,
  Gauge,
  HardDrive,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items: { title: string; url: string; icon: typeof LayoutDashboard }[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Reparo", url: "/reparo", icon: Wrench },
  { title: "Limpeza", url: "/limpeza", icon: Brush },
  { title: "Disco", url: "/disco", icon: HardDrive },
  { title: "Sistema", url: "/sistema", icon: Gauge },
  { title: "Monitoramento", url: "/monitoramento", icon: Activity },
  { title: "Logs", url: "/logs", icon: ScrollText },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="pt-3">
        <div className="mb-2 flex items-center gap-2 px-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary glow-ring">
            <ShieldCheck className="size-5" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-sm font-semibold">WinCare</p>
              <p className="text-xs text-muted-foreground">Central de manutenção</p>
            </div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={path === item.url}>
                    <Link
                      to={item.url}
                      className="flex items-center gap-2"
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      <item.icon className="size-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
