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
import { useEffect, type ReactNode } from "react";
import { Moon, Shield, ShieldCheck, Sun } from "lucide-react";
import { toast } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppSidebar } from "@/components/wincare/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { actions, hydrateStore, useStore } from "@/lib/wincare/store";
import { isNative } from "@/lib/wincare/bridge";
import { unlockUi } from "@/lib/wincare/unlockUi";
import { useAdmin } from "@/lib/wincare/useAdmin";
import { useAppUpdater } from "@/lib/wincare/useUpdate";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta ferramenta não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao dashboard
          </Link>
        </div>
      </div>
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado. Tente novamente ou volte ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
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
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
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

function TopBar() {
  const theme = useStore((s) => s.theme);
  const { native, elevated, restartAsAdmin } = useAdmin();

  const handleRestartAsAdmin = async () => {
    const out = await restartAsAdmin();
    if (out.ok && out.reason === "already-elevated") {
      toast.info("O WinCare já está em modo administrador.");
      return;
    }
    if (out.ok) {
      toast.info("Reiniciando com privilégios de administrador...");
      return;
    }
    toast.error("Não foi possível solicitar elevação.", {
      description:
        out.reason ??
        "Tente clicar com o botão direito no app e escolher Executar como administrador.",
    });
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">WinCare</span>
        <Badge variant="outline" className="border-primary/40 text-primary">
          {isNative() ? "Modo nativo" : "Modo demonstração"}
        </Badge>
        {native && elevated === true && (
          <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
            <ShieldCheck className="size-3" /> Administrador
          </Badge>
        )}
        {native && elevated === false && (
          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
            <Shield className="size-3" /> Usuário padrão
          </Badge>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {native && elevated === false && (
          <Button
            variant="secondary"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => void handleRestartAsAdmin()}
          >
            <ShieldCheck className="size-4" /> Executar como admin
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Alternar tema"
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
  useAppUpdater({ autoCheck: autoCheckUpdates });
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Hidrata preferências antes dos efeitos filhos (ex.: checagem de update).
  useEffect(() => {
    hydrateStore();
  }, []);

  // Segurança leve: limpa locks órfãos do Radix ao trocar de rota (sem loop agressivo).
  useEffect(() => {
    unlockUi();
    const t = window.setTimeout(unlockUi, 100);
    return () => clearTimeout(t);
  }, [pathname]);

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
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main className="flex-1 p-6">
              {/* Required: nested routes render here. */}
              <Outlet />
            </main>
          </div>
        </div>
        <Toaster />
        <StartupUpdateCheck />
      </SidebarProvider>
    </QueryClientProvider>
  );
}
