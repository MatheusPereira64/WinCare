import { useEffect, useState } from "react";
import {
  Copy,
  FolderSearch,
  GitCompareArrows,
  HardDriveDownload,
  Images,
  LayoutGrid,
  Loader2,
  Radar,
  Square,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatAge, plural } from "@/lib/wincare/format";
import { formatBytes } from "@/lib/wincare/report";
import { handleRovingKeyDown } from "@/lib/wincare/roving";
import { useStorageScan } from "@/lib/wincare/useStorageScan";
import { ChoiceChips } from "./ChoiceChips";
import { DiskTreemap } from "./DiskTreemap";
import { DuplicateFinder } from "./DuplicateFinder";
import { FileFinder } from "./FileFinder";
import { Panel, PanelHeader } from "./Panel";
import { SimilarPhotos } from "./SimilarPhotos";
import { SnapshotCompare } from "./SnapshotCompare";
import { EmptyState } from "./States";

type Tab = "map" | "find" | "duplicates" | "photos" | "compare";

const TABS: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "map", label: "Mapa do disco", icon: LayoutGrid },
  { id: "find", label: "Buscar arquivos", icon: FolderSearch },
  { id: "duplicates", label: "Duplicados", icon: Copy },
  { id: "photos", label: "Fotos parecidas", icon: Images },
  { id: "compare", label: "Comparar no tempo", icon: GitCompareArrows },
];

/**
 * Explorador de armazenamento: analisa uma unidade inteira ou uma pasta e
 * abre cinco visões sobre o mesmo resultado (mapa, busca, duplicados, fotos
 * parecidas e comparação com análises salvas).
 */
export function StorageExplorer() {
  const scan = useStorageScan();
  const status = scan.status;
  const [drive, setDrive] = useState("C");
  const [tab, setTab] = useState<Tab>("map");

  useEffect(() => {
    if (status?.drives.length && !status.drives.some((d) => d.letter === drive)) {
      setDrive(status.drives[0].letter);
    }
  }, [status, drive]);

  const scanning = status?.state === "scanning";
  const done = status?.state === "done";

  const start = async (target: "drive" | "folder") => {
    const out = await scan.start(target, drive);
    if (!out.ok && out.reason !== "cancelled") {
      toast.error("Não foi possível começar a análise.", { description: out.reason });
    }
  };

  return (
    <Panel padding="lg" className="gap-5">
      <PanelHeader
        icon={Radar}
        title="Explorador de armazenamento"
        description="Descubra o que está lotando o disco: analise a unidade inteira ou só uma pasta."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Unidade</p>
          <ChoiceChips
            label="Unidade para analisar"
            value={drive}
            disabled={scanning}
            options={(status?.drives ?? []).map((d) => ({
              value: d.letter,
              label: `${d.letter}: · ${formatBytes(d.freeBytes)} livres`,
            }))}
            onChange={setDrive}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void start("drive")}
            disabled={scanning || scan.starting}
          >
            {scan.starting ? <Loader2 className="animate-spin" /> : <HardDriveDownload />}
            Analisar unidade {drive}:
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void start("folder")}
            disabled={scanning || scan.starting}
          >
            <FolderSearch /> Escolher pasta…
          </Button>
        </div>
      </div>

      {scanning && status?.progress && (
        <div
          role="status"
          aria-live="polite"
          className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Loader2 aria-hidden className="size-5 animate-spin text-primary" />
              <div>
                <p className="text-sm font-semibold">Analisando {status.label}…</p>
                <p className="text-xs text-muted-foreground">
                  {plural(status.progress.files, "arquivo", "arquivos")} ·{" "}
                  {plural(status.progress.dirs, "pasta", "pastas")} ·{" "}
                  {formatBytes(status.progress.bytes)}
                </p>
              </div>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => void scan.cancel()}>
              <Square /> Parar
            </Button>
          </div>
          <p
            className="truncate font-mono text-[11px] text-muted-foreground"
            title={status.progress.current}
          >
            {status.progress.current}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-indeterminate rounded-full bg-primary" />
          </div>
        </div>
      )}

      {status?.state === "error" && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          A análise falhou: {status.error}
        </p>
      )}

      {!done && !scanning && (
        <EmptyState
          icon={LayoutGrid}
          title={status?.state === "cancelled" ? "Análise interrompida" : "Nenhuma análise ainda"}
          description="Escolha uma unidade ou pasta. Discos grandes podem levar alguns minutos; dá para usar o resto do app enquanto isso."
        />
      )}

      {done && status && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>
              <strong>{status.label}</strong>{" "}
              <span className="text-muted-foreground">({status.root})</span>
            </span>
            <span className="text-muted-foreground">
              {formatBytes(status.totalBytes ?? 0)} em{" "}
              {plural(status.fileCount ?? 0, "arquivo", "arquivos")}
            </span>
            <span className="text-muted-foreground">
              analisado {formatAge(status.finishedAt ?? 0)}
              {status.finishedAt && status.startedAt
                ? ` em ${Math.max(1, Math.round((status.finishedAt - status.startedAt) / 1000))} s`
                : ""}
            </span>
            {(status.skipped ?? 0) > 0 && (
              <span
                className="text-xs text-muted-foreground"
                title="Pastas protegidas pelo Windows que não puderam ser lidas sem administrador"
              >
                {plural(status.skipped ?? 0, "pasta sem acesso", "pastas sem acesso")}
              </span>
            )}
          </div>

          <div
            role="tablist"
            aria-label="Visões da análise"
            onKeyDown={(e) => handleRovingKeyDown(e, "[role=tab]")}
            className="flex flex-wrap gap-1.5 border-b border-border/60 pb-3"
          >
            {TABS.map((t) => {
              const active = tab === t.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`storage-tab-${t.id}`}
                  aria-selected={active}
                  aria-controls={`storage-panel-${t.id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                    active
                      ? "bg-primary-solid text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div role="tabpanel" id={`storage-panel-${tab}`} aria-labelledby={`storage-tab-${tab}`}>
            {tab === "map" && <DiskTreemap version={scan.version} onChanged={scan.invalidate} />}
            {tab === "find" && <FileFinder version={scan.version} onChanged={scan.invalidate} />}
            {tab === "duplicates" && (
              <DuplicateFinder version={scan.version} onChanged={scan.invalidate} />
            )}
            {tab === "photos" && (
              <SimilarPhotos version={scan.version} onChanged={scan.invalidate} />
            )}
            {tab === "compare" && <SnapshotCompare version={scan.version} hasScan={done} />}
          </div>
        </>
      )}

      {!done && <SnapshotPeek />}
    </Panel>
  );
}

/** Sem análise nova ainda dá para comparar duas salvas. */
function SnapshotPeek() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start rounded-full"
        onClick={() => setOpen(true)}
      >
        <GitCompareArrows /> Comparar análises salvas
      </Button>
    );
  }
  return <SnapshotCompare version={0} hasScan={false} />;
}
