import { useEffect, useId, useRef, useState } from "react";
import { Battery, Briefcase, Gamepad2, Gauge, Loader2, Scale } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getNative, isNative } from "@/lib/wincare/bridge";
import { PROFILE_META, sessionNote, type ProfileId } from "@/lib/wincare/intelligence";
import { intelActions, useIntel } from "@/lib/wincare/intelligenceStore";
import { unlockUi } from "@/lib/wincare/unlockUi";
import { Panel, PanelHeader } from "./Panel";
import { EmptyState } from "./States";
import { StatusBadge } from "./StatusBadge";

const ICONS: Record<ProfileId, typeof Gamepad2> = {
  balanced: Scale,
  gaming: Gamepad2,
  work: Briefcase,
  battery: Battery,
};

function durationLabel(ms: number) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (!Number.isFinite(min)) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

export function SystemProfilesCard() {
  const profile = useIntel((s) => s.profile);
  const [busy, setBusy] = useState<ProfileId | null>(null);
  const [pending, setPending] = useState<ProfileId | null>(null);
  const [armed, setArmed] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const questionId = useId();
  const baseId = useId();

  // A confirmação aparece abaixo dos botões: leva o foco até ela (teclado/Narrador).
  useEffect(() => {
    if (pending) confirmRef.current?.focus();
  }, [pending]);

  const cancel = () => {
    setPending(null);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    unlockUi();
    const arm = window.setTimeout(() => setArmed(true), 350);
    const u = window.setTimeout(unlockUi, 200);
    return () => {
      window.clearTimeout(arm);
      window.clearTimeout(u);
    };
  }, []);

  const apply = async (id: ProfileId) => {
    setPending(null);
    setBusy(id);
    try {
      const native = getNative();
      if (native?.powerPlan) {
        const out = await native.powerPlan({ action: "set", profile: id });
        if (!out.ok) {
          toast.error("Não foi possível mudar o plano de energia.", { description: out.reason });
          return;
        }
        toast.success(`${PROFILE_META[id].title} ativado`, {
          description: out.active ? `Windows: ${out.active.name}` : PROFILE_META[id].planHint,
        });
      } else {
        toast.success(`${PROFILE_META[id].title} ativado (demonstração)`);
      }
      intelActions.setProfile(id);
    } catch (err) {
      toast.error("Não foi possível aplicar o perfil.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(null);
      unlockUi();
    }
  };

  return (
    <Panel className="@container">
      <PanelHeader
        icon={Gauge}
        title="Perfis"
        description="Ajusta o plano de energia do Windows para jogos, trabalho ou bateria — sem mexer em serviços escondidos."
      />
      <div className="grid gap-3 @lg:grid-cols-2">
        {(Object.keys(PROFILE_META) as ProfileId[]).map((id) => {
          const meta = PROFILE_META[id];
          const Icon = ICONS[id];
          const active = profile === id;
          return (
            <Button
              key={id}
              type="button"
              variant={active ? "default" : "outline"}
              disabled={!!busy || !armed}
              aria-pressed={active}
              aria-labelledby={`${baseId}-${id}-title`}
              aria-describedby={`${baseId}-${id}-detail`}
              onClick={(event) => {
                if (!armed) return;
                triggerRef.current = event.currentTarget;
                setPending(id);
              }}
              className="h-auto w-full flex-col items-start gap-1.5 whitespace-normal rounded-xl p-4 text-left"
            >
              <span className="flex w-full items-center gap-2">
                <Icon className="size-4 shrink-0" />
                <span id={`${baseId}-${id}-title`} className="min-w-0 font-medium">
                  {meta.title}
                </span>
                {active && <span className="ml-auto text-[10px] font-semibold">Ativo</span>}
              </span>
              <span id={`${baseId}-${id}-detail`} className="flex flex-col gap-1">
                <span className="text-xs font-normal leading-relaxed">{meta.detail}</span>
                <span className="text-[11px] font-normal">{meta.planHint}</span>
              </span>
            </Button>
          );
        })}
      </div>
      {pending && (
        <div
          role="group"
          aria-labelledby={questionId}
          className="surface-inset flex flex-wrap items-center gap-2 px-3 py-2.5"
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
        >
          <p id={questionId} className="min-w-0 flex-1 text-sm text-muted-foreground">
            Ativar{" "}
            <span className="font-medium text-foreground">{PROFILE_META[pending].title}</span>? O
            Windows muda o plano para {PROFILE_META[pending].planHint}.
            {!isNative() ? " No navegador só fica registrado localmente." : ""}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={cancel}>
            Cancelar
          </Button>
          <Button ref={confirmRef} type="button" size="sm" onClick={() => void apply(pending)}>
            Ativar
          </Button>
        </div>
      )}
      {busy && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Aplicando plano de energia…
        </p>
      )}
    </Panel>
  );
}

export function GamingSessionCard() {
  const active = useIntel((s) => s.activeSession);
  const sessions = useIntel((s) => s.sessions);

  useEffect(() => {
    unlockUi();
    const t = window.setTimeout(unlockUi, 200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <Panel>
      <PanelHeader
        icon={Gamepad2}
        title="Sessões de jogo"
        description="Quando um jogo conhecido (ou uso alto de GPU) aparece, o WinCare registra CPU, memória e GPU."
      />

      {active && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
          <StatusBadge tone="primary" dot>
            Em andamento
          </StatusBadge>
          <p className="mt-1 font-semibold">{active.game}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            CPU {Math.round(active.avgCpu)}% · memória {Math.round(active.avgRam)}%
            {typeof active.avgGpu === "number" ? ` · GPU ${Math.round(active.avgGpu)}%` : ""} ·{" "}
            {durationLabel(Date.now() - active.startedAt)}
          </p>
        </div>
      )}

      {sessions.length === 0 && !active && (
        <EmptyState
          size="sm"
          icon={Gamepad2}
          title="Nenhuma sessão ainda"
          description="Deixe o WinCare aberto enquanto joga para registrar a sessão."
        />
      )}

      <ul className="space-y-2">
        {sessions.slice(0, 8).map((s) => (
          <li key={s.id} className="surface-inset px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{s.game}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(s.startedAt).toLocaleString("pt-BR")} ·{" "}
                {durationLabel((s.endedAt || Date.now()) - s.startedAt)}
              </p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Média: CPU {Math.round(s.avgCpu)}% · memória {Math.round(s.avgRam)}%
              {typeof s.avgGpu === "number" ? ` · GPU ${Math.round(s.avgGpu)}%` : ""} · pico CPU{" "}
              {Math.round(s.maxCpu)}%
            </p>
            <p className="mt-1 text-xs text-foreground/80">{sessionNote(s)}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
