import { useEffect, useId, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";

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
import { cn } from "@/lib/utils";
import { getNative, isNative } from "@/lib/wincare/bridge";
import { NAV_GROUPS, pageShortcutLabel, type NavItem } from "@/lib/wincare/navigation";
import appLogo from "@/assets/wincare-icon.png";

export function AppSidebar() {
  const { state, setOpenMobile, isMobile, openOverlay, setOpenOverlay } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void getNative()?.getAppVersion?.().then(setVersion);
  }, []);

  return (
    <Sidebar collapsible="icon" role="navigation" aria-label="Navegação principal">
      {/* Recolhida em janela baixa (1024×640 a 125%), os 14 ícones cabem sem rolar. */}
      <SidebarContent className="pt-4 short:pt-2.5 short:group-data-[collapsible=icon]:gap-1">
        <div
          className={
            collapsed
              ? "mb-3 flex items-center justify-center short:mb-2"
              : "mb-3 flex items-center gap-2.5 px-3"
          }
        >
          <img
            src={appLogo}
            // Expandida, o nome já aparece ao lado: a imagem é decorativa.
            alt={collapsed ? "WinCare" : ""}
            width={36}
            height={36}
            className={`${collapsed ? "size-8" : "size-9"} shrink-0 rounded-xl object-cover glow-ring shadow-sm`}
            draggable={false}
          />
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">WinCare</p>
              <p className="text-[11px] text-muted-foreground">Central de manutenção</p>
            </div>
          )}
        </div>

        {NAV_GROUPS.map((group) => (
          <NavGroup
            key={group.label}
            label={group.label}
            items={group.items}
            path={path}
            collapsed={collapsed}
            onNavigate={() => {
              if (isMobile) setOpenMobile(false);
              if (openOverlay) setOpenOverlay(false);
            }}
          />
        ))}
      </SidebarContent>

      {!collapsed && (
        // Em janelas baixas o cartão informativo cede espaço para a navegação.
        <SidebarFooter className="px-3 pb-3 short:hidden">
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 px-3 py-2">
            <p className="text-[11px] font-medium text-sidebar-foreground/80">
              {isNative() ? `WinCare ${version ? `v${version}` : ""}` : "Modo demonstração"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {isNative() ? "Executa comandos reais do Windows" : "Saídas simuladas no navegador"}
            </p>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

function NavGroup({
  label,
  items,
  path,
  collapsed,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  path: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const labelId = useId();
  return (
    <SidebarGroup className="py-1 short:py-0">
      <SidebarGroupLabel
        id={labelId}
        className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase"
      >
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu
          aria-labelledby={labelId}
          className="short:group-data-[collapsible=icon]:gap-0.5"
        >
          {items.map((item) => {
            const active = path === item.url;
            const shortcut = pageShortcutLabel(item);
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
                  className={cn(
                    "rounded-lg border-l-2 short:group-data-[collapsible=icon]:!h-7",
                    active
                      ? "border-l-primary bg-primary/15 font-medium text-primary data-[active=true]:bg-primary/15 data-[active=true]:text-primary forced-colors:border-l-[Highlight]"
                      : "border-l-transparent forced-colors:border-l-[Canvas]",
                  )}
                >
                  <Link
                    to={item.url}
                    title={
                      collapsed
                        ? [item.title, shortcut && `(${shortcut})`].filter(Boolean).join(" ")
                        : undefined
                    }
                    aria-keyshortcuts={shortcut}
                    className="flex items-center gap-2.5"
                    onClick={onNavigate}
                  >
                    <item.icon className="size-4" />
                    {/* Recolhida, o nome continua no DOM para o Narrador. */}
                    <span className={collapsed ? "sr-only" : undefined}>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
