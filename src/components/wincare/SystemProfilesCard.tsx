import { useEffect, useState } from "react";
import { Battery, Briefcase, Gamepad2, Loader2, Scale } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNative, isNative } from "@/lib/wincare/bridge";
import {
  PROFILE_META,
  sessionNote,
  type ProfileId,
} from "@/lib/wincare/intelligence";
import { intelActions, useIntel } from "@/lib/wincare/intelligenceStore";
import { unlockUi } from "@/lib/wincare/unlockUi";

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
          toast.error(out.reason || "Não foi possível mudar o plano de energia.");
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
      toast.error(err instanceof Error ? err.message : "Falha ao aplicar perfil.");
    } finally {
      setBusy(null);
      unlockUi();
    }
  };

  return (
    <Card className="surface-panel flex flex-col gap-4 border-border/60 p-5">
      <div>
        <h2 className="text-lg font-semibold">Perfis</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajusta o plano de energia do Windows. Jogos, trabalho e bateria — sem mexer em serviços
          escondidos.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
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
              onClick={() => {
                if (!armed) return;
                setPending(id);
              }}
              className="h-auto w-full flex-col items-start gap-1.5 whitespace-normal rounded-xl p-4 text-left"
            >
              <span className="flex w-full items-center gap-2">
                <Icon className="size-4 shrink-0" />
                <span className="font-medium">{meta.title}</span>
                {active && (
                  <span className="ml-auto text-[10px] font-medium opacity-90">Ativo</span>
                )}
              </span>
              <span className="text-xs font-normal leading-relaxed opacity-80">{meta.detail}</span>
              <span className="text-[11px] font-normal opacity-70">{meta.planHint}</span>
            </Button>
          );
        })}
      </div>
      {pending && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            Ativar <span className="font-medium text-foreground">{PROFILE_META[pending].title}</span>?
            O Windows muda o plano para {PROFILE_META[pending].planHint}.
            {!isNative() ? " No navegador só fica registrado localmente." : ""}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => setPending(null)}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={() => void apply(pending)}>
            Ativar
          </Button>
        </div>
      )}
      {busy && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Aplicando plano de energia…
        </p>
      )}
    </Card>
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
    <Card className="surface-panel flex flex-col gap-4 border-border/60 p-5">
      <div>
        <h2 className="text-lg font-semibold">Sessões de jogo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quando um jogo conhecido (ou GPU alta) aparece, o WinCare registra CPU, RAM e GPU.
        </p>
      </div>

      {active && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Em andamento</p>
          <p className="mt-1 font-semibold">{active.game}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            CPU {Math.round(active.avgCpu)}% · RAM {Math.round(active.avgRam)}%
            {typeof active.avgGpu === "number" ? ` · GPU ${Math.round(active.avgGpu)}%` : ""} ·{" "}
            {durationLabel(Date.now() - active.startedAt)}
          </p>
        </div>
      )}

      {sessions.length === 0 && !active && (
        <p className="text-sm text-muted-foreground">
          Nenhuma sessão ainda. Deixe o app aberto enquanto joga.
        </p>
      )}

      <ul className="space-y-2">
        {sessions.slice(0, 8).map((s) => (
          <li key={s.id} className="rounded-xl border border-border/50 px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{s.game}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(s.startedAt).toLocaleString("pt-BR")} ·{" "}
                {durationLabel((s.endedAt || Date.now()) - s.startedAt)}
              </p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Média CPU {Math.round(s.avgCpu)}% · RAM {Math.round(s.avgRam)}%
              {typeof s.avgGpu === "number" ? ` · GPU ${Math.round(s.avgGpu)}%` : ""} · pico CPU{" "}
              {Math.round(s.maxCpu)}%
            </p>
            <p className="mt-1 text-xs text-foreground/80">{sessionNote(s)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
