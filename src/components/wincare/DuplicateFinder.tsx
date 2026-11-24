import { useEffect, useMemo, useState } from "react";
import { Copy, FolderOpen, Loader2, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  duplicatesStart,
  duplicatesStatus,
  revealItem,
  trashItems,
  type DuplicateGroup,
  type DuplicatesState,
} from "@/lib/wincare/explorer";
import { formatAge, plural } from "@/lib/wincare/format";
import { formatBytes } from "@/lib/wincare/report";
import { useJobPolling } from "@/lib/wincare/useJobPolling";
import { ChoiceChips } from "./ChoiceChips";
import { ConfirmModal } from "./ConfirmModal";
import { ExportButtons } from "./ExportButtons";
import { EmptyState, ErrorState } from "./States";
import { StatusBadge } from "./StatusBadge";

type Keep = "newest" | "oldest";
type MinSize = "1mb" | "10mb" | "100mb";

/** Marca para remover todas as cópias menos a que fica (mais nova ou mais antiga). */
function selectionFor(groups: DuplicateGroup[], keep: Keep) {
  const ids = new Set<string>();
  for (const group of groups) {
    const sorted = [...group.files].sort((a, b) =>
      keep === "oldest" ? a.modifiedAt - b.modifiedAt : b.modifiedAt - a.modifiedAt,
    );
    sorted.slice(1).forEach((f) => ids.add(f.id));
  }
  return ids;
}

/**
 * Duplicados de verdade: compara o conteúdo (hash) dos arquivos de mesmo
 * tamanho, então acha cópias com nomes diferentes. Só arquivos fora das
 * pastas do Windows e de programas.
 */
