import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { Loader2, Moon, SearchX, Shield, ShieldCheck, Sun } from "lucide-react";
import { toast } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppSidebar } from "@/components/wincare/AppSidebar";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { actions, hydrateStore, useStore } from "@/lib/wincare/store";
import { hydrateIntelligence } from "@/lib/wincare/intelligenceStore";
import { getNative, isNative } from "@/lib/wincare/bridge";
import { unlockUi } from "@/lib/wincare/unlockUi";
import { useAdmin } from "@/lib/wincare/useAdmin";
import { useAppUpdater } from "@/lib/wincare/useUpdate";
import { useActiveRuns } from "@/lib/wincare/runner";
import type { ToolCategory } from "@/lib/wincare/types";
import { UpdateAvailableModal } from "@/components/wincare/UpdateAvailableModal";
import { IntelligenceCollector } from "@/components/wincare/IntelligenceCollector";
import { PageLoadingOverlay } from "@/components/wincare/PageLoading";
import { useContentLoading } from "@/lib/wincare/useContentLoading";
import { EmptyState, ErrorState } from "@/components/wincare/States";
import { StatusBadge } from "@/components/wincare/StatusBadge";
import { ZoomController, ZoomIndicator } from "@/components/wincare/ZoomController";
import { FirstRunWizard } from "@/components/wincare/FirstRunWizard";
import { TrayBridge } from "@/components/wincare/TrayBridge";
import { KeyboardShortcuts, ShortcutsButton } from "@/components/wincare/KeyboardShortcuts";
import { PAGE_TITLES } from "@/lib/wincare/navigation";
import { INERT_MARKER } from "@/lib/wincare/useFocusTrap";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60svh] items-center justify-center px-4">
      <EmptyState
        icon={SearchX}
        title="Página não encontrada"
        description="Esta tela não existe ou foi movida."
        action={
          <Button asChild size="sm">
            <Link to="/">Voltar ao Dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-[60svh] items-center justify-center px-4">
      <ErrorState
        title="Esta tela não carregou"
        description="Algo deu errado. Tente de novo ou volte ao início."
        onRetry={() => {
          void router.invalidate();
          reset();
        }}
        secondaryAction={
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Ir para o início</Link>
          </Button>
        }
      />
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "WinCare — Central de manutenção do Windows" },
      {
        name: "description",
        content:
          "WinCare reúne diagnóstico, reparo e otimização do Windows em uma interface moderna, sem precisar abrir o CMD.",
      },
      { name: "author", content: "WinCare" },
      { property: "og:title", content: "WinCare — Central de manutenção do Windows" },
      {
        property: "og:description",
        content: "Diagnóstico, reparo e limpeza do Windows em um app desktop moderno.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/wincare-icon.png", type: "image/png", sizes: "512x512" },
      { rel: "apple-touch-icon", href: "/wincare-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/**
 * Web (TanStack Start): o shell é o documento inteiro e o React hidrata o `document`.
 *
 * App desktop: o React monta em `#root` (electron/renderer/main.tsx). Lá o shell
 * NÃO pode renderizar <html>/<body>: o React 19 adotaria o <body> real como nó
 * da própria árvore — que está dentro do <body> — e eventos tratados no
 * document/body (o `selectionchange` ao focar um campo de texto, portais no
 * body) entravam num loop infinito no despacho de eventos do React, travando
 * a janela. Era a causa das "cliques mortos" ao focar a busca ou abrir overlays.
 * `<title>`/`<meta>` do HeadContent continuam indo para o <head> (React 19).
 */
function RootShell({ children }: { children: ReactNode }) {
  if (typeof document !== "undefined" && document.getElementById("root")) {
    return (
      <>
        <HeadContent />
        {children}
      </>
    );
  }
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const CATEGORY_PAGE: Record<ToolCategory, string> = {
  repair: "/reparo",
  cleanup: "/limpeza",
  disk: "/disco",
  network: "/redes",
  system: "/sistema",
};

/** Mantém visível o que continua rodando depois de trocar de página. */
function RunningIndicator() {
  const runs = useActiveRuns();
  if (runs.length === 0) return null;
  const first = runs[0].tool;
  return (
    <Link
      to={first.id === "full-check" ? "/" : CATEGORY_PAGE[first.category]}
      title={runs.map((r) => r.tool.name).join(", ")}
      className="animate-fade-in flex max-w-40 min-w-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/15 @2xl/topbar:max-w-64"
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin" />
      <span className="truncate">
        {runs.length === 1 ? first.name : `${runs.length} tarefas em execução`}
      </span>
    </Link>
  );
}

function TopBar() {
  const theme = useStore((s) => s.theme);
  const { native, elevated, restartAsAdmin } = useAdmin();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pageTitle = PAGE_TITLES[pathname];

  const handleRestartAsAdmin = async () => {
    const out = await restartAsAdmin();
    if (out.ok && out.reason === "already-elevated") {
      toast.info("O WinCare já está em modo administrador.");
      return;
    }
    if (out.ok) {
      toast.info("Reabrindo como administrador…");
      return;
    }
    toast.error("Não foi possível pedir permissão de administrador.", {
      description:
        out.reason ??
        "Clique com o botão direito no WinCare e escolha “Executar como administrador”.",
    });
  };

  return (
    // Container query na própria barra: os selos somem conforme o espaço real
    // (barra lateral aberta, zoom e escala do Windows entram na conta).
    <header className="@container/topbar sticky top-0 z-[60] flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-background/70 px-3 backdrop-blur-md pointer-events-auto sm:gap-3 sm:px-4 short:h-12">
      <SidebarTrigger className="shrink-0 rounded-lg" />
      <div className="flex min-w-0 items-center gap-2.5 whitespace-nowrap">
        <span className="hidden shrink-0 text-sm font-semibold tracking-tight @md/topbar:inline">
          WinCare
        </span>
        {pageTitle && (
          <>
            <span className="hidden text-muted-foreground/40 @md/topbar:inline" aria-hidden>
              /
            </span>
            <span className="truncate text-sm text-muted-foreground">{pageTitle}</span>
          </>
        )}
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <RunningIndicator />
        {!isNative() && (
          <StatusBadge tone="primary" dot className="hidden shrink-0 @3xl/topbar:inline-flex">
            Demonstração
          </StatusBadge>
        )}
        {native && elevated === true && (
          <StatusBadge tone="success" className="hidden shrink-0 @2xl/topbar:inline-flex">
            <ShieldCheck aria-hidden className="size-3 shrink-0" /> Administrador
          </StatusBadge>
        )}
        {native && elevated === false && (
          <StatusBadge tone="warning" className="hidden shrink-0 @3xl/topbar:inline-flex">
            <Shield aria-hidden className="size-3 shrink-0" /> Usuário padrão
          </StatusBadge>
        )}
        {native && elevated === false && (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 rounded-full"
            title="Reabrir como administrador"
            aria-label="Reabrir como administrador"
            onClick={() => void handleRestartAsAdmin()}
          >
            <ShieldCheck className="size-4" />
            <span className="hidden @2xl/topbar:inline">Reabrir como admin</span>
          </Button>
        )}
        <ZoomIndicator />
        <ShortcutsButton />
        <Button
          variant="ghost"
          size="icon"
          aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          className="shrink-0 rounded-full"
          onClick={() => actions.setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  );
}

function StartupUpdateCheck() {
  const autoCheckUpdates = useStore((s) => s.autoCheckUpdates);
  // Na primeira execução a introdução vem antes; o aviso de versão nova espera.
  const onboardingDone = useStore((s) => s.onboardingDone);
  const { version, info, applying, progress, promptOpen, apply, openReleasePage, dismissPrompt } =
    useAppUpdater({ autoCheck: autoCheckUpdates, promptOnAvailable: true });

  // O processo principal também procura versão nova com o app aberto (bandeja):
  // segue a mesma preferência.
  useEffect(() => {
    void getNative()?.setBackgroundSettings?.({ checkUpdates: autoCheckUpdates });
  }, [autoCheckUpdates]);

  const handleConfirm = () => {
    if (!info?.canAutoUpdate) {
      dismissPrompt();
      void openReleasePage();
      return;
    }
    void apply();
  };

  return (
    <UpdateAvailableModal
      open={promptOpen && onboardingDone}
      currentVersion={info?.currentVersion || version}
      latestVersion={info?.latestVersion || ""}
      canAutoUpdate={!!info?.canAutoUpdate}
      applying={applying}
      progress={progress}
      onConfirm={handleConfirm}
      onCancel={dismissPrompt}
    />
  );
}

function AppLoadingLayer() {
  const { visible, label } = useContentLoading();
  return <PageLoadingOverlay visible={visible} label={label} />;
}

/** Fecha a gaveta / painel sobreposto e remove locks Radix em toda navegação. */
function RouteUiGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile, setOpenOverlay } = useSidebar();

  useEffect(() => {
    setOpenMobile(false);
    setOpenOverlay(false);
    unlockUi();
    const t = window.setTimeout(unlockUi, 250);
    return () => window.clearTimeout(t);
  }, [pathname, setOpenMobile, setOpenOverlay]);

  return null;
}

/** Leva o foco ao título da página (ou ao <main>) — o Narrador anuncia onde está. */
function focusPageStart() {
  const main = document.getElementById("conteudo");
  const heading = main?.querySelector<HTMLElement>("h1");
  const target = heading ?? main;
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

/** Primeiro item do Tab: pula a barra lateral e o cabeçalho. */
function SkipLink() {
  return (
    <a
      href="#conteudo"
      // Roteamento por hash: o href mudaria a rota, então só move o foco.
      onClick={(event) => {
        event.preventDefault();
        focusPageStart();
      }}
      className="sr-only rounded-lg bg-primary-solid px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[300]"
    >
      Pular para o conteúdo
    </a>
  );
}

function AppContentColumn() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const { isMobile, openMobile, openOverlay } = useSidebar();
  // Barra lateral aberta por cima: o resto fica inerte (teclado e Narrador).
  const covered = isMobile ? openMobile : openOverlay;

  // Quem rola é a área de conteúdo (não a janela): cada página abre no topo,
  // e o foco vai para o título da nova página (depois de a barra devolver o foco).
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 });
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = window.setTimeout(focusPageStart, 80);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return (
    <div
      className="relative z-0 flex h-svh min-w-0 flex-1 flex-col overflow-hidden"
      inert={covered || undefined}
      {...(covered ? { [INERT_MARKER]: "" } : {})}
    >
      <TopBar />
      <main
        id="conteudo"
        tabIndex={-1}
        data-wincare-content
        className="app-ambient relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden outline-none"
      >
        <div
          ref={scrollerRef}
          data-wincare-scroll
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 lg:p-6"
        >
          {/*
            Container das páginas: grids usam @container/main (largura real
            do conteúdo, já sem a barra lateral) em vez da largura da janela.
          */}
          <div
            key={pathname}
            data-wincare-page
            className="@container/main animate-fade-in mx-auto w-full max-w-[1500px]"
          >
            {/* Required: nested routes render here. */}
            <Outlet />
          </div>
        </div>
        <AppLoadingLayer />
      </main>
    </div>
  );
}

