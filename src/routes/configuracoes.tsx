import { createFileRoute } from "@tanstack/react-router";
import {
  Keyboard,
  Minus,
  Monitor,
  Palette,
  Plus,
  Settings,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  ZoomIn,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BackgroundSettings } from "@/components/wincare/BackgroundSettings";
import { ChoiceChips } from "@/components/wincare/ChoiceChips";
import { KeyCombo, ShortcutTable } from "@/components/wincare/KeyboardShortcuts";
import { openShortcutsHelp, shortcutSections } from "@/lib/wincare/shortcuts";
import { AppearanceSettings } from "@/components/wincare/AppearanceSettings";
import { PageHeader } from "@/components/wincare/PageHeader";
import { PreferenceSwitches } from "@/components/wincare/Preferences";
import { Panel, PanelHeader } from "@/components/wincare/Panel";
import { StatusBadge } from "@/components/wincare/StatusBadge";
import { UpdateCard } from "@/components/wincare/UpdateCard";
import { actions, useStore } from "@/lib/wincare/store";
import { isNative, getNative } from "@/lib/wincare/bridge";
import { useAdmin } from "@/lib/wincare/useAdmin";
import { formatZoom, MAX_ZOOM, MIN_ZOOM, ZOOM_LEVELS } from "@/lib/wincare/zoom";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações do WinCare | Tema e segurança" },
      {
        name: "description",
        content:
          "Ajuste tema claro/escuro, zoom da interface, confirmação de comandos críticos, verificação automática ao iniciar e veja os atalhos.",
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

const ZOOM_OPTIONS = ZOOM_LEVELS.map((value) => ({ value, label: formatZoom(value) }));

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {children}
    </kbd>
  );
}

