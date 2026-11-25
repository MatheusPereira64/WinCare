import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDecimal } from "@/lib/wincare/format";
import { pageHidden } from "@/lib/wincare/pageVisibility";
import { processHint } from "@/lib/wincare/processHints";
import { endProcess, listProcesses, type ProcessInfo } from "@/lib/wincare/systemTools";
import { ChoiceChips } from "./ChoiceChips";
import { ConfirmModal } from "./ConfirmModal";
import { EmptyState } from "./States";

type SortKey = "cpu" | "memory";

/**
 * Quem está pesando: processos por CPU (% agora) ou memória, com "Encerrar"
 * para destravar um app. Processos do Windows não têm o botão.
 */
export function ProcessList({
  compact = false,
  limit = 30,
  refreshMs = 5000,
  className,
}: {
  /** Versão do painel da bandeja: só nome, uso e Encerrar. */
  compact?: boolean;
  limit?: number;
  refreshMs?: number;
  className?: string;
}) {
  const [items, setItems] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>("cpu");
  const [target, setTarget] = useState<ProcessInfo | null>(null);
  const [ending, setEnding] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setItems(await listProcesses());
    } catch {
      /* mantém a última lista */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      if (!pageHidden()) void refresh();
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [refresh, refreshMs]);

  const sorted = useMemo(() => {
    const list = [...items];
    if (sort === "cpu")
      list.sort((a, b) => (b.cpuPct ?? -1) - (a.cpuPct ?? -1) || b.memMb - a.memMb);
    else list.sort((a, b) => b.memMb - a.memMb);
    return list.slice(0, limit);
  }, [items, sort, limit]);

  const maxMem = Math.max(1, ...sorted.map((p) => p.memMb));
  const maxCpu = Math.max(1, ...sorted.map((p) => p.cpuPct ?? 0));

  const confirmEnd = async () => {
    if (!target) return;
    setEnding(true);
    try {
      const out = await endProcess(target.pid);
      if (out.ok) {
        toast.success(`${target.name} foi encerrado.`, {
          description: "Alterações não salvas nesse programa podem ter sido perdidas.",
        });
        setItems((prev) => prev.filter((p) => p.pid !== target.pid));
      } else {
        toast.error(`Não foi possível encerrar ${target.name}.`, { description: out.reason });
      }
    } finally {
      setEnding(false);
      setTarget(null);
      void refresh();
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChoiceChips
          label="Ordenar processos"
          value={sort}
          options={[
            { value: "cpu", label: "CPU" },
            { value: "memory", label: "Memória" },
          ]}
          onChange={setSort}
        />
        {!compact && (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} /> Atualizar
          </Button>
        )}
      </div>

      {loading && !items.length ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" /> Lendo processos…
        </p>
      ) : sorted.length === 0 ? (
        <EmptyState size="sm" icon={Activity} title="Nenhum processo listado" />
      ) : (
        <ul
          aria-label={sort === "cpu" ? "Processos por uso de CPU" : "Processos por uso de memória"}
          className="space-y-1"
        >
          {sorted.map((p) => {
            const value = sort === "cpu" ? (p.cpuPct ?? 0) : p.memMb;
            const max = sort === "cpu" ? maxCpu : maxMem;
            return (
              <li
                key={p.pid}
                className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-muted/30"
              >
                <span
                  aria-hidden
                  className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-xs font-bold text-primary uppercase"
                >
                  {p.name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={`${p.name} (PID ${p.pid})`}>
                    {p.name}
                  </p>
                  {processHint(p.name) && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {processHint(p.name)}
                    </p>
                  )}
                  {!compact && (
                    <div
                      aria-hidden
                      className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/60"
                    >
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-500",
                          sort === "cpu" ? "bg-primary" : "bg-chart-3",
                        )}
                        style={{ width: `${Math.max(3, (value / max) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <span className="text-right text-xs whitespace-nowrap tabular-nums">
                  <span className="font-semibold">
                    {p.cpuPct === null ? "—" : `${formatDecimal(p.cpuPct, 1)}%`}
                  </span>
                  <span className="block text-muted-foreground">
                    {p.memMb.toLocaleString("pt-BR")} MB
                  </span>
                </span>
                {p.canEnd ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-full px-2 text-xs text-primary"
                    aria-label={`Encerrar ${p.name}`}
                    onClick={() => setTarget(p)}
                  >
                    Encerrar
                  </Button>
                ) : (
                  <span
                    className="w-[4.5rem] text-center text-[11px] text-muted-foreground"
                    title="Processo do Windows: não pode ser encerrado aqui"
                  >
                    Sistema
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmModal
        open={!!target}
        title={`Encerrar ${target?.name ?? "processo"}?`}
        confirmLabel={ending ? "Encerrando…" : "Encerrar"}
        destructive
        onConfirm={() => void confirmEnd()}
        onCancel={() => setTarget(null)}
      >
        <p className="flex gap-2 text-sm text-muted-foreground">
          <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            É como "Finalizar tarefa" no Gerenciador de Tarefas: o programa fecha na hora e o que
            não foi salvo nele se perde. Use quando um app travar.
          </span>
        </p>
      </ConfirmModal>
    </div>
  );
}
