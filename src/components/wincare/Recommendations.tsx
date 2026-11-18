import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import {
  BellOff,
  CircleAlert,
  ExternalLink,
  Lightbulb,
  Loader2,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { isNative, openWindowsTarget } from "@/lib/wincare/bridge";
import { plural } from "@/lib/wincare/format";
import { CHECKUP_STEPS, runQuickCheckup, useQuickCheckup } from "@/lib/wincare/quickCheckup";
import {
  SEVERITY_LABEL,
  type Recommendation,
  type RecommendationDismissal,
  type RecommendationSeverity,
} from "@/lib/wincare/recommendations";
import { actions, useStore } from "@/lib/wincare/store";
import type { Tone } from "@/lib/wincare/tone";
import type { SystemInfo } from "@/lib/wincare/types";
import { useRecommendations } from "@/lib/wincare/useRecommendations";
import { IconChip } from "./IconChip";
import { Panel, PanelHeader } from "./Panel";
import { EmptyState, LoadingState } from "./States";
import { StatusBadge } from "./StatusBadge";

const SEVERITY_META: Record<
  RecommendationSeverity,
  { icon: ComponentType<{ className?: string }>; tone: Tone }
> = {
  critical: { icon: CircleAlert, tone: "danger" },
  warning: { icon: TriangleAlert, tone: "warning" },
  tip: { icon: Lightbulb, tone: "primary" },
};

const COMPACT_LIMIT = 4;
const DAY_MS = 86_400_000;

/* Aviso ao abrir o app: uma vez por sessão, não a cada visita ao Dashboard. */
let startupCheckDone = false;
/* Resumo do checkup: anunciado uma vez, mesmo que o card monte de novo depois. */
let announcedCheckupAt = 0;

/** Leva o foco ao título do card (quando o item focado some da lista). */
function focusHeading(headingId: string) {
  const heading = document.getElementById(headingId);
  if (!heading) return;
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}

function dismissalLabel(d: RecommendationDismissal, now = Date.now()) {
  if (d.until === null) return "Ignorada";
  const days = Math.max(1, Math.ceil((d.until - now) / DAY_MS));
  return days === 1 ? "Volta amanhã" : `Volta em ${days} dias`;
}

/**
 * Recomendações do motor único. `compact` (Dashboard): até 4 itens e atalho
 * para o resto; `full` (Inteligência): todos, com a lista do que foi adiado.
 */
export function RecommendationsPanel({
  variant,
  info,
}: {
  variant: "compact" | "full";
  info: SystemInfo;
}) {
  const { active, hidden, loading } = useRecommendations(info, {
    deferMs: variant === "full" ? 400 : 0,
  });
  const autoCheck = useStore((s) => s.autoCheck);
  const onboardingDone = useStore((s) => s.onboardingDone);
  const lastCheckupAt = useStore((s) => s.lastCheckupAt);
  const checkup = useQuickCheckup();
  const [summary, setSummary] = useState<string | null>(null);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const compact = variant === "compact";
  const shown = compact ? active.slice(0, COMPACT_LIMIT) : active;
  const urgent = active.filter((r) => r.severity !== "tip").length;

  // Fim do checkup: resumo (na tela, para o Narrador e em um toast). Espera um
  // instante para as leituras novas chegarem às recomendações.
  useEffect(() => {
    if (!checkup.finishedAt || checkup.finishedAt === announcedCheckupAt) return;
    const t = window.setTimeout(() => {
      announcedCheckupAt = checkup.finishedAt ?? 0;
      const list = activeRef.current;
      const critical = list.filter((r) => r.severity === "critical").length;
      const text =
        list.length === 0
          ? "Checkup concluído: nada pendente."
          : `Checkup concluído: ${plural(list.length, "recomendação", "recomendações")}${
              critical ? `, ${plural(critical, "crítica", "críticas")}` : ""
            }.`;
      setSummary(text);
      const note = checkup.failed.length
        ? `Não foi possível ler: ${checkup.failed.join(", ").toLowerCase()}.`
        : undefined;
      if (critical || checkup.failed.length) toast.warning(text, { description: note });
      else toast.success(text, { description: note });
    }, 400);
    return () => window.clearTimeout(t);
  }, [checkup.finishedAt, checkup.failed]);

  // Pedido de foco (fim da introdução): leva o teclado/Narrador ao card.
  useEffect(() => {
    if (!checkup.focusRequest) return;
    const t = window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ block: "start" });
      focusHeading(headingId);
    }, 250);
    return () => window.clearTimeout(t);
  }, [checkup.focusRequest, headingId]);

  useEffect(() => {
    // Primeira execução: a introdução está na tela; o aviso vem depois, pelo checkup.
    if (!onboardingDone) return;
    // Com checkup nesta sessão, o resumo dele substitui este aviso (nada de dois toasts).
    if (checkup.running || checkup.finishedAt) {
      startupCheckDone = true;
      return;
    }
    if (!compact || loading || !autoCheck || startupCheckDone) return;
    startupCheckDone = true;
    if (urgent === 0) return;
    toast.warning(
      urgent === 1 ? "1 item precisa de atenção" : `${urgent} itens precisam de atenção`,
      {
        action: {
          label: "Ver",
          onClick: () => {
            panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            focusHeading(headingId);
          },
        },
      },
    );
  }, [
    compact,
    loading,
    autoCheck,
    urgent,
    headingId,
    onboardingDone,
    checkup.running,
    checkup.finishedAt,
  ]);

  return (
    <Panel ref={panelRef} aria-labelledby={headingId} role="region">
      <PanelHeader
        icon={Lightbulb}
        size="sm"
        titleId={headingId}
        title="Recomendações"
        description={
          compact
            ? undefined
            : "Com base em espaço, proteção, memória, inicialização, atualizações e no histórico de saúde."
        }
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-full"
              disabled={checkup.running}
              title="Lê o estado do PC de novo, sem alterar nada"
              onClick={() => {
                setSummary(null);
                void runQuickCheckup();
              }}
            >
              {checkup.running ? <Loader2 className="animate-spin" /> : <ScanSearch />}
              {checkup.running ? "Fazendo checkup…" : "Checkup rápido"}
            </Button>
            {compact && (active.length > COMPACT_LIMIT || hidden.length > 0) && (
              <Button asChild variant="ghost" size="sm" className="rounded-full">
                <Link to="/inteligencia">
                  Ver todas
                  {active.length > COMPACT_LIMIT && ` (${active.length})`}
                </Link>
              </Button>
            )}
          </>
        }
      />

      <CheckupStatus
        running={checkup.running}
        step={checkup.step}
        summary={summary}
        lastCheckupAt={lastCheckupAt}
      />

      {loading ? (
        <LoadingState label="Analisando o computador…" rows={2} />
      ) : shown.length === 0 ? (
        <EmptyState
          size="sm"
          tone="success"
          icon={ShieldCheck}
          title="Nada pendente"
          description="Nas medições atuais, espaço, proteção, memória e inicialização estão dentro do esperado."
        />
      ) : (
        <ul className="divide-y divide-border/60" aria-labelledby={headingId}>
          {shown.map((rec) => (
            <RecommendationItem
              key={rec.id}
              rec={rec}
              compact={compact}
              onGone={(nextFocus) => (nextFocus ? nextFocus.focus() : focusHeading(headingId))}
            />
          ))}
        </ul>
      )}

      {compact && hidden.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {hidden.length === 1
            ? "1 recomendação adiada ou ignorada"
            : `${hidden.length} recomendações adiadas ou ignoradas`}
          {" — "}
          <Link to="/inteligencia" className="font-medium text-primary hover:underline">
            ver em Inteligência
          </Link>
        </p>
      )}

      {!compact && hidden.length > 0 && <HiddenRecommendations items={hidden} />}
    </Panel>
  );
}