function SettingsPage() {
  const zoom = useStore((s) => s.zoom);
  const { native, elevated, restartAsAdmin } = useAdmin();

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
      description: out.reason,
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={Settings}
        title="Configurações"
        subtitle="Preferências salvas localmente neste computador."
      />

      <Panel padding="lg" className="gap-5">
        <PanelHeader
          icon={Palette}
          size="sm"
          title="Aparência"
          description="Temas, cores e layout do WinCare. As mudanças valem na hora e ficam salvas."
        />

        <AppearanceSettings />

        <div className="space-y-3" data-wincare-zoom-setting>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <ZoomIn className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <Label id="zoom-label">Tamanho da interface</Label>
                <p id="zoom-desc" className="text-sm text-muted-foreground">
                  Aumenta ou diminui textos e controles. As telas se reorganizam para caber na
                  janela, útil em notebooks com escala de 125% ou 150%.
                </p>
              </div>
            </div>
            <div
              role="group"
              aria-labelledby="zoom-label"
              aria-describedby="zoom-desc"
              className="ml-8 flex shrink-0 items-center gap-1"
            >
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8 rounded-full"
                aria-label="Diminuir zoom"
                disabled={!native || zoom <= MIN_ZOOM}
                onClick={() => actions.stepZoom("out")}
              >
                <Minus />
              </Button>
              <span
                className="w-14 text-center text-sm font-semibold tabular-nums"
                aria-live="polite"
              >
                {formatZoom(zoom)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8 rounded-full"
                aria-label="Aumentar zoom"
                disabled={!native || zoom >= MAX_ZOOM}
                onClick={() => actions.stepZoom("in")}
              >
                <Plus />
              </Button>
            </div>
          </div>
          <ChoiceChips
            label="Nível de zoom"
            value={zoom}
            options={ZOOM_OPTIONS}
            disabled={!native}
            onChange={actions.setZoom}
            className="pl-8"
          />
          <p className="pl-8 text-xs leading-relaxed text-muted-foreground">
            {native ? (
              <>
                <Kbd>Ctrl</Kbd> + <Kbd>+</Kbd> aumenta, <Kbd>Ctrl</Kbd> + <Kbd>−</Kbd> diminui e{" "}
                <Kbd>Ctrl</Kbd> + <Kbd>0</Kbd> volta para 100%. <Kbd>Ctrl</Kbd> + roda do mouse
                também funciona. O nível fica salvo neste computador.
              </>
            ) : (
              "No navegador, use o zoom do próprio navegador (Ctrl + / Ctrl −). No app desktop o nível escolhido fica salvo aqui."
            )}
          </p>
        </div>
      </Panel>

      <Panel padding="lg" className="gap-5">
        <PanelHeader icon={ShieldAlert} size="sm" title="Segurança e avisos" />
        <PreferenceSwitches keys={["confirmCritical", "autoRestorePoint", "autoCheck"]} />
      </Panel>

      <BackgroundSettings />

      <UpdateCard />

      <Panel padding="lg" className="gap-3">
        <PanelHeader
          icon={Keyboard}
          size="sm"
          title="Atalhos de teclado"
          actions={
            <Button type="button" variant="secondary" size="sm" onClick={openShortcutsHelp}>
              Ver todos <KeyCombo combos={[["?"]]} />
            </Button>
          }
        />
        <p className="text-sm text-muted-foreground">
          Todo o WinCare funciona só com o teclado e com o Narrador do Windows. Pressione{" "}
          <KeyCombo combos={[["?"]]} /> ou <KeyCombo combos={[["F1"]]} /> em qualquer tela para ver
          esta lista.
        </p>
        <div className="grid gap-x-8 gap-y-4 @2xl/main:grid-cols-2">
          {shortcutSections()
            .filter((section) => section.title !== "Zoom" || native)
            .map((section) => (
              <ShortcutTable key={section.title} title={section.title} items={section.items} />
            ))}
        </div>
      </Panel>

      <Panel padding="lg">
        <PanelHeader
          icon={ShieldCheck}
          size="sm"
          title="Permissão de administrador"
          badges={
            native && (
              <StatusBadge tone={elevated ? "success" : "warning"}>
                {elevated ? "Executando como administrador" : "Executando como usuário padrão"}
              </StatusBadge>
            )
          }
        />
        {native ? (
          <>
            <p className="text-sm text-muted-foreground">
              Ferramentas como SFC, DISM e Prefetch precisam de permissão de administrador. Você
              pode reabrir o WinCare como administrador (sem confirmar a cada comando) ou aprovar o
              pedido do Windows só quando usar uma dessas ferramentas.
            </p>
            {elevated === false && (
              <Button className="w-fit" onClick={() => void handleRestartAsAdmin()}>
                <ShieldCheck className="size-4" /> Reabrir como administrador
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Disponível só no app desktop. No navegador os comandos são simulados.
          </p>
        )}
      </Panel>

      <Panel padding="lg">
        <PanelHeader
          icon={Trash2}
          size="sm"
          title="Dados locais"
          description="Apaga o histórico de execuções salvo neste computador. Use se alguma ferramenta ficou presa em “Executando…”."
        />
        <Button
          variant="secondary"
          className="w-fit"
          onClick={async () => {
            actions.clearPersistedState();
            const native = getNative();
            if (native?.clearStorage) {
              await native.clearStorage();
            }
            toast.success("Histórico local apagado");
            window.location.reload();
          }}
        >
          <Trash2 className="size-4" /> Limpar histórico local
        </Button>
        <p className="text-xs text-muted-foreground">
          Também no menu do app (tecla <strong>Alt</strong>):{" "}
          <strong>WinCare → Limpar histórico local</strong>.
        </p>
      </Panel>

      <Panel padding="lg">
        <PanelHeader
          icon={Sparkles}
          size="sm"
          title="Introdução"
          description="Mostra de novo os 4 passos da primeira execução: o que o WinCare faz e nunca faz, preferências, limpeza semanal e modo administrador."
          actions={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => actions.setOnboardingDone(false)}
            >
              Rever a introdução
            </Button>
          }
        />
      </Panel>

      <Panel padding="lg" className="gap-2">
        <PanelHeader
          icon={Monitor}
          size="sm"
          title="Modo de execução"
          badges={
            <StatusBadge tone="primary">
              {isNative() ? "App desktop (Windows)" : "Demonstração (navegador)"}
            </StatusBadge>
          }
          description="No navegador os comandos são simulados com saídas realistas. No app desktop, cada botão executa o comando real no Windows e pede permissão de administrador quando necessário."
        />
      </Panel>
    </div>
  );
}
