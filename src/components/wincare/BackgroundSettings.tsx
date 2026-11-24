import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  BellRing,
  HardDrive,
  Loader2,
  Minimize2,
  Power,
  RefreshCw,
  Send,
  ShieldAlert,
  Thermometer,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  checkAlertsNow,
  openWindowsTarget,
  sendTestNotification,
  snoozeAlerts,
} from "@/lib/wincare/bridge";
import { TONE_CALLOUT } from "@/lib/wincare/tone";
import type { AlertType, BackgroundState } from "@/lib/wincare/types";
import { useBackground } from "@/lib/wincare/useBackground";
import { CheckboxCard } from "./CheckboxCard";
import { Panel, PanelHeader } from "./Panel";
import { SettingSwitch } from "./Preferences";
import { ErrorState, LoadingState } from "./States";
import { StatusBadge } from "./StatusBadge";

/** O que cada alerta vigia (limites iguais aos de electron/alerts.cjs). */
const ALERT_TEXT: Record<AlertType, { icon: typeof HardDrive; title: string; rule: string }> = {
  disk: {
    icon: HardDrive,
    title: "Disco do sistema quase cheio",
    rule: "Menos de 10 GB livres ou 95% usado.",
  },
  temperature: {
    icon: Thermometer,
    title: "Temperatura alta",
    rule: "CPU ou GPU a 90 °C ou mais por alguns minutos (picos curtos não contam).",
  },
  defender: {
    icon: ShieldAlert,
    title: "Antivírus desligado",
    rule: "Proteção em tempo real do Defender desligada e nenhum outro antivírus ativo.",
  },
  windowsUpdate: {
    icon: RefreshCw,
    title: "Windows Update atrasado",
    rule: "45 dias ou mais sem instalar atualizações.",
  },
  diskGrowth: {
    icon: HardDrive,
    title: "Disco crescendo rápido",
    rule: "Qualquer unidade ganhou 1 GB ou mais em até 30 minutos.",
  },
  newProgram: {
    icon: ShieldAlert,
    title: "Programa novo instalado",
    rule: "Um programa apareceu na lista de instalados desde a última verificação.",
  },
};

const ALERT_ORDER: AlertType[] = [
  "disk",
  "diskGrowth",
  "temperature",
  "defender",
  "windowsUpdate",
  "newProgram",
];

const time = (ts: number) =>
  new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const dateTime = (ts: number) =>
  new Date(ts).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" });

function statusBadge(state: BackgroundState) {
  const { monitor } = state;
  if (!monitor.enabled) return <StatusBadge>Alertas desligados</StatusBadge>;
  if (monitor.snoozeUntil) {
    return (
      <StatusBadge tone="warning" dot>
        Silenciado até {dateTime(monitor.snoozeUntil)}
      </StatusBadge>
    );
  }
  if (monitor.active.length) {
    return (
      <StatusBadge tone="warning" dot>
        {monitor.active.length === 1 ? "1 alerta ativo" : `${monitor.active.length} alertas ativos`}
      </StatusBadge>
    );
  }
  return (
    <StatusBadge tone="success" dot>
      Vigiando
    </StatusBadge>
  );
}

