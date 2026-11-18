import { useMemo, useState } from "react";
import {
  AppWindow,
  ChevronDown,
  CircleAlert,
  Globe,
  Loader2,
  PartyPopper,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { cleanCleaner, scanCleaner } from "@/lib/wincare/bridge";
import { formatBytes } from "@/lib/wincare/report";
import type { CleanerCategory, CleanerItem } from "@/lib/wincare/types";
import { plural } from "@/lib/wincare/format";
import { invalidateSystemData } from "@/lib/wincare/systemData";
import { TONE_CALLOUT } from "@/lib/wincare/tone";
import { useResource } from "@/lib/wincare/useResource";
import { ConfirmModal } from "./ConfirmModal";
import { Panel, PanelHeader } from "./Panel";
import { EmptyState, LoadingState, ResourceView } from "./States";
import { StatusBadge } from "./StatusBadge";

const CATEGORY: Record<CleanerCategory, { label: string; hint: string; risky: boolean }> = {
  cache: {
    label: "Cache",
    hint: "Arquivos temporários. Sites podem carregar mais devagar na próxima visita.",
    risky: false,
  },
  cookies: {
    label: "Cookies",
    hint: "Você sairá das contas conectadas nos sites.",
    risky: true,
  },
  history: {
    label: "Histórico",
    hint: "Apaga o histórico de navegação. Senhas e favoritos são mantidos.",
    risky: true,
  },
};

interface AppGroup {
  appId: string;
  appName: string;
  appKind: CleanerItem["appKind"];
  running: boolean;
  sizeBytes: number;
  items: CleanerItem[];
}

/* Com o app aberto, cookies e histórico ficam bloqueados: são bancos em uso. */
const isLocked = (item: CleanerItem) => item.running && CATEGORY[item.category].risky;

function groupByApp(items: CleanerItem[]): AppGroup[] {
  const groups = new Map<string, AppGroup>();
  for (const item of items) {
    const group = groups.get(item.appId) ?? {
      appId: item.appId,
      appName: item.appName,
      appKind: item.appKind,
      running: item.running,
      sizeBytes: 0,
      items: [],
    };
    group.sizeBytes += item.sizeBytes;
    group.items.push(item);
    groups.set(item.appId, group);
  }
  return [...groups.values()].sort((a, b) => b.sizeBytes - a.sizeBytes);
}

const defaultSelection = (items: CleanerItem[]) =>
  new Set(items.filter((i) => i.category === "cache").map((i) => i.id));

async function scan() {
  const out = await scanCleaner();
  if (!out.ok) throw new Error(out.reason);
  return out.items;
}

export function BrowserCleaner() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const resource = useResource(scan, {
    errorMessage: "Não foi possível analisar os navegadores e aplicativos.",
    onLoad: (list) => setSelected(defaultSelection(list)),
  });
  const { reload: refresh, refreshing, status } = resource;
  const items = useMemo(() => resource.data ?? [], [resource.data]);
  const loading = status === "loading" || refreshing;
  const [cleaning, setCleaning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const groups = useMemo(() => groupByApp(items), [items]);
  const selectedItems = useMemo(
    () => items.filter((i) => selected.has(i.id) && !isLocked(i)),
    [items, selected],
  );
  const selectedBytes = selectedItems.reduce((sum, i) => sum + i.sizeBytes, 0);
  const totalBytes = items.reduce((sum, i) => sum + i.sizeBytes, 0);

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const clean = async () => {
    setConfirming(false);
    setCleaning(true);
    try {
      const out = await cleanCleaner(selectedItems.map((i) => i.id));
      if (!out.ok) throw new Error(out.reason);
      invalidateSystemData("folders");
      const kept = out.skipped
        ? ` ${plural(out.skipped, "arquivo em uso foi mantido", "arquivos em uso foram mantidos")}.`
        : "";
      toast.success(`${formatBytes(out.freedBytes ?? 0)} liberados`, {
        description: `${plural(out.removed ?? 0, "arquivo removido", "arquivos removidos")}.${kept}`,
      });
      if (out.blocked?.length) {
        toast.warning("Alguns itens não foram limpos", {
          description: `Feche ${out.blocked.join(", ")} para limpar cookies e histórico.`,
        });
      }
      await refresh();
    } catch (err) {
      toast.error("Não foi possível concluir a limpeza.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCleaning(false);
    }
  };

  const busy = loading || cleaning;
  const hasRiskySelection = selectedItems.some((i) => CATEGORY[i.category].risky);

  return (
    <Panel variant="hero" padding="lg" data-wincare-cleaner>
      <PanelHeader
        icon={Sparkles}
        title="Navegadores e aplicativos"
        description="Veja exatamente o que será apagado antes de limpar. Senhas, favoritos e extensões nunca são tocados."
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void refresh()}
              className="rounded-full"
            >
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Analisar de novo
            </Button>
            <Button
              type="button"
              disabled={busy || selectedItems.length === 0}
              onClick={() => setConfirming(true)}
              className="rounded-full px-5"
            >
              {cleaning ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {cleaning ? "Limpando…" : `Limpar ${formatBytes(selectedBytes)}`}
            </Button>
          </>
        }
      />

      <ResourceView
        resource={resource}
        errorTitle="Não foi possível analisar os navegadores e aplicativos"
        loading={
          <LoadingState label="Medindo caches e dados de navegação (pode levar até um minuto)…" />
        }
      >
        {() =>
          groups.length === 0 ? (
            <EmptyState
              icon={PartyPopper}
              title="Nada para limpar"
              description="Não encontramos caches ou dados de navegação nos navegadores e apps conhecidos."
            />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {formatBytes(totalBytes)} encontrados em{" "}
                {plural(groups.length, "aplicativo", "aplicativos")}. Cookies e histórico ficam
                desmarcados até você escolher.
              </p>
              <div className="space-y-2">
                {groups.map((group) => {
                  const open = expanded === group.appId;
                  const Icon = group.appKind === "browser" ? Globe : AppWindow;
                  const chosen = group.items.filter((i) => selected.has(i.id) && !isLocked(i));
                  return (
                    <div key={group.appId} className="surface-inset overflow-hidden">
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={`cleaner-group-${group.appId}`}
                        onClick={() => setExpanded(open ? null : group.appId)}
                        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden focus-visible:ring-inset"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{group.appName}</span>
                            {group.running && <StatusBadge tone="warning">Aberto</StatusBadge>}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {chosen.length
                              ? chosen
                                  .map((i) => CATEGORY[i.category].label)
                                  .filter(unique)
                                  .join(", ")
                              : "Nada selecionado"}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold whitespace-nowrap tabular-nums">
                          {formatBytes(group.sizeBytes)}
                        </span>
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-transform",
                            open && "rotate-180",
                          )}
                        />
                      </button>
                      {open && (
                        <div
                          id={`cleaner-group-${group.appId}`}
                          role="group"
                          aria-label={`Itens de ${group.appName}`}
                          className="animate-fade-in divide-y divide-border/60 border-t border-border/60"
                        >
                          {group.items.map((item) => (
                            <CleanerRow
                              key={item.id}
                              item={item}
                              checked={selected.has(item.id) && !isLocked(item)}
                              disabled={busy}
                              onToggle={toggle}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )
        }
      </ResourceView>

      <ConfirmModal
        open={confirming}
        title={`Limpar ${formatBytes(selectedBytes)}?`}
        confirmLabel="Limpar agora"
        destructive={hasRiskySelection}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void clean()}
      >
        <ul className="space-y-1.5">
          {selectedItems.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="text-foreground">{item.appName}</span>
                {item.profile && ` · ${item.profile}`} · {CATEGORY[item.category].label}
              </span>
              <span className="shrink-0 whitespace-nowrap tabular-nums">
                {formatBytes(item.sizeBytes)}
              </span>
            </li>
          ))}
        </ul>
        {hasRiskySelection && (
          <p className={cn("flex items-start gap-2 rounded-xl border p-3", TONE_CALLOUT.warning)}>
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            Cookies e histórico não podem ser recuperados depois de apagados.
          </p>
        )}
      </ConfirmModal>
    </Panel>
  );
}

const unique = <T,>(value: T, index: number, all: T[]) => all.indexOf(value) === index;

function CleanerRow({
  item,
  checked,
  disabled,
  onToggle,
}: {
  item: CleanerItem;
  checked: boolean;
  disabled: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const [showFiles, setShowFiles] = useState(false);
  const meta = CATEGORY[item.category];
  const locked = isLocked(item);
  const remaining = item.fileCount - item.samples.length;

  return (
    <div className="px-3.5 py-3">
      <div className="flex items-start gap-3">
        <Checkbox
          id={`cleaner-${item.id}`}
          checked={checked}
          disabled={disabled || locked}
          onCheckedChange={(v) => onToggle(item.id, v === true)}
          className="mt-0.5"
          aria-describedby={`cleaner-${item.id}-hint`}
        />
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`cleaner-${item.id}`}
            className={cn("text-sm font-medium", locked ? "opacity-60" : "cursor-pointer")}
          >
            {meta.label}
            {item.profile && (
              <span className="font-normal text-muted-foreground"> · {item.profile}</span>
            )}
          </label>
          <p id={`cleaner-${item.id}-hint`} className="text-xs text-muted-foreground">
            {locked ? `Feche ${item.appName} para limpar este item.` : meta.hint}
          </p>
          {item.samples.length > 0 && (
            <button
              type="button"
              aria-expanded={showFiles}
              onClick={() => setShowFiles((v) => !v)}
              className="mt-1 text-xs font-medium text-primary hover:underline"
            >
              {showFiles
                ? "Ocultar arquivos"
                : `Ver arquivos (${item.fileCount.toLocaleString("pt-BR")})`}
            </button>
          )}
          {showFiles && (
            <ul className="animate-fade-in mt-2 space-y-1 rounded-lg bg-muted/40 p-2.5 font-mono text-[11px] text-muted-foreground">
              {item.samples.map((sample) => (
                <li key={sample.path} className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 truncate" title={sample.path}>
                    {sample.path}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatBytes(sample.sizeBytes)}</span>
                </li>
              ))}
              {remaining > 0 && (
                <li className="pt-1 font-sans italic">
                  e mais {remaining.toLocaleString("pt-BR")} arquivos menores
                </li>
              )}
            </ul>
          )}
        </div>
        <span className="shrink-0 text-sm whitespace-nowrap tabular-nums text-muted-foreground">
          {formatBytes(item.sizeBytes)}
        </span>
      </div>
    </div>
  );
}
