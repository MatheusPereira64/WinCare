import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Ban,
  Brush,
  CalendarCheck,
  Check,
  CheckCircle2,
  Loader2,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isNative, listSchedules, saveSchedule } from "@/lib/wincare/bridge";
import { runQuickCheckup } from "@/lib/wincare/quickCheckup";
import {
  DEFAULT_WEEKLY_CLEANUP,
  describeConfig,
  JOB_TEXT,
  TIMES,
  WEEK_DAYS,
} from "@/lib/wincare/schedule";
import { actions, useStore } from "@/lib/wincare/store";
import { invalidateSystemData } from "@/lib/wincare/systemData";
import { TONE_CALLOUT } from "@/lib/wincare/tone";
import type { ScheduleConfig, ScheduleEntry } from "@/lib/wincare/types";
import { useAdmin } from "@/lib/wincare/useAdmin";
import { ChoiceChips } from "./ChoiceChips";
import { ModalShell } from "./ConfirmModal";
import { PreferenceSwitches } from "./Preferences";
import { ErrorState, LoadingState } from "./States";
import { StatusBadge } from "./StatusBadge";

const STEPS = [
  { id: "welcome", short: "Boas-vindas", title: "Boas-vindas ao WinCare" },
  { id: "preferences", short: "Preferências", title: "Suas preferências" },
  { id: "cleanup", short: "Limpeza semanal", title: "Limpeza automática toda semana" },
  { id: "admin", short: "Administrador", title: "O que é o modo administrador" },
] as const;

/**
 * Introdução da primeira execução (4 passos). Abre quando `onboardingDone` é
 * falso — quem nunca abriu o app, ou quem pediu para rever em Configurações.
 * Pular, fechar (Esc) ou concluir marca como vista.
 */
