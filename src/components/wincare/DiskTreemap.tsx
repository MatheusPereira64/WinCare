import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, FileIcon, Folder, FolderOpen, Layers, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABEL,
  revealItem,
  trashItems,
  treeLevel,
  type TreeChild,
  type TreeLevel,
} from "@/lib/wincare/explorer";
import { formatAge, formatDecimal, plural } from "@/lib/wincare/format";
import { formatBytes } from "@/lib/wincare/report";
import { squarify } from "@/lib/wincare/treemap";
import { ConfirmModal } from "./ConfirmModal";
import { ExportButtons } from "./ExportButtons";
import { ErrorState, LoadingState } from "./States";

/* Cores do mapa: tons da marca (gráficos) em preenchimento suave + borda. */
const DIR_TONES = [
  "bg-chart-1/25 border-chart-1/60 hover:bg-chart-1/40",
  "bg-chart-2/25 border-chart-2/60 hover:bg-chart-2/40",
  "bg-chart-3/25 border-chart-3/60 hover:bg-chart-3/40",
  "bg-chart-5/25 border-chart-5/60 hover:bg-chart-5/40",
  "bg-primary/20 border-primary/50 hover:bg-primary/35",
];
const FILE_TONE = "bg-chart-4/25 border-chart-4/60 hover:bg-chart-4/40";
const REST_TONE = "bg-muted/60 border-border hover:bg-muted";

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}

const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

/**
 * Mapa do disco: quanto maior o bloco, mais espaço ocupa. Clicar numa pasta
 * entra nela; o caminho no topo volta. A lista abaixo do mapa traz os mesmos
 * itens em texto (teclado e Narrador).
 */
