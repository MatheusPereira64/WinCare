import { useMemo, useState } from "react";
import { FolderOpen, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getNative, isNative, SIMULATED_DISK_USAGE } from "@/lib/wincare/bridge";
import { formatBytes } from "@/lib/wincare/report";
import type { DiskUsageFolder } from "@/lib/wincare/types";
import { invalidateSystemData } from "@/lib/wincare/systemData";
import { useResource } from "@/lib/wincare/useResource";
import { ConfirmModal } from "./ConfirmModal";
import { Panel } from "./Panel";
import { EmptyState, LoadingState, ResourceView } from "./States";
import { StatusBadge } from "./StatusBadge";

async function loadFolders() {
  const native = getNative();
  if (!native?.diskUsage) return SIMULATED_DISK_USAGE;
  const list = await native.diskUsage();
  return Array.isArray(list) ? list : [];
}

export function DiskSpaceAnalyzer() {
  const resource = useResource(loadFolders, {
    errorMessage: "Não foi possível medir as pastas.",
  });
  const { reload, setData, refreshing, status } = resource;
  const folders = useMemo(() => resource.data ?? [], [resource.data]);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [pending, setPending] = useState<DiskUsageFolder | null>(null);
  const nativeMode = isNative();
  const busy = status === "loading" || refreshing;

  const refresh = async () => {
    invalidateSystemData("folders");
    await reload();
  };

  const total = useMemo(() => folders.reduce((s, f) => s + (f.sizeBytes || 0), 0), [folders]);
  const sorted = useMemo(
    () => [...folders].sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0)),
    [folders],
  );

  const clearFolder = async (folder: DiskUsageFolder) => {
    setPending(null);
    const native = getNative();
    if (!native?.clearDiskFolder) {
      setData((prev) => (prev ?? []).map((f) => (f.id === folder.id ? { ...f, sizeBytes: 0 } : f)));
      toast.success(`${folder.label} limpa (demonstração)`);
      return;
    }

    setClearingId(folder.id);
    try {
      const out = await native.clearDiskFolder(folder.id);
      if (!out.ok) {
        toast.error(`Não foi possível limpar ${folder.label}.`, { description: out.reason });
        return;
      }
      const freed =
        typeof out.freedBytes === "number" && out.freedBytes > 1
          ? formatBytes(out.freedBytes)
          : undefined;
      toast.success(freed ? `${folder.label}: ~${freed} liberados` : `${folder.label} limpa`);
      await refresh();
    } catch (err) {
      toast.error(`Não foi possível limpar ${folder.label}.`, {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setClearingId(null);
    }
  };

  return (
    <section className="space-y-4" data-wincare-disk-usage aria-labelledby="disk-usage-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="disk-usage-title" className="text-lg font-semibold">
            Análise de espaço
          </h2>
          <p className="text-sm text-muted-foreground">
            Pastas que costumam encher o disco. Limpe com um clique o que for seguro.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void refresh()}
          disabled={busy}
        >
          {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Analisar de novo
        </Button>
      </div>

      <ResourceView
        resource={resource}
        errorTitle="Não foi possível medir as pastas"
        loading={<LoadingState label="Medindo as pastas (pode levar alguns segundos)…" rows={4} />}
        isEmpty={(list) => list.length === 0}
        empty={
          <EmptyState
            icon={FolderOpen}
            title="Nenhuma pasta medida"
            description="As pastas analisadas não existem neste computador ou estão vazias."
          />
        }
      >
        {() => (
          <>
            <p className="text-xs text-muted-foreground">
              Total medido nestas pastas: <strong>{formatBytes(total)}</strong>
              {!nativeMode && " (dados de demonstração)"}
            </p>
            <ul className="grid gap-3" aria-label="Pastas analisadas">
              {sorted.map((folder) => {
                const pct = total > 0 ? Math.round((folder.sizeBytes / total) * 100) : 0;
                return (
                  <li key={folder.id}>
                    <Panel padding="sm" className="gap-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <FolderOpen className="size-4 shrink-0 text-primary" aria-hidden />
                            <h3 className="min-w-0 font-semibold break-words">{folder.label}</h3>
                            <StatusBadge>{formatBytes(folder.sizeBytes)}</StatusBadge>
                            {folder.clearable ? (
                              <StatusBadge tone="success">Pode limpar</StatusBadge>
                            ) : (
                              <StatusBadge>Só leitura</StatusBadge>
                            )}
                          </div>
                          <p
                            className="mt-1 truncate font-mono text-xs text-muted-foreground"
                            title={folder.path}
                          >
                            {folder.path}
                          </p>
                          {folder.hint && (
                            <p className="mt-1 text-xs text-muted-foreground">{folder.hint}</p>
                          )}
                        </div>
                        {folder.clearable && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            aria-label={`Limpar ${folder.label}`}
                            disabled={clearingId === folder.id || folder.sizeBytes <= 0}
                            onClick={() => setPending(folder)}
                          >
                            {clearingId === folder.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Trash2 />
                            )}
                            Limpar
                          </Button>
                        )}
                      </div>
                      <Progress
                        value={pct}
                        className="h-1.5"
                        aria-label={`${folder.label}: parte do total medido`}
                        aria-valuetext={`${pct}% do total (${formatBytes(folder.sizeBytes)})`}
                      />
                    </Panel>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </ResourceView>

      <ConfirmModal
        open={!!pending}
        title="Limpar pasta"
        confirmLabel="Limpar agora"
        destructive
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) void clearFolder(pending);
        }}
      >
        {pending && (
          <>
            <p>
              Remover o conteúdo de <strong>{pending.label}</strong> (
              {formatBytes(pending.sizeBytes)})?
            </p>
            <p className="font-mono text-xs break-all">{pending.path}</p>
            <p>Esta ação não envia arquivos para a Lixeira (exceto limpeza da própria Lixeira).</p>
          </>
        )}
      </ConfirmModal>
    </section>
  );
}
