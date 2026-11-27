import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { plural } from "@/lib/wincare/format";
import {
  cachedProgramUpdates,
  listProgramUpdates,
  updateProgram,
  type ProgramUpdate,
} from "@/lib/wincare/programUpdates";
import { ConfirmModal } from "./ConfirmModal";
import { Panel, PanelHeader } from "./Panel";

const PREVIEW = 5;

const REASON_TEXT: Record<string, string> = {
  "no-winget":
    "O winget (Gerenciador de Pacotes do Windows) não está instalado. Instale o “Instalador de Aplicativo” pela Microsoft Store.",
  "winget-failed": "O winget não respondeu. Tente de novo em alguns minutos.",
};

/**
 * Programas com versão nova (winget). Atualiza um por vez, em modo silencioso;
 * alguns instaladores ainda pedem permissão de administrador.
 */
export function ProgramUpdates() {
  const initial = cachedProgramUpdates();
  const [items, setItems] = useState<ProgramUpdate[]>(initial?.items ?? []);
  const [state, setState] = useState<"loading" | "ready" | "error" | "hidden">(
    initial ? "ready" : "loading",
  );
  const [reason, setReason] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [confirmAll, setConfirmAll] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async (force: boolean) => {
    setState("loading");
    const out = await listProgramUpdates(force).catch(() => null);
    if (!alive.current) return;
    if (!out || (!out.ok && out.reason === "unsupported") || out.reason === "not-windows") {
      setState("hidden");
      return;
    }
    setItems(out.items);
    setReason(out.ok ? null : (out.reason ?? "winget-failed"));
    setState(out.ok ? "ready" : "error");
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!cachedProgramUpdates()) void load(false);
    return () => {
      alive.current = false;
    };
  }, [load]);

  const runOne = useCallback(async (item: ProgramUpdate) => {
    setRunning(item.id);
    const out = await updateProgram(item.id).catch(() => null);
    if (!alive.current) return;
    setRunning(null);
    if (out?.ok) {
      setItems((list) => list.filter((p) => p.id !== item.id));
      toast.success(`${item.name} atualizado para ${item.available}`);
    } else {
      toast.error(`${item.name} não foi atualizado`, {
        description: out?.message ?? "Tente de novo ou atualize pelo próprio programa.",
      });
    }
  }, []);

  // Fila do "Atualizar todos": um de cada vez.
  useEffect(() => {
    if (running || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    const item = items.find((p) => p.id === next);
    if (item) void runOne(item);
  }, [queue, running, items, runOne]);

  if (state === "hidden") return null;

  const shown = expanded ? items : items.slice(0, PREVIEW);
  const busy = running !== null || queue.length > 0;

  return (
    <Panel data-wincare-program-updates>
      <PanelHeader
        icon={Download}
        size="sm"
        title="Atualizações de programas"
        description={
          state === "loading"
            ? "Procurando versões novas com o winget…"
            : state === "error"
              ? (REASON_TEXT[reason ?? ""] ?? REASON_TEXT["winget-failed"])
              : items.length
                ? `${plural(items.length, "programa tem", "programas têm")} versão nova. Atualizar corrige falhas de segurança.`
                : "Todos os programas que o winget conhece estão na versão mais nova."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {state === "ready" && items.length > 1 && (
              <Button type="button" size="sm" disabled={busy} onClick={() => setConfirmAll(true)}>
                <Download /> Atualizar todos
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={state === "loading" || busy}
              onClick={() => void load(true)}
            >
              {state === "loading" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Procurar
            </Button>
          </div>
        }
      />

      {state === "ready" && items.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 aria-hidden className="size-4" /> Tudo em dia
        </p>
      )}

      {state === "ready" && items.length > 0 && (
        <>
          <ul className="divide-y divide-border/60" aria-label="Atualizações disponíveis">
            {shown.map((item) => {
              const isRunning = running === item.id;
              const queued = queue.includes(item.id);
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                      {item.version ?? "versão desconhecida"}
                      <ArrowRight aria-hidden className="size-3" />
                      <span className="font-medium text-foreground">{item.available}</span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void runOne(item)}
                    aria-label={`Atualizar ${item.name}`}
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="animate-spin" /> Atualizando…
                      </>
                    ) : queued ? (
                      "Na fila"
                    ) : (
                      "Atualizar"
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
          {items.length > PREVIEW && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Mostrar menos" : `Ver todos (${items.length})`}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Feche o programa antes de atualizar. Alguns instaladores pedem permissão de
            administrador.
          </p>
        </>
      )}

      <ConfirmModal
        open={confirmAll}
        title={`Atualizar ${plural(items.length, "programa", "programas")}?`}
        confirmLabel="Atualizar todos"
        onConfirm={() => {
          setConfirmAll(false);
          setQueue(items.map((p) => p.id));
        }}
        onCancel={() => setConfirmAll(false)}
      >
        <p>
          O WinCare atualiza um por vez, sem abrir os instaladores. Pode levar vários minutos e o
          Windows pode pedir permissão de administrador para alguns. Salve o que estiver aberto
          nesses programas antes.
        </p>
      </ConfirmModal>
    </Panel>
  );
}