function RecommendationItem({
  rec,
  compact,
  onGone,
}: {
  rec: Recommendation;
  compact: boolean;
  onGone: (nextFocus: HTMLElement | null) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const itemRef = useRef<HTMLLIElement>(null);
  const snoozeRef = useRef<HTMLButtonElement>(null);
  const optionsId = useId();
  const meta = SEVERITY_META[rec.severity];

  const dismiss = (mode: 1 | 7 | "ignore") => {
    // Foco vai para o próximo item (ou o título do card), não se perde no <body>.
    const next =
      (
        itemRef.current?.nextElementSibling ?? itemRef.current?.previousElementSibling
      )?.querySelector<HTMLElement>("a, button") ?? null;
    if (mode === "ignore") actions.ignoreRecommendation(rec.id);
    else actions.snoozeRecommendation(rec.id, mode);
    toast.success(
      mode === "ignore"
        ? `“${rec.title}” foi ignorada`
        : `“${rec.title}” adiada por ${mode === 1 ? "1 dia" : "7 dias"}`,
      {
        description: mode === "ignore" ? "Restaure quando quiser em Inteligência." : undefined,
        action: { label: "Desfazer", onClick: () => actions.restoreRecommendation(rec.id) },
      },
    );
    requestAnimationFrame(() => onGone(next));
  };

  return (
    <li
      ref={itemRef}
      className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0"
    >
      <IconChip icon={meta.icon} tone={meta.tone} size="sm" />
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium">
            {compact && <span className="sr-only">{SEVERITY_LABEL[rec.severity]}: </span>}
            {rec.title}
          </p>
          {!compact && <StatusBadge tone={meta.tone}>{SEVERITY_LABEL[rec.severity]}</StatusBadge>}
        </div>
        <p
          className={cn(
            "mt-0.5 text-xs leading-relaxed text-muted-foreground",
            compact && "line-clamp-2",
          )}
        >
          {rec.detail}
        </p>
        {choosing && (
          <div
            id={optionsId}
            role="group"
            aria-label={`Esconder “${rec.title}”`}
            className="mt-2 flex flex-wrap items-center gap-1.5"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setChoosing(false);
                snoozeRef.current?.focus();
              }
            }}
          >
            <span className="text-xs text-muted-foreground">Esconder por:</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-full"
              onClick={() => dismiss(1)}
            >
              1 dia
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-full"
              onClick={() => dismiss(7)}
            >
              7 dias
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-full"
              onClick={() => dismiss("ignore")}
            >
              Ignorar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 rounded-full"
              onClick={() => {
                setChoosing(false);
                snoozeRef.current?.focus();
              }}
            >
              Cancelar
            </Button>
          </div>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <RecommendationActionButton rec={rec} />
        <Button
          ref={snoozeRef}
          type="button"
          size="sm"
          variant="ghost"
          className="rounded-full text-muted-foreground"
          aria-expanded={choosing}
          aria-controls={choosing ? optionsId : undefined}
          aria-label={`Adiar ${rec.title}`}
          title="Adiar ou ignorar"
          onClick={() => {
            setChoosing((v) => !v);
            // Abre e já põe o foco na primeira opção.
            if (!choosing)
              requestAnimationFrame(() =>
                document.getElementById(optionsId)?.querySelector("button")?.focus(),
              );
          }}
        >
          <BellOff />
          <span className={compact ? "sr-only" : undefined}>Adiar</span>
        </Button>
      </div>
    </li>
  );
}

