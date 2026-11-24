import { useEffect, useMemo, useState } from "react";
import { Check, Images, Loader2, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { photosStart, photosStatus, trashItems, type PhotosState } from "@/lib/wincare/explorer";
import { formatAge, plural } from "@/lib/wincare/format";
import { formatBytes } from "@/lib/wincare/report";
import { useJobPolling } from "@/lib/wincare/useJobPolling";
import { ConfirmModal } from "./ConfirmModal";
import { EmptyState, ErrorState } from "./States";

/**
 * Fotos parecidas (mesma cena em sequência, editada ou redimensionada):
 * mostra as miniaturas lado a lado para escolher quais guardar. Por padrão
 * todas ficam; você marca as que quer tirar.
 */
export function SimilarPhotos({ version, onChanged }: { version: number; onChanged: () => void }) {
  const { state, setState, poll } = useJobPolling<PhotosState>(photosStatus);
  const [remove, setRemove] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [trashing, setTrashing] = useState(false);

  useEffect(() => {
    void poll();
  }, [version, poll]);

  const groups = useMemo(() => state?.groups ?? [], [state]);
  const sizeOf = useMemo(() => {
    const map = new Map<string, number>();
    groups.forEach((g) => g.photos.forEach((p) => map.set(p.id, p.sizeBytes)));
    return map;
  }, [groups]);
  const removeBytes = [...remove].reduce((n, id) => n + (sizeOf.get(id) ?? 0), 0);

  const start = async () => {
    const out = await photosStart();
    if (out.ok === false) {
      toast.error("Não foi possível comparar as fotos.", { description: out.reason });
      return;
    }
    setRemove(new Set());
    setState(out);
    void poll();
  };

  const toggle = (groupPhotos: { id: string }[], id: string) =>
    setRemove((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (groupPhotos.filter((p) => p.id !== id).every((p) => next.has(p.id))) {
          toast.info("Guarde pelo menos uma foto de cada grupo.");
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
      const out = await trashItems([...remove], "photos");
      if (out.removed) {
        toast.success(`${plural(out.removed, "foto enviada", "fotos enviadas")} para a Lixeira.`, {
          description: `${formatBytes(out.freedBytes)} liberados.`,
        });
      }
      if (out.failed.length) toast.warning(out.failed[0].reason);
      setRemove(new Set());
      onChanged();
      void poll();
    } finally {
      setTrashing(false);
    }
  };

  const running = state?.state === "running";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Compara as fotos (JPG, PNG, WebP…) da análise atual pela imagem, não pelo nome. Clique
          numa miniatura para marcar a foto que quer tirar.
        </p>
        <Button type="button" onClick={() => void start()} disabled={running}>
          {running ? <Loader2 className="animate-spin" /> : <Play />}
          {state?.state === "done" ? "Comparar de novo" : "Comparar fotos"}
        </Button>
      </div>

      {running && state?.progress && (
        <div className="space-y-2" role="status" aria-live="polite">
          <Progress
            value={state.progress.total ? (state.progress.done / state.progress.total) * 100 : 0}
            className="h-2"
            aria-label="Progresso da comparação de fotos"
          />
          <p className="text-xs text-muted-foreground">
            {state.progress.done.toLocaleString("pt-BR")} de{" "}
            {plural(state.progress.total, "foto", "fotos")} comparadas…
          </p>
        </div>
      )}

      {state?.state === "error" && (
        <ErrorState description={state.error} onRetry={() => void start()} />
      )}

      {state?.state === "idle" && (
        <EmptyState
          icon={Images}
          title="Revise fotos repetidas"
          description="Sequências da mesma cena e cópias editadas aparecem juntas para você escolher a melhor."
        />
      )}

      {state?.state === "done" && groups.length === 0 && (
        <EmptyState
          icon={Images}
          title="Nenhuma foto parecida"
          description="Não encontramos fotos quase iguais na pasta analisada."
        />
      )}

      {groups.length > 0 && (
        <>
          <ul aria-label="Grupos de fotos parecidas" className="space-y-3">
            {groups.map((group) => (
              <li key={group.id} className="rounded-2xl border border-border/60 bg-card/60 p-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  {plural(group.photos.length, "foto parecida", "fotos parecidas")}
                </p>
                <div className="flex flex-wrap gap-3">
                  {group.photos.map((photo) => {
                    const marked = remove.has(photo.id);
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        aria-pressed={marked}
                        aria-label={`${photo.name}, ${formatBytes(photo.sizeBytes)}. ${marked ? "Marcada para remover" : "Guardar"}`}
                        onClick={() => toggle(group.photos, photo.id)}
                        className={cn(
                          "group relative w-32 overflow-hidden rounded-xl border-2 text-left transition focus-visible:outline-2 focus-visible:outline-ring",
                          marked
                            ? "border-destructive/70 opacity-70"
                            : "border-transparent hover:border-primary/50",
                        )}
                      >
                        <img
                          src={photo.thumbnail}
                          alt=""
                          className="h-24 w-full bg-muted object-cover"
                          draggable={false}
                        />
                        <span
                          className={cn(
                            "absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full text-[11px] font-bold shadow",
                            marked
                              ? "bg-destructive-solid text-white"
                              : "bg-success text-success-foreground",
                          )}
                          aria-hidden
                        >
                          {marked ? (
                            <Trash2 className="size-3.5" />
                          ) : (
                            <Check className="size-3.5" />
                          )}
                        </span>
                        <span
                          className="block truncate px-2 pt-1.5 text-[11px] font-medium"
                          title={photo.path}
                        >
                          {photo.name}
                        </span>
                        <span className="block px-2 pb-1.5 text-[11px] text-muted-foreground">
                          {formatBytes(photo.sizeBytes)} · {formatAge(photo.modifiedAt)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!remove.size || trashing}
              onClick={() => setConfirm(true)}
            >
              {trashing ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Tirar {plural(remove.size, "foto", "fotos")} ({formatBytes(removeBytes)})
            </Button>
          </div>
        </>
      )}

      <ConfirmModal
        open={confirm}
        title="Tirar as fotos marcadas?"
        confirmLabel="Mover para a Lixeira"
        onConfirm={() => void doTrash()}
        onCancel={() => setConfirm(false)}
      >
        <p className="text-sm text-muted-foreground">
          {plural(remove.size, "foto vai", "fotos vão")} para a Lixeira ({formatBytes(removeBytes)}
          ). As outras continuam onde estão.
        </p>
      </ConfirmModal>
    </div>
  );
}