export function DiskTreemap({ version, onChanged }: { version: number; onChanged: () => void }) {
  const [nodeId, setNodeId] = useState<string | undefined>(undefined);
  const [level, setLevel] = useState<TreeLevel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TreeChild | null>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const box = useSize<HTMLDivElement>();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    treeLevel(nodeId)
      .then((out) => {
        if (!alive) return;
        if (!out.ok) {
          setError(out.reason || "Não foi possível abrir a pasta.");
          return;
        }
        setError(null);
        setLevel(out);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Falha ao ler a pasta."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [nodeId, version]);

  // Nova análise: volta para a raiz.
  useEffect(() => {
    setNodeId(undefined);
    setSelected(null);
  }, [version]);

  const rects = useMemo(() => {
    if (!level || !box.width || !box.height) return [];
    return squarify(
      level.children.map((c) => ({ id: c.id, value: c.sizeBytes })),
      box.width,
      box.height,
    );
  }, [level, box.width, box.height]);

  const byId = useMemo(() => new Map(level?.children.map((c) => [c.id, c]) ?? []), [level]);
  const total = level?.node.sizeBytes ?? 0;

  const open = (child: TreeChild) => {
    if (child.kind === "dir") {
      setSelected(null);
      setNodeId(child.id);
    } else {
      setSelected(child);
    }
  };

  const doTrash = async () => {
    if (!selected) return;
    setConfirmTrash(false);
    const out = await trashItems([selected.id], "files");
    if (out.removed) {
      toast.success("Arquivo enviado para a Lixeira.", {
        description: `${formatBytes(out.freedBytes)} liberados. Dá para recuperar pela Lixeira.`,
      });
      setSelected(null);
      onChanged();
    } else {
      toast.error("O arquivo não foi removido.", {
        description: out.failed[0]?.reason || out.reason,
      });
    }
  };

  if (error && !level)
    return <ErrorState description={error} onRetry={() => setNodeId(undefined)} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav
          aria-label="Caminho da pasta"
          className="flex min-w-0 flex-wrap items-center gap-1 text-sm"
        >
          {level?.breadcrumb.map((crumb, i) => {
            const last = i === level.breadcrumb.length - 1;
            return (
              <span key={crumb.id} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight aria-hidden className="size-3.5 text-muted-foreground" />}
                {last ? (
                  <span aria-current="page" className="truncate font-semibold">
                    {crumb.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="truncate rounded-md px-1 text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => {
                      setSelected(null);
                      setNodeId(crumb.id);
                    }}
                  >
                    {crumb.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
        {level && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {formatBytes(total)} · {plural(level.node.fileCount, "arquivo", "arquivos")}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 rounded-full"
              onClick={() => void revealItem(level.node.id)}
            >
              <FolderOpen className="size-3.5" /> Abrir pasta
            </Button>
          </div>
        )}
      </div>

      <div
        ref={box.ref}
        className="relative h-[clamp(260px,42vh,440px)] w-full overflow-hidden rounded-2xl border border-border/60 bg-card/40"
        aria-hidden
      >
        {loading && !level && (
          <LoadingState label="Montando o mapa…" variant="block" className="p-4" />
        )}
        {rects.map((r) => {
          const child = byId.get(r.id);
          if (!child) return null;
          const tone =
            child.kind === "dir"
              ? DIR_TONES[level!.children.indexOf(child) % DIR_TONES.length]
              : child.kind === "file"
                ? FILE_TONE
                : REST_TONE;
          const wPx = (r.w / 100) * box.width;
          const hPx = (r.h / 100) * box.height;
          const showText = wPx > 64 && hPx > 34;
          return (
            <button
              key={r.id}
              type="button"
              tabIndex={-1}
              disabled={child.kind === "rest"}
              title={`${child.name} — ${formatBytes(child.sizeBytes)} (${formatDecimal(pct(child.sizeBytes, total), 1)}%)`}
              onClick={() => open(child)}
              className={cn(
                "absolute flex flex-col items-stretch justify-start overflow-hidden rounded-lg border text-left transition-colors",
                "disabled:cursor-default",
                selected?.id === child.id && "ring-2 ring-primary",
                tone,
              )}
              style={{
                left: `calc(${r.x}% + 2px)`,
                top: `calc(${r.y}% + 2px)`,
                width: `calc(${r.w}% - 4px)`,
                height: `calc(${r.h}% - 4px)`,
              }}
            >
              {showText && (
                <span className="block p-2 leading-tight">
                  <span className="flex items-center gap-1 truncate text-xs font-semibold">
                    {child.kind === "dir" ? (
                      <Folder aria-hidden className="size-3 shrink-0" />
                    ) : child.kind === "file" ? (
                      <FileIcon aria-hidden className="size-3 shrink-0" />
                    ) : (
                      <Layers aria-hidden className="size-3 shrink-0" />
                    )}
                    <span className="truncate">{child.name}</span>
                  </span>
                  {hPx > 48 && (
                    <span className="block text-[11px] text-muted-foreground">
                      {formatBytes(child.sizeBytes)}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="animate-fade-in flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" title={selected.name}>
              {selected.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(selected.sizeBytes)}
              {selected.category && ` · ${CATEGORY_LABEL[selected.category]}`}
              {selected.modifiedAt ? ` · alterado ${formatAge(selected.modifiedAt)}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void revealItem(selected.id)}>
              <FolderOpen /> Mostrar no Explorador
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmTrash(true)}>
              <Trash2 /> Mover para a Lixeira
            </Button>
          </div>
        </div>
      )}

      {level && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">O que ocupa {level.node.name}</h3>
            <ExportButtons
              build={() => ({
                title: `Uso de espaço — ${level.node.path}`,
                fileName: "WinCare-mapa-do-disco",
                columns: [
                  { key: "name", label: "Item" },
                  { key: "kind", label: "Tipo" },
                  { key: "size", label: "Tamanho", type: "bytes" },
                  { key: "share", label: "% da pasta", type: "number" },
                ],
                rows: level.children.map((c) => ({
                  name: c.name,
                  kind: c.kind === "dir" ? "Pasta" : c.kind === "file" ? "Arquivo" : "Outros",
                  size: c.sizeBytes,
                  share: Math.round(pct(c.sizeBytes, total) * 10) / 10,
                })),
              })}
            />
          </div>
          <ul
            aria-label={`Itens de ${level.node.name}`}
            className="grid gap-1.5 @3xl/main:grid-cols-2"
          >
            {level.children.slice(0, 16).map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  disabled={child.kind === "rest"}
                  onClick={() => open(child)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border/50 bg-card/50 px-3 py-2 text-left hover:bg-accent/40 disabled:cursor-default disabled:hover:bg-card/50 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {child.kind === "dir" ? (
                    <Folder aria-hidden className="size-4 shrink-0 text-primary" />
                  ) : child.kind === "file" ? (
                    <FileIcon aria-hidden className="size-4 shrink-0 text-chart-4" />
                  ) : (
                    <Layers aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{child.name}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max(1, pct(child.sizeBytes, total))}%` }}
                      />
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {formatBytes(child.sizeBytes)}
                    <span className="block">{formatDecimal(pct(child.sizeBytes, total), 1)}%</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmModal
        open={confirmTrash}
        title="Mover para a Lixeira?"
        confirmLabel="Mover para a Lixeira"
        onConfirm={() => void doTrash()}
        onCancel={() => setConfirmTrash(false)}
      >
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{selected?.name}</strong> (
          {formatBytes(selected?.sizeBytes ?? 0)}) vai para a Lixeira do Windows. Se precisar, dá
          para restaurar de lá. Arquivos do Windows e de programas nunca são removidos.
        </p>
      </ConfirmModal>
    </div>
  );
}