export function DuplicateFinder({
  version,
  onChanged,
}: {
  version: number;
  onChanged: () => void;
}) {
  const { state, setState, poll } = useJobPolling<DuplicatesState>(duplicatesStatus);
  const [minSize, setMinSize] = useState<MinSize>("1mb");
  const [keep, setKeep] = useState<Keep>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [trashing, setTrashing] = useState(false);

  useEffect(() => {
    void poll();
  }, [version, poll]);

  const groups = useMemo(() => state?.groups ?? [], [state]);

  // Seleção padrão: tudo menos a cópia que fica.
  useEffect(() => {
    setSelected(selectionFor(groups, keep));
  }, [groups, keep]);

  const start = async () => {
    const out = await duplicatesStart(minSize);
    if (out.ok === false) {
      toast.error("Não foi possível procurar duplicados.", { description: out.reason });
      return;
    }
    setState(out);
    void poll();
  };

  const sizeOf = useMemo(() => {
    const map = new Map<string, number>();
    groups.forEach((g) => g.files.forEach((f) => map.set(f.id, g.sizeBytes)));
    return map;
  }, [groups]);
  const selectedBytes = [...selected].reduce((n, id) => n + (sizeOf.get(id) ?? 0), 0);

  const toggle = (group: DuplicateGroup, id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        // Nunca deixa marcar todas as cópias de um grupo.
        const others = group.files.filter((f) => f.id !== id);
        if (others.every((f) => next.has(f.id))) {
          toast.info("Pelo menos uma cópia de cada arquivo fica no PC.");
          return prev;
        }
        next.add(id);
      }
      return next;
    });

  const doTrash = async () => {
    setConfirm(false);
    setTrashing(true);
    try {
      const out = await trashItems([...selected], "duplicates");
      if (out.removed) {
        toast.success(
          `${plural(out.removed, "cópia enviada", "cópias enviadas")} para a Lixeira.`,
          {
            description: `${formatBytes(out.freedBytes)} liberados.`,
          },
        );
      }
      if (out.failed.length) toast.warning(out.failed[0].reason);
      onChanged();
      void poll();
    } finally {
      setTrashing(false);
    }
  };

  const running = state?.state === "running";
  const progress = state?.progress;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Comparar arquivos a partir de</p>
          <ChoiceChips
            label="Tamanho mínimo"
            value={minSize}
            disabled={running}
            options={[
              { value: "1mb", label: "1 MB" },
              { value: "10mb", label: "10 MB" },
              { value: "100mb", label: "100 MB" },
            ]}
            onChange={setMinSize}
          />
        </div>
        <Button type="button" onClick={() => void start()} disabled={running}>
          {running ? <Loader2 className="animate-spin" /> : <Play />}
          {state?.state === "done" ? "Procurar de novo" : "Procurar duplicados"}
        </Button>
      </div>

      {running && progress && (
        <div className="space-y-2" role="status" aria-live="polite">
          <Progress
            value={progress.total ? (progress.done / progress.total) * 100 : 0}
            className="h-2"
            aria-label="Progresso da comparação"
          />
          <p className="text-xs text-muted-foreground">
            Comparando o conteúdo de {plural(progress.total, "arquivo", "arquivos")} do mesmo
            tamanho… {progress.bytes ? `${formatBytes(progress.bytes)} lidos.` : ""}
          </p>
        </div>
      )}

      {state?.state === "error" && (
        <ErrorState description={state.error} onRetry={() => void start()} />
      )}

      {state?.state === "idle" && (
        <EmptyState
          icon={Copy}
          title="Procure cópias do mesmo arquivo"
          description="O WinCare compara o conteúdo, não o nome: acha cópias mesmo renomeadas. Nada é apagado sem você confirmar."
        />
      )}

      {state?.state === "done" && groups.length === 0 && (
        <EmptyState
          icon={Copy}
          title="Nenhum duplicado encontrado"
          description="Não há arquivos com conteúdo idêntico acima desse tamanho."
        />
      )}

      {state?.state === "done" && groups.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/50 px-4 py-3">
            <p className="text-sm">
              <strong>{plural(groups.length, "grupo", "grupos")}</strong> de cópias ·{" "}
              <span className="text-muted-foreground">
                {formatBytes(state.wastedBytes ?? 0)} ocupados por cópias extras
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Manter</span>
              <ChoiceChips
                label="Qual cópia manter"
                value={keep}
                options={[
                  { value: "newest", label: "A mais nova" },
                  { value: "oldest", label: "A mais antiga" },
                ]}
                onChange={setKeep}
              />
            </div>
          </div>

          <ul aria-label="Grupos de arquivos duplicados" className="space-y-3">
            {groups.map((group) => (
              <li
                key={group.id}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card/60"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-4 py-2">
                  <p className="truncate text-sm font-semibold" title={group.files[0]?.name}>
                    {group.files[0]?.name}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {plural(group.files.length, "cópia", "cópias")} de{" "}
                    {formatBytes(group.sizeBytes)}
                  </span>
                </div>
                <ul className="divide-y divide-border/50">
                  {group.files.map((file) => {
                    const marked = selected.has(file.id);
                    return (
                      <li key={file.id} className="flex items-center gap-3 px-4 py-2">
                        <Checkbox
                          checked={marked}
                          onCheckedChange={() => toggle(group, file.id)}
                          aria-label={`Remover a cópia em ${file.path}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs" title={file.path}>
                            {file.path}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            alterado {formatAge(file.modifiedAt)}
                          </p>
                        </div>
                        {marked ? (
                          <StatusBadge tone="warning">Remover</StatusBadge>
                        ) : (
                          <StatusBadge tone="success">Fica</StatusBadge>
                        )}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 rounded-full"
                          aria-label="Mostrar no Explorador"
                          title="Mostrar no Explorador"
                          onClick={() => void revealItem(file.id)}
                        >
                          <FolderOpen />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <ExportButtons
              build={() => ({
                title: "Arquivos duplicados",
                fileName: "WinCare-duplicados",
                columns: [
                  { key: "group", label: "Grupo", type: "number" },
                  { key: "path", label: "Caminho" },
                  { key: "size", label: "Tamanho", type: "bytes" },
                  { key: "modified", label: "Alterado em", type: "date" },
                  { key: "action", label: "Ação" },
                ],
                rows: groups.flatMap((g, gi) =>
                  g.files.map((f) => ({
                    group: gi + 1,
                    path: f.path,
                    size: g.sizeBytes,
                    modified: f.modifiedAt,
                    action: selected.has(f.id) ? "Remover" : "Manter",
                  })),
                ),
              })}
            />
            <Button
              type="button"
              disabled={!selected.size || trashing}
              onClick={() => setConfirm(true)}
            >
              {trashing ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Mover {selected.size} {selected.size === 1 ? "cópia" : "cópias"} para a Lixeira (
              {formatBytes(selectedBytes)})
            </Button>
          </div>
        </>
      )}

      <ConfirmModal
        open={confirm}
        title="Remover as cópias marcadas?"
        confirmLabel="Mover para a Lixeira"
        onConfirm={() => void doTrash()}
        onCancel={() => setConfirm(false)}
      >
        <p className="text-sm text-muted-foreground">
          {plural(selected.size, "cópia vai", "cópias vão")} para a Lixeira (
          {formatBytes(selectedBytes)}). Em cada grupo pelo menos um arquivo continua no PC.
        </p>
      </ConfirmModal>
    </div>
  );
}