function RootComponent() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  // Painel da bandeja: janela própria, sem barra lateral, avisos nem assistente.
  if (pathname === "/painel") return <PanelRoot />;
  return <AppRoot />;
}

function PanelRoot() {
  useEffect(() => {
    hydrateStore();
  }, []);
  return (
    <>
      <Outlet />
      <Toaster containerAriaLabel="Notificações" />
    </>
  );
}

function AppRoot() {
  const { queryClient } = Route.useRouteContext();
  const sidebarOpen = useStore((s) => s.sidebarOpen);

  // Hidrata preferências antes dos efeitos filhos (ex.: checagem de update).
  useEffect(() => {
    hydrateStore();
    hydrateIntelligence();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>("[data-wincare-search]")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider open={sidebarOpen} onOpenChange={actions.setSidebarOpen}>
        <SkipLink />
        {/*
          Altura travada na janela: o cabeçalho fica fixo e só o conteúdo rola,
          então o carregamento e os avisos ficam sempre na área visível.
        */}
        <div className="flex h-svh w-full bg-background">
          <AppSidebar />
          <AppContentColumn />
        </div>
        <Toaster containerAriaLabel="Notificações" />
        <StartupUpdateCheck />
        <IntelligenceCollector />
        <ZoomController />
        <KeyboardShortcuts />
        <FirstRunWizard />
        <TrayBridge />
        <RouteUiGuard />
      </SidebarProvider>
    </QueryClientProvider>
  );
}