/** Configurações → "Bandeja e alertas". */
export function BackgroundSettings() {
  const resource = useBackground();
  const [busy, setBusy] = useState<"check" | "test" | null>(null);

  const apply = async (patch: Parameters<typeof resource.update>[0], success?: string) => {
    try {
      await resource.update(patch);
      if (success) toast.success(success);
    } catch (error) {
      toast.error("Não foi possível salvar a opção.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const checkNow = async () => {
    setBusy("check");
    try {
      const state = await checkAlertsNow();
      resource.setData(state);
      const n = state.monitor.active.length;
      toast.success(
        n
          ? `${n === 1 ? "1 problema" : `${n} problemas`} encontrado${n === 1 ? "" : "s"}`
          : "Nenhum problema encontrado",
      );
    } catch (error) {
      toast.error("Não foi possível verificar agora.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      const out = await sendTestNotification();
      if (out.demo) {
        toast.info("No app para Windows, a notificação aparece no canto da tela", {
          description: "Aqui no navegador (demonstração) ela não é enviada.",
        });
      } else if (out.ok) {
        toast.success("Notificação de teste enviada", {
          description:
            "Se não apareceu, confira se as notificações do WinCare estão ligadas em Configurações do Windows → Sistema → Notificações.",
        });
      } else {
        toast.error("Este Windows não aceitou a notificação.");
      }
    } finally {
      setBusy(null);
    }
  };

  const snooze = async (hours: number) => {
    const state = await snoozeAlerts(hours);
    resource.setData(state);
    toast.success(hours ? "Alertas silenciados por 24 horas" : "Alertas reativados");
  };

  return (
    <Panel padding="lg" className="gap-5" data-wincare-background>
      <PanelHeader
        icon={BellRing}
        size="sm"
        title="Bandeja e alertas"
        badges={resource.data && statusBadge(resource.data)}
        description="O WinCare pode ficar no canto da barra de tarefas e avisar com uma notificação do Windows quando algo importante acontecer — uma vez por problema, sem repetir a cada minuto."
      />

      {resource.status === "loading" || (!resource.data && resource.status !== "error") ? (
        <LoadingState label="Lendo as opções de segundo plano…" variant="block" />
      ) : resource.status === "error" || !resource.data ? (
        <ErrorState
          size="sm"
          title="Não foi possível ler as opções de segundo plano"
          description={resource.error ?? undefined}
          onRetry={() => void resource.reload()}
        />
      ) : (
        <BackgroundOptions
          state={resource.data}
          busy={busy}
          onApply={apply}
          onCheckNow={checkNow}
          onTest={test}
          onSnooze={snooze}
        />
      )}
    </Panel>
  );
}

function BackgroundOptions({
  state,
  busy,
  onApply,
  onCheckNow,
  onTest,
  onSnooze,
}: {
  state: BackgroundState;
  busy: "check" | "test" | null;
  onApply: (
    patch: Parameters<ReturnType<typeof useBackground>["update"]>[0],
    success?: string,
  ) => Promise<void>;
  onCheckNow: () => Promise<void>;
  onTest: () => Promise<void>;
  onSnooze: (hours: number) => Promise<void>;
}) {
  const { monitor } = state;
  const demo = !state.supported.openAtLogin && !state.supported.tray;

  return (
    <>
      {demo && (
        <p className={cn("rounded-xl border p-3 text-xs", TONE_CALLOUT.neutral)}>
          Demonstração: no navegador não há bandeja nem notificações do Windows. As opções abaixo
          funcionam só nesta sessão; no app para Windows ficam salvas.
        </p>
      )}

      <div className="space-y-5">
        <SettingSwitch
          icon={Minimize2}
          label="Manter na bandeja ao fechar a janela"
          description="Fechar a janela deixa o WinCare no canto da barra de tarefas, vigiando os problemas abaixo. Para sair de vez, clique com o botão direito no ícone e escolha Sair."
          checked={state.closeToTray}
          onCheckedChange={(v) =>
            void onApply({ closeToTray: v }, v ? "Ao fechar, o WinCare fica na bandeja" : undefined)
          }
        />
        <div className="space-y-2">
          <SettingSwitch
            icon={Power}
            label="Abrir com o Windows, minimizado na bandeja"
            description="Começa junto com o Windows sem abrir a janela (leve: só o ícone e os alertas). Aberto assim, fechar a janela também o mantém na bandeja."
            checked={state.openAtLogin.enabled}
            onCheckedChange={(v) =>
              void onApply(
                { openAtLogin: v },
                v ? "O WinCare vai abrir com o Windows, na bandeja" : undefined,
              )
            }
          />
          {state.openAtLogin.blockedByWindows && (
            <div
              className={cn(
                "ml-8 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3 text-xs",
                TONE_CALLOUT.warning,
              )}
            >
              <TriangleAlert aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                O Windows está bloqueando a abertura automática. Reative o WinCare em Aplicativos de
                inicialização.
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void openWindowsTarget("start ms-settings:startupapps")}
              >
                Abrir
              </Button>
            </div>
          )}
        </div>
        <SettingSwitch
          icon={monitor.enabled ? Bell : BellOff}
          label="Avisar sobre problemas importantes"
          description="Enquanto o WinCare estiver aberto ou na bandeja. Com a janela em foco não há notificação: o painel de recomendações já mostra."
          checked={monitor.enabled}
          onCheckedChange={(v) => void onApply({ monitorEnabled: v })}
        />
      </div>

      {monitor.enabled && (
        <fieldset className="space-y-2 pl-8">
          <legend className="mb-2 text-sm font-medium">Avisar quando</legend>
          <div className="grid gap-2 @2xl/main:grid-cols-2">
            {ALERT_ORDER.map((type) => {
              const info = ALERT_TEXT[type];
              const check = monitor.checks[type];
              const active = monitor.active.some((a) => a.type === type);
              return (
                <CheckboxCard
                  key={type}
                  checked={monitor.types[type]}
                  onCheckedChange={(v) => void onApply({ types: { [type]: v } })}
                  title={info.title}
                  description={
                    <>
                      {info.rule}
                      {monitor.types[type] && check && (
                        <span
                          className={cn(
                            "mt-1 block font-medium",
                            active ? "text-warning" : "text-foreground/80",
                          )}
                        >
                          {active ? "Agora: " : "Última leitura: "}
                          {check.summary}
                        </span>
                      )}
                    </>
                  }
                />
              );
            })}
          </div>
        </fieldset>
      )}

      {monitor.enabled && monitor.active.length > 0 && (
        <div
          role="status"
          className={cn("space-y-2 rounded-xl border p-3 text-sm", TONE_CALLOUT.warning)}
        >
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            {monitor.active.length === 1
              ? "1 problema precisa de atenção"
              : `${monitor.active.length} problemas precisam de atenção`}
          </p>
          <ul className="space-y-2">
            {monitor.active.map((alert) => (
              <li
                key={alert.type}
                className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1"
              >
                <span className="min-w-0 flex-1 basis-56">
                  <span className="block font-medium text-foreground">{alert.title}</span>
                  <span className="block text-xs text-muted-foreground">{alert.body}</span>
                </span>
                <Button asChild size="sm" variant="secondary">
                  <Link to={alert.route as "/"}>Resolver</Link>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <p className="text-xs text-muted-foreground">
          {!monitor.enabled
            ? "Nenhuma verificação em segundo plano."
            : monitor.lastCheckAt
              ? `Última verificação às ${time(monitor.lastCheckAt)}. Disco a cada 5 min, temperatura a cada 3 min, antivírus a cada 30 min e Windows Update a cada 6 h.`
              : "A primeira verificação roda alguns segundos depois de abrir o app."}
        </p>
        <div className="flex flex-wrap gap-2">
          {monitor.enabled && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void onCheckNow()}
            >
              {busy === "check" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {busy === "check" ? "Verificando…" : "Verificar agora"}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void onTest()}
          >
            {busy === "test" ? <Loader2 className="animate-spin" /> : <Send />}
            Testar notificação
          </Button>
          {monitor.enabled && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void onSnooze(monitor.snoozeUntil ? 0 : 24)}
            >
              {monitor.snoozeUntil ? <Bell /> : <BellOff />}
              {monitor.snoozeUntil ? "Reativar alertas" : "Silenciar por 24 h"}
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Se o Windows estiver em “Não perturbe”, os avisos vão direto para a central de notificações.
        Lembretes: disco e antivírus depois de 1 dia, temperatura depois de 2 horas, Windows Update
        depois de 7 dias — e nunca mais de um aviso a cada 10 minutos.
      </p>
    </>
  );
}
