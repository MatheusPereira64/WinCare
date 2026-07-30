import { createFileRoute } from "@tanstack/react-router";
import { Keyboard, Moon, ShieldAlert, ShieldCheck, Sun, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { actions, useStore } from "@/lib/wincare/store";
import { isNative, getNative } from "@/lib/wincare/bridge";
import { useAdmin } from "@/lib/wincare/useAdmin";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações do WinCare | Tema e segurança" },
      {
        name: "description",
        content:
          "Ajuste tema claro/escuro, confirmação de comandos críticos, verificação automática ao iniciar e veja os atalhos.",
      },
      { property: "og:title", content: "Configurações do WinCare" },
      {
        property: "og:description",
        content: "Tema, segurança e automação da central de manutenção.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const theme = useStore((s) => s.theme);
  const autoCheck = useStore((s) => s.autoCheck);
  const confirmCritical = useStore((s) => s.confirmCritical);
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
    toast.error("Não foi possível solicitar elevação.", { description: out.reason });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Preferências salvas localmente neste computador.
        </p>
      </header>

      <Card className="surface-panel gap-5 border-border/60 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            {theme === "dark" ? (
              <Moon className="mt-0.5 size-5 text-primary" />
            ) : (
              <Sun className="mt-0.5 size-5 text-primary" />
            )}
            <div>
              <Label htmlFor="theme">Tema claro</Label>
              <p className="text-sm text-muted-foreground">
                Alterna entre o tema escuro padrão e o tema claro.
              </p>
            </div>
          </div>
          <Switch
            id="theme"
            checked={theme === "light"}
            onCheckedChange={(v) => actions.setTheme(v ? "light" : "dark")}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 text-warning" />
            <div>
              <Label htmlFor="confirm">Confirmar comandos críticos</Label>
              <p className="text-sm text-muted-foreground">
                Exibe um aviso de risco antes de executar ações de nível Atenção ou Avançado.
              </p>
            </div>
          </div>
          <Switch
            id="confirm"
            checked={confirmCritical}
            onCheckedChange={actions.setConfirmCritical}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Zap className="mt-0.5 size-5 text-primary" />
            <div>
              <Label htmlFor="auto">Verificação automática ao iniciar</Label>
              <p className="text-sm text-muted-foreground">
                Faz um diagnóstico rápido sempre que o WinCare é aberto.
              </p>
            </div>
          </div>
          <Switch id="auto" checked={autoCheck} onCheckedChange={actions.setAutoCheck} />
        </div>
      </Card>

      <Card className="surface-panel gap-3 border-border/60 p-6">
        <div className="flex items-center gap-2">
          <Keyboard className="size-5 text-primary" />
          <h2 className="font-semibold">Atalhos de teclado</h2>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">Ctrl</kbd> +{" "}
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">K</kbd> — pesquisar
            ferramenta
          </li>
          <li>
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">Ctrl</kbd> +{" "}
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">B</kbd> — recolher a
            barra lateral
          </li>
        </ul>
      </Card>

      <Card className="surface-panel gap-4 border-border/60 p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <h2 className="font-semibold">Privilégios de administrador</h2>
        </div>
        {native ? (
          <>
            <Badge
              variant="outline"
              className={
                elevated
                  ? "w-fit border-success/40 bg-success/10 text-success"
                  : "w-fit border-warning/40 bg-warning/10 text-warning"
              }
            >
              {elevated ? "Executando como administrador" : "Executando como usuário padrão"}
            </Badge>
            <p className="text-sm text-muted-foreground">
              Ferramentas como SFC, DISM e Prefetch exigem privilégios elevados. Você pode reiniciar
              o app inteiro como administrador (sem UAC a cada comando) ou aprovar o UAC apenas
              quando executar uma ferramenta específica.
            </p>
            {elevated === false && (
              <Button className="w-fit" onClick={() => void handleRestartAsAdmin()}>
                <ShieldCheck className="size-4" /> Executar WinCare como administrador
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Disponível apenas no aplicativo desktop (Electron). No navegador os comandos são
            simulados.
          </p>
        )}
      </Card>

      <Card className="surface-panel gap-4 border-border/60 p-6">
        <div className="flex items-center gap-2">
          <Trash2 className="size-5 text-primary" />
          <h2 className="font-semibold">Dados locais</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Limpa o histórico de execuções salvo neste computador. Use se alguma ferramenta ficou
          presa em &quot;Executando...&quot;.
        </p>
        <Button
          variant="secondary"
          className="w-fit"
          onClick={async () => {
            actions.clearPersistedState();
            const native = getNative();
            if (native?.clearStorage) {
              await native.clearStorage();
            }
            toast.success("Histórico local limpo.");
            window.location.reload();
          }}
        >
          <Trash2 className="size-4" /> Limpar histórico local
        </Button>
        <p className="text-xs text-muted-foreground">
          No menu superior do app: <strong>WinCare → Limpar histórico local</strong>. Esse comando
          não funciona no PowerShell — só dentro do WinCare.
        </p>
      </Card>

      <Card className="surface-panel gap-2 border-border/60 p-6">
        <h2 className="font-semibold">Modo de execução</h2>
        <Badge variant="outline" className="w-fit border-primary/40 text-primary">
          {isNative() ? "Nativo (Windows)" : "Demonstração (navegador)"}
        </Badge>
        <p className="text-sm text-muted-foreground">
          No navegador os comandos são simulados com saídas realistas. No aplicativo desktop, cada
          botão executa o comando real no Windows — com elevação automática via UAC quando
          necessário.
        </p>
      </Card>
    </div>
  );
}
