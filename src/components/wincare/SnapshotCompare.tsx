import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  GitCompareArrows,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  compareSnapshots,
  deleteSnapshot,
  listSnapshots,
  saveSnapshot,
  type SnapshotComparison,
  type SnapshotDiffRow,
  type SnapshotMeta,
} from "@/lib/wincare/explorer";
import { formatAge } from "@/lib/wincare/format";
import { formatBytes } from "@/lib/wincare/report";
import { ChoiceChips } from "./ChoiceChips";
import { ExportButtons } from "./ExportButtons";
import { EmptyState, ErrorState } from "./States";

const dateLabel = (ms: number) =>
  new Date(ms).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const signed = (bytes: number) => `${bytes >= 0 ? "+" : "−"}${formatBytes(Math.abs(bytes))}`;

/**
 * Comparar o disco ao longo do tempo: salve a análise de hoje e compare com
 * uma anterior (ou duas salvas). Mostra o total e as pastas que mais
 * cresceram e diminuíram.
 */
export function SnapshotCompare({ version, hasScan }: { version: number; hasScan: boolean }) {
  const [items, setItems] = useState<SnapshotMeta[]>([]);
  const [before, setBefore] = useState<string>("");
  const [after, setAfter] = useState<string>("current");
  const [result, setResult] = useState<SnapshotComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const out = await listSnapshots();
    setItems(out.items);
    setBefore((prev) =>
      prev && out.items.some((s) => s.id === prev) ? prev : (out.items[0]?.id ?? ""),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  useEffect(() => {
    if (!hasScan && after === "current" && items.length > 1) setAfter(items[0].id);
  }, [hasScan, after, items]);

  const compare = useCallback(async () => {
    if (!before) return;
    setBusy(true);
    try {
      const out = await compareSnapshots(before, after);
      if (!out.ok) {
        setError(out.reason || "Não foi possível comparar.");
        setResult(null);
      } else {
        setError(null);
        setResult(out);
      }
    } finally {
      setBusy(false);
    }
  }, [before, after]);

  useEffect(() => {
    if (before && before !== after) void compare();
  }, [before, after, compare]);

  const save = async () => {
    setSaving(true);
    try {
      const out = await saveSnapshot();
      if (out.ok) {
        toast.success("Análise salva.", { description: "Compare com ela daqui a alguns dias." });
        await load();
      } else toast.error("Não foi possível salvar.", { description: out.reason });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await deleteSnapshot(id);
    await load();
  };

  const options = items.map((s) => ({ value: s.id, label: dateLabel(s.createdAt) }));
  const afterOptions = [
    ...(hasScan ? [{ value: "current", label: "Análise atual" }] : []),
    ...options,
  ];

  const maxDelta = useMemo(() => {
    if (!result) return 1;
    return Math.max(1, ...[...result.grew, ...result.shrank].map((r) => Math.abs(r.delta)));
  }, [result]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Salve a análise atual e, depois de alguns dias, compare: dá para ver para onde foram os
          gigabytes que sumiram.
        </p>
        <Button type="button" onClick={() => void save()} disabled={!hasScan || saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar análise atual
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={GitCompareArrows}
          title="Nenhuma análise salva ainda"
          description={
            hasScan
              ? "Salve esta análise. Na próxima, você compara as duas."
              : "Analise uma unidade ou pasta e salve o resultado para comparar depois."
          }
        />
      ) : (
        <>
          <div className="grid gap-3 @3xl/main:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Antes</p>
              <ChoiceChips
                label="Análise de antes"
                value={before}
                options={options}
                onChange={setBefore}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Depois</p>
              <ChoiceChips
                label="Análise de depois"
                value={after}
                options={afterOptions}
                onChange={setAfter}
              />
            </div>
          </div>

          {before === after && (
            <p className="text-sm text-muted-foreground">Escolha duas análises diferentes.</p>
          )}
          {error && <ErrorState size="sm" description={error} onRetry={() => void compare()} />}

          {result && before !== after && (
            <div className={cn("space-y-5 transition-opacity", busy && "opacity-60")}>
              {!result.sameRoot && (
                <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  As duas análises são de lugares diferentes ({result.before.label} e{" "}
                  {result.after.label}). A comparação só faz sentido para pastas em comum.
                </p>
              )}
              <div className="grid gap-3 @2xl/main:grid-cols-3">
                <SummaryTile
                  label="Antes"
                  value={formatBytes(result.before.totalBytes)}
                  hint={dateLabel(result.before.createdAt)}
                />
                <SummaryTile
                  label="Depois"
                  value={formatBytes(result.after.totalBytes)}
                  hint={
                    result.after.id === "current"
                      ? "Análise atual"
                      : dateLabel(result.after.createdAt)
                  }
                />
                <SummaryTile
                  label="Diferença"
                  value={signed(result.deltaBytes)}
                  hint={result.deltaBytes >= 0 ? "a mais ocupado" : "liberado"}
                  tone={result.deltaBytes > 0 ? "warning" : "success"}
                />
              </div>

              <div className="grid gap-4 @4xl/main:grid-cols-2">
                <DeltaList title="O que cresceu" rows={result.grew} max={maxDelta} tone="warning" />
                <DeltaList
                  title="O que diminuiu"
                  rows={result.shrank}
                  max={maxDelta}
                  tone="success"
                />
              </div>

              <ExportButtons
                build={() => ({
                  title: `Comparação de análises — ${dateLabel(result.before.createdAt)} × ${result.after.id === "current" ? "atual" : dateLabel(result.after.createdAt)}`,
                  fileName: "WinCare-comparacao-disco",
                  columns: [
                    { key: "path", label: "Pasta" },
                    { key: "before", label: "Antes", type: "bytes" },
                    { key: "after", label: "Depois", type: "bytes" },
                    { key: "delta", label: "Diferença", type: "bytes" },
                    { key: "trend", label: "Mudança" },
                  ],
                  rows: [...result.grew, ...result.shrank].map((r) => ({
                    path: r.path,
                    before: r.before,
                    after: r.after,
                    delta: Math.abs(r.delta),
                    trend: r.delta > 0 ? "Cresceu" : "Diminuiu",
                  })),
                })}
              />
            </div>
          )}

          <details className="rounded-xl border border-border/60 bg-card/40 px-4 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              Análises salvas ({items.length})
            </summary>
            <ul className="mt-2 divide-y divide-border/50">
              {items.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">
                      {s.label} · {formatBytes(s.totalBytes)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {dateLabel(s.createdAt)} ({formatAge(s.createdAt)})
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 rounded-full"
                    aria-label={`Apagar análise de ${dateLabel(s.createdAt)}`}
                    onClick={() => void remove(s.id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "warning" | "success";
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function DeltaList({
  title,
  rows,
  max,
  tone,
}: {
  title: string;
  rows: SnapshotDiffRow[];
  max: number;
  tone: "warning" | "success";
}) {
  const Icon = tone === "warning" ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon
          aria-hidden
          className={cn("size-4", tone === "warning" ? "text-warning" : "text-success")}
        />
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma pasta mudou mais de 50 MB.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.path}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate" title={row.path}>
                  {row.path}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-semibold tabular-nums",
                    tone === "warning" ? "text-warning" : "text-success",
                  )}
                >
                  {signed(row.delta)}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    tone === "warning" ? "bg-warning/80" : "bg-success/80",
                  )}
                  style={{ width: `${Math.max(2, (Math.abs(row.delta) / max) * 100)}%` }}
                />
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatBytes(row.before)} → {formatBytes(row.after)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
