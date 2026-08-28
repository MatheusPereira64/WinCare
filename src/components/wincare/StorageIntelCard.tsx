import { useCallback, useState } from "react";
import { Files, Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNative, isNative } from "@/lib/wincare/bridge";
import { SIM_DUPLICATES, SIM_LARGE_FILES } from "@/lib/wincare/intelligence";
import { getIntelState, intelActions, useIntel } from "@/lib/wincare/intelligenceStore";
import { formatBytes } from "@/lib/wincare/report";
import type { DiskUsageFolder } from "@/lib/wincare/types";

export function StorageIntelCard({ folders }: { folders?: DiskUsageFolder[] }) {
  const scan = useIntel((s) => s.lastStorageScan);
  const [busy, setBusy] = useState(false);
  const [growth, setGrowth] = useState<{ id: string; label: string; delta: number }[]>([]);

  const runScan = useCallback(async () => {
    setBusy(true);
    try {
      const native = getNative();
      const folderList = native?.diskUsage
        ? await native.diskUsage().catch(() => folders || [])
        : folders || [];
      const result = native?.storageIntel
        ? await native.storageIntel()
        : {
            at: Date.now(),
            visited: 420,
            largeFiles: SIM_LARGE_FILES,
            duplicates: SIM_DUPLICATES,
          };
      const folderBytes = Object.fromEntries(
        (Array.isArray(folderList) ? folderList : []).map((f) => [f.id, f.sizeBytes]),
      );
      const prev = getIntelState().lastFolderBytes;
      const nextGrowth = (Array.isArray(folderList) ? folderList : [])
        .map((f) => {
          const before = prev[f.id];
          if (typeof before !== "number") return null;
          const delta = f.sizeBytes - before;
          if (Math.abs(delta) < 20 * 1024 * 1024) return null;
          return { id: f.id, label: f.label, delta };
        })
        .filter((row): row is { id: string; label: string; delta: number } => !!row);
      setGrowth(nextGrowth);
      intelActions.setStorageScan(result, folderBytes);
      toast.success("Análise de arquivos concluída");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao varrer arquivos.");
      if (!isNative()) {
        intelActions.setStorageScan({
          at: Date.now(),
          visited: 420,
          largeFiles: SIM_LARGE_FILES,
          duplicates: SIM_DUPLICATES,
        });
      }
    } finally {
      setBusy(false);
    }
  }, [folders]);

  return (
    <Card className="surface-panel gap-4 border-border/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ScanSearch className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Inteligência de armazenamento</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Arquivos grandes e duplicados em Documentos, Downloads, Desktop e mídia — sem varrer o
              Windows inteiro.
            </p>
          </div>
        </div>
        <Button type="button" className="rounded-full" disabled={busy} onClick={() => void runScan()}>
          {busy ? <Loader2 className="animate-spin" /> : <Files />}
          {busy ? "Varrendo…" : scan ? "Atualizar varredura" : "Varrer arquivos"}
        </Button>
      </div>

      {growth.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Crescimento desde a última análise</p>
          <ul className="mt-2 space-y-1 text-sm">
            {growth.map((g) => (
              <li key={g.id} className="flex justify-between gap-2">
                <span>{g.label}</span>
                <span className={g.delta > 0 ? "text-warning" : "text-success"}>
                  {g.delta > 0 ? "+" : ""}
                  {formatBytes(Math.abs(g.delta))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {scan && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium">Maiores arquivos</p>
            <p className="text-[11px] text-muted-foreground">
              {scan.visited} itens visitados · {new Date(scan.at).toLocaleString("pt-BR")}
            </p>
            <ul className="mt-2 divide-y divide-border/40">
              {scan.largeFiles.slice(0, 10).map((f) => (
                <li key={f.path} className="py-1.5">
                  <p className="truncate text-sm">{f.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground" title={f.path}>
                    {formatBytes(f.sizeBytes)} · {f.path}
                  </p>
                </li>
              ))}
              {scan.largeFiles.length === 0 && (
                <li className="py-2 text-sm text-muted-foreground">Nenhum arquivo acima de 8 MB.</li>
              )}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium">Possíveis duplicados</p>
            <p className="text-[11px] text-muted-foreground">Mesmo nome e tamanho — revise antes de apagar.</p>
            <ul className="mt-2 space-y-2">
              {scan.duplicates.map((g) => (
                <li key={`${g.name}-${g.sizeBytes}`} className="rounded-lg border border-border/40 px-3 py-2">
                  <p className="text-sm font-medium">
                    {g.name} · {formatBytes(g.sizeBytes)}
                  </p>
                  {g.paths.map((p) => (
                    <p key={p} className="truncate text-[11px] text-muted-foreground" title={p}>
                      {p}
                    </p>
                  ))}
                </li>
              ))}
              {scan.duplicates.length === 0 && (
                <li className="text-sm text-muted-foreground">Nenhum duplicado óbvio nesta varredura.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
