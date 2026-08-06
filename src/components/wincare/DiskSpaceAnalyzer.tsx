import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getNative, isNative, SIMULATED_DISK_USAGE } from "@/lib/wincare/bridge";
import { formatBytes } from "@/lib/wincare/report";
import type { DiskUsageFolder } from "@/lib/wincare/types";
import { ConfirmModal } from "./ConfirmModal";

export function DiskSpaceAnalyzer() {
  const [folders, setFolders] = useState<DiskUsageFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [pending, setPending] = useState<DiskUsageFolder | null>(null);
  const nativeMode = isNative();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const native = getNative();
      if (native?.diskUsage) {
        const list = await native.diskUsage();
        setFolders(Array.isArray(list) ? list : []);
      } else {
        setFolders(SIMULATED_DISK_USAGE);
      }
    } catch {
      toast.error("Falha ao analisar espaço em disco.");
      if (!nativeMode) setFolders(SIMULATED_DISK_USAGE);
    } finally {
      setLoading(false);
    }
  }, [nativeMode]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const native = getNative();
        if (native?.diskUsage) {
          const list = await native.diskUsage();
          if (!cancelled) setFolders(Array.isArray(list) ? list : []);
        } else if (!cancelled) {
          setFolders(SIMULATED_DISK_USAGE);
        }
      } catch {
        if (!cancelled) {
          toast.error("Falha ao analisar espaço em disco.");
          if (!nativeMode) setFolders(SIMULATED_DISK_USAGE);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [nativeMode]);

  const total = useMemo(() => folders.reduce((s, f) => s + (f.sizeBytes || 0), 0), [folders]);
  const sorted = useMemo(
    () => [...folders].sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0)),
    [folders],
  );

  const clearFolder = async (folder: DiskUsageFolder) => {
    setPending(null);
    const native = getNative();
    if (!native?.clearDiskFolder) {
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, sizeBytes: 0 } : f)));
      toast.success(`${folder.label} limpa (demonstração)`);
      return;
    }

    setClearingId(folder.id);
    try {
      const out = await native.clearDiskFolder(folder.id);
      if (!out.ok) {
        toast.error(out.reason || "Não foi possível limpar.");
        return;
      }
      const freed =
        typeof out.freedBytes === "number" && out.freedBytes > 1
          ? formatBytes(out.freedBytes)
          : undefined;
      toast.success(freed ? `${folder.label}: ~${freed} liberados` : `${folder.label} limpa`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na limpeza.");
    } finally {
      setClearingId(null);
    }
  };

  return (
    <section className="space-y-4" data-wincare-disk-usage>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Análise de espaço</h2>
          <p className="text-sm text-muted-foreground">
            Pastas que costumam encher o disco — limpe com um clique o que for seguro.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Analisar
        </Button>
      </div>

      {loading && folders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Calculando tamanhos (pode levar alguns segundos)…
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Total medido nestas pastas: <strong>{formatBytes(total)}</strong>
            {!nativeMode && " (dados de demonstração)"}
          </p>
          <div className="grid gap-3">
            {sorted.map((folder) => {
              const pct = total > 0 ? Math.round((folder.sizeBytes / total) * 100) : 0;
              return (
                <Card key={folder.id} className="surface-panel gap-3 border-border/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <FolderOpen className="size-4 text-primary" />
                        <h3 className="font-semibold">{folder.label}</h3>
                        <Badge variant="outline">{formatBytes(folder.sizeBytes)}</Badge>
                        {folder.clearable ? (
                          <Badge variant="outline" className="border-success/40 text-success">
                            Limpável
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Só leitura
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
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
                  <Progress value={pct} className="h-1.5" />
                </Card>
              );
            })}
          </div>
        </>
      )}

      <ConfirmModal
        open={!!pending}
        title="Limpar pasta"
        confirmLabel="Limpar agora"
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
            <p className="font-mono text-xs">{pending.path}</p>
            <p>Esta ação não envia arquivos para a Lixeira (exceto limpeza da própria Lixeira).</p>
          </>
        )}
      </ConfirmModal>
    </section>
  );
}