function RecommendationActionButton({ rec }: { rec: Recommendation }) {
  const { label, to, command } = rec.action;
  if (to) {
    return (
      <Button asChild size="sm" variant="secondary" className="rounded-full">
        <Link to={to}>{label}</Link>
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      className="rounded-full"
      onClick={() => {
        if (!command) return;
        if (!isNative()) {
          toast.info("Disponível no app desktop", {
            description: "No modo demonstração as configurações do Windows não abrem.",
          });
          return;
        }
        void openWindowsTarget(command);
      }}
    >
      <ExternalLink />
      {label}
    </Button>
  );
}

function HiddenRecommendations({
  items,
}: {
  items: (Recommendation & { dismissal: RecommendationDismissal })[];
}) {
  return (
    <details className="surface-inset group px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium select-none">
        Adiadas e ignoradas ({items.length})
      </summary>
      <ul className="mt-2 divide-y divide-border/60">
        {items.map((rec) => (
          <li key={rec.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <div className="min-w-0 flex-1 basis-48">
              <p className="text-sm">{rec.title}</p>
              <p className="text-xs text-muted-foreground">{dismissalLabel(rec.dismissal)}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full"
              aria-label={`Restaurar ${rec.title}`}
              onClick={() => {
                actions.restoreRecommendation(rec.id);
                toast.success(`“${rec.title}” voltou para a lista`);
              }}
            >
              <RotateCcw /> Restaurar
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function formatWhen(ts: number) {
  const date = new Date(ts);
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `hoje às ${time}`;
  return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${time}`;
}

/** Progresso e resultado do checkup rápido (anunciados ao Narrador, sem repetir cada %). */
function CheckupStatus({
  running,
  step,
  summary,
  lastCheckupAt,
}: {
  running: boolean;
  step: number;
  summary: string | null;
  lastCheckupAt: number | null;
}) {
  const total = CHECKUP_STEPS.length;
  const current = CHECKUP_STEPS[Math.min(step, total - 1)];
  return (
    <div className="space-y-1.5">
      <p role="status" className="text-xs text-muted-foreground">
        {running
          ? `Checkup rápido: ${current.label.toLowerCase()}… (${step + 1} de ${total})`
          : (summary ?? (lastCheckupAt ? `Último checkup: ${formatWhen(lastCheckupAt)}.` : ""))}
      </p>
      {running && (
        <Progress
          value={Math.round((step / total) * 100)}
          className="h-1"
          aria-label="Progresso do checkup rápido"
          aria-valuetext={`Etapa ${step + 1} de ${total}`}
        />
      )}
    </div>
  );
}