export function FirstRunWizard() {
  const onboardingDone = useStore((s) => s.onboardingDone);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Só no cliente, depois de montar: o servidor (versão web) nunca renderiza o diálogo.
  useEffect(() => setMounted(true), []);
  const open = mounted && !onboardingDone;

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // A cada passo, o foco vai para o título do passo: o Narrador lê onde você está.
  const firstStep = useRef(true);
  useEffect(() => {
    if (!open) return;
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    const heading = bodyRef.current?.closest("[role=dialog]")?.querySelector<HTMLElement>("h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }, [step, open]);

  const finish = (checkup: boolean) => {
    actions.setOnboardingDone(true);
    if (checkup) {
      void navigate({ to: "/" });
      void runQuickCheckup({ focusResults: true });
    }
  };

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <ModalShell
      open={open}
      title={current.title}
      icon={<Sparkles className="size-5 shrink-0 text-primary" />}
      className="max-w-2xl"
      describeBody={false}
      dismissOnBackdrop={false}
      onClose={() => finish(false)}
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            className="sm:mr-auto"
            onClick={() => {
              finish(false);
              toast.info("Introdução pulada", {
                description: "Você pode rever quando quiser em Configurações.",
              });
            }}
          >
            Pular introdução
          </Button>
          {step > 0 && (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
              Voltar
            </Button>
          )}
          {last ? (
            <>
              <Button type="button" variant="outline" onClick={() => finish(false)}>
                Concluir
              </Button>
              <Button type="button" onClick={() => finish(true)}>
                <ScanSearch /> Concluir e fazer checkup rápido
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => setStep((s) => s + 1)}>
              Continuar
            </Button>
          )}
        </>
      }
    >
      {/* Altura mínima: os botões não "pulam" de lugar entre os passos. */}
      <div ref={bodyRef} className="space-y-4 pb-1 sm:min-h-[22rem] short:min-h-0">
        <StepIndicator step={step} />
        {current.id === "welcome" && <WelcomeStep />}
        {current.id === "preferences" && <PreferencesStep />}
        {current.id === "cleanup" && <CleanupStep />}
        {current.id === "admin" && <AdminStep onRestart={() => actions.setOnboardingDone(true)} />}
      </div>
    </ModalShell>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div>
      <p className="sr-only">
        Passo {step + 1} de {STEPS.length}: {STEPS[step].short}
      </p>
      <ol aria-hidden className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <li key={s.id} className="space-y-1">
            <span
              className={cn(
                "block h-1 rounded-full",
                i <= step ? "bg-primary forced-colors:bg-[Highlight]" : "bg-muted",
              )}
            />
            <span
              className={cn(
                "hidden text-[11px] sm:block",
                i === step ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {i + 1}. {s.short}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Bullets({
  icon,
  tone,
  items,
}: {
  icon: "check" | "ban";
  tone: string;
  items: ReactNode[];
}) {
  const Icon = icon === "check" ? Check : Ban;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone)} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function WelcomeStep() {
  return (
    <>
      <p>
        O WinCare cuida da manutenção do Windows num lugar só: mostra o que está pesando, limpa o
        que sobra e repara o sistema com as ferramentas do próprio Windows.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <section aria-labelledby="wizard-does" className="surface-inset space-y-2 p-3">
          <h3 id="wizard-does" className="font-medium text-foreground">
            O que ele faz
          </h3>
          <Bullets
            icon="check"
            tone="text-success"
            items={[
              "Mostra a saúde do PC: processador, memória, discos, temperatura e inicialização.",
              "Limpa temporários, caches de navegadores e restos de programas desinstalados.",
              "Repara o Windows com SFC, DISM e a verificação de disco.",
              "Sugere o que fazer, com um clique para resolver.",
            ]}
          />
        </section>
        <section aria-labelledby="wizard-never" className="surface-inset space-y-2 p-3">
          <h3 id="wizard-never" className="font-medium text-foreground">
            O que ele nunca faz
          </h3>
          <Bullets
            icon="ban"
            tone="text-destructive"
            items={[
              "Apagar algo sem mostrar antes e pedir sua confirmação. Senhas, favoritos e extensões dos navegadores nunca são tocados.",
              "Mudar algo sozinho: toda ação começa com um clique seu ou com uma rotina que você agendou.",
              "Enviar seus dados para a internet. A única consulta automática é a de novas versões, no GitHub — dá para desligar no próximo passo.",
              "Instalar outros programas ou mexer em serviços escondidos do Windows.",
            ]}
          />
        </section>
      </div>
      <p className="text-xs">
        Ações de risco mostram um aviso antes e podem criar um ponto de restauração para desfazer.
        Você pode rever esta introdução em Configurações.
      </p>
    </>
  );
}

function PreferencesStep() {
  return (
    <>
      <p>
        Elas valem na hora e ficam salvas neste computador. Dá para mudar depois em Configurações.
      </p>
      <div className="text-foreground">
        <PreferenceSwitches
          keys={["theme", "confirmCritical", "autoRestorePoint", "autoCheck", "autoCheckUpdates"]}
        />
      </div>
    </>
  );
}

type CleanupStatus =
  | { kind: "loading" }
  | { kind: "error"; message?: string }
  | { kind: "ready"; entry: ScheduleEntry | undefined };

function CleanupStep() {
  const [status, setStatus] = useState<CleanupStatus>({ kind: "loading" });
  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_WEEKLY_CLEANUP);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setStatus({ kind: "loading" });
    try {
      const out = await listSchedules();
      if (!out.ok) throw new Error(out.reason);
      setStatus({ kind: "ready", entry: out.items.find((i) => i.job === "cleanup") });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : undefined });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const schedule = async () => {
    setSaving(true);
    try {
      const out = await saveSchedule("cleanup", config);
      if (!out.ok) {
        toast.error("Não foi possível agendar a limpeza.", { description: out.reason });
        return;
      }
      invalidateSystemData("schedules");
      toast.success("Limpeza semanal agendada", { description: describeConfig(config) });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const scheduled = status.kind === "ready" && status.entry?.enabled;

  return (
    <>
      <p>
        O Agendador de Tarefas do Windows roda a limpeza do WinCare sozinho, mesmo com o app
        fechado. Leva poucos minutos e não pede nada.
      </p>
      <ul className="space-y-1 text-xs">
        {JOB_TEXT.cleanup.includes.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <CheckCircle2 aria-hidden className="mt-px size-3.5 shrink-0 text-success" />
            {line}
          </li>
        ))}
      </ul>

      {status.kind === "loading" && (
        <LoadingState label="Consultando o Agendador de Tarefas…" variant="block" />
      )}
      {status.kind === "error" && (
        <ErrorState
          size="sm"
          title="Não foi possível consultar o Agendador de Tarefas"
          description={status.message}
          onRetry={() => void load()}
        />
      )}
      {scheduled && status.kind === "ready" && status.entry && (
        <p
          role="status"
          className={cn("flex items-start gap-2 rounded-xl border p-3", TONE_CALLOUT.success)}
        >
          <CalendarCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">
              Limpeza agendada: {describeConfig(status.entry.config)}.
            </span>{" "}
            <span className="text-muted-foreground">Dá para mudar em Agendamento.</span>
          </span>
        </p>
      )}
      {status.kind === "ready" && !scheduled && (
        <div className="surface-inset @container space-y-3 p-3.5 text-foreground">
          <div className="grid gap-1.5 @xs:grid-cols-[5.5rem_1fr] @xs:items-center">
            <span className="text-xs font-medium text-muted-foreground">Dia</span>
            <ChoiceChips
              label="Dia da limpeza"
              value={config.weekDay}
              options={WEEK_DAYS}
              disabled={saving}
              onChange={(weekDay) => setConfig((c) => ({ ...c, weekDay }))}
            />
          </div>
          <div className="grid gap-1.5 @xs:grid-cols-[5.5rem_1fr] @xs:items-center">
            <span className="text-xs font-medium text-muted-foreground">Horário</span>
            <ChoiceChips
              label="Horário da limpeza"
              value={config.time}
              options={TIMES}
              disabled={saving}
              onChange={(time) => setConfig((c) => ({ ...c, time }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              className="rounded-full"
              disabled={saving}
              onClick={() => void schedule()}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Brush />}
              {saving ? "Agendando…" : "Agendar limpeza semanal"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {describeConfig(config)}. Se preferir, continue sem agendar.
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function AdminStep({ onRestart }: { onRestart: () => void }) {
  const { native, elevated, restartAsAdmin } = useAdmin();

  const restart = async () => {
    onRestart();
    const out = await restartAsAdmin();
    if (out.ok && out.reason === "already-elevated") {
      toast.info("O WinCare já está em modo administrador.");
    } else if (out.ok) {
      toast.info("Reabrindo como administrador…");
    } else {
      toast.error("Não foi possível pedir permissão de administrador.", {
        description: out.reason,
      });
    }
  };

  return (
    <>
      <p>
        Algumas ferramentas mexem em partes protegidas do Windows — SFC, DISM, a limpeza do Prefetch
        e programas que abrem para todos os usuários. Para elas, o Windows pede sua permissão (a
        janela do Controle de Conta de Usuário).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface-inset space-y-1 p-3">
          <p className="font-medium text-foreground">Aprovar quando pedir (recomendado)</p>
          <p className="text-xs">
            O WinCare abre normalmente. O Windows pergunta só quando você usar uma dessas
            ferramentas.
          </p>
        </div>
        <div className="surface-inset space-y-1 p-3">
          <p className="font-medium text-foreground">Abrir sempre como administrador</p>
          <p className="text-xs">
            Sem perguntas a cada comando — bom para quem faz muita manutenção. Clique com o botão
            direito no WinCare e escolha “Executar como administrador”.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span>Agora:</span>
        {native ? (
          <StatusBadge tone={elevated ? "success" : "neutral"}>
            <ShieldCheck aria-hidden className="size-3" />
            {elevated ? "Executando como administrador" : "Executando como usuário padrão"}
          </StatusBadge>
        ) : (
          <StatusBadge tone="primary">Modo demonstração — nada é executado de verdade</StatusBadge>
        )}
        {native && elevated === false && (
          <Button type="button" variant="secondary" size="sm" onClick={() => void restart()}>
            <ShieldCheck /> Reabrir como administrador agora
          </Button>
        )}
      </div>
      {!isNative() && (
        <p className="text-xs">
          No app desktop, o botão para reabrir como administrador aparece aqui.
        </p>
      )}
    </>
  );
}
