import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FolderOpen, Loader2, SearchX, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CATEGORY_LABEL,
  fileOwners,
  findFiles,
  revealItem,
  trashItems,
  type FileCategory,
  type FindFilters,
  type FindResult,
} from "@/lib/wincare/explorer";
import { formatAge, plural } from "@/lib/wincare/format";
import { formatBytes } from "@/lib/wincare/report";
import { ChoiceChips } from "./ChoiceChips";
import { ConfirmModal } from "./ConfirmModal";
import { ExportButtons } from "./ExportButtons";
import { ListPanel } from "./Panel";
import { EmptyState, ErrorState, LoadingState } from "./States";
import { StatusBadge } from "./StatusBadge";

const CATEGORIES: FileCategory[] = [
  "all",
  "video",
  "image",
  "audio",
  "document",
  "archive",
  "installer",
  "diskImage",
];

const SIZES: { value: FindFilters["size"]; label: string }[] = [
  { value: "any", label: "Qualquer" },
  { value: "10mb", label: "10 MB+" },
  { value: "100mb", label: "100 MB+" },
  { value: "500mb", label: "500 MB+" },
  { value: "1gb", label: "1 GB+" },
  { value: "5gb", label: "5 GB+" },
];

const AGES: { value: FindFilters["age"]; label: string }[] = [
  { value: "any", label: "Qualquer data" },
  { value: "30d", label: "Sem mexer há 1 mês" },
  { value: "180d", label: "Há 6 meses" },
  { value: "1y", label: "Há 1 ano" },
  { value: "2y", label: "Há 2 anos" },
];

const SORTS: { value: FindFilters["sort"]; label: string }[] = [
  { value: "size", label: "Maiores primeiro" },
  { value: "oldest", label: "Mais antigos primeiro" },
];

/**
 * Busca de arquivos esquecidos por tipo, tamanho e data (filtros em chips —
 * sem campo de texto). Usa o índice da última análise: arquivos de 1 MB ou
 * mais (fotos a partir de 100 KB).
 */
export function FileFinder({ version, onChanged }: { version: number; onChanged: () => void }) {
  const [filters, setFilters] = useState<FindFilters>({
    category: "video",
    size: "1gb",
    age: "any",
    sort: "size",
  });
  const [result, setResult] = useState<FindResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [owners, setOwners] = useState<Record<string, string> | null>(null);
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [trashing, setTrashing] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    findFiles(filters)
      .then((out) => {
        if (!alive) return;
        if (!out.ok) setError(out.reason || "A busca falhou.");
        else {
          setError(null);
          setResult(out);
          setSelected(new Set());
          setOwners(null);
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "A busca falhou."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [filters, version]);

  const set = <K extends keyof FindFilters>(key: K, value: FindFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const deletable = useMemo(() => result?.items.filter((i) => i.deletable) ?? [], [result]);
  const selectedItems = deletable.filter((i) => selected.has(i.id));
  const selectedBytes = selectedItems.reduce((n, i) => n + i.sizeBytes, 0);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const loadOwners = async () => {
    if (!result) return;
    setLoadingOwners(true);
    try {
      const out = await fileOwners(result.items.map((i) => i.id));
      setOwners(out.owners || {});
    } finally {
      setLoadingOwners(false);
    }
  };

  const doTrash = async () => {
    setConfirm(false);
    setTrashing(true);
    try {
      const out = await trashItems([...selected], "files");
      if (out.removed) {
        toast.success(
          `${plural(out.removed, "arquivo enviado", "arquivos enviados")} para a Lixeira.`,
          {
            description: `${formatBytes(out.freedBytes)} liberados. Dá para recuperar pela Lixeira.`,
          },
        );
      }
      if (out.failed.length) {
        toast.warning(`${plural(out.failed.length, "arquivo ficou", "arquivos ficaram")}.`, {
          description: out.failed[0].reason,
        });
      }
      onChanged();
    } finally {
      setTrashing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 @3xl/main:grid-cols-2">
        <FilterRow label="Tipo">
          <ChoiceChips
            label="Tipo de arquivo"
            value={filters.category}
            options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
            onChange={(v) => set("category", v)}
          />
        </FilterRow>
        <FilterRow label="Tamanho">
          <ChoiceChips
            label="Tamanho mínimo"
            value={filters.size}
            options={SIZES}
            onChange={(v) => set("size", v)}
          />
        </FilterRow>
        <FilterRow label="Última alteração">
          <ChoiceChips
            label="Última alteração"
            value={filters.age}
            options={AGES}
            onChange={(v) => set("age", v)}
          />
        </FilterRow>
        <FilterRow label="Ordem">
          <ChoiceChips
            label="Ordem"
            value={filters.sort}
            options={SORTS}
            onChange={(v) => set("sort", v)}
          />
        </FilterRow>
      </div>

      {error && !result ? (
        <ErrorState description={error} onRetry={() => setFilters({ ...filters })} />
      ) : !result ? (
        <LoadingState label="Procurando arquivos…" rows={4} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm" aria-live="polite">
              {loading ? (
                <span className="text-muted-foreground">Atualizando…</span>
              ) : (
                <>
                  <strong>{plural(result.total, "arquivo", "arquivos")}</strong>{" "}
                  <span className="text-muted-foreground">
                    · {formatBytes(result.totalBytes)}
                    {result.total > result.items.length &&
                      ` · mostrando os ${result.items.length} primeiros`}
                  </span>
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full"
                disabled={!result.items.length || loadingOwners || !!owners}
                title="Consulta no Windows a conta dona de cada arquivo da lista"
                onClick={() => void loadOwners()}
              >
                {loadingOwners ? <Loader2 className="animate-spin" /> : <UserRound />}
                {owners ? "Donos carregados" : "Mostrar donos"}
              </Button>
              <ExportButtons
                disabled={!result.items.length}
                build={() => ({
                  title: "Arquivos encontrados",
                  fileName: "WinCare-arquivos",
                  columns: [
                    { key: "name", label: "Arquivo" },
                    { key: "type", label: "Tipo" },
                    { key: "size", label: "Tamanho", type: "bytes" },
                    { key: "modified", label: "Alterado em", type: "date" },
                    { key: "owner", label: "Dono" },
                    { key: "path", label: "Caminho" },
                  ],
                  rows: result.items.map((i) => ({
                    name: i.name,
                    type: CATEGORY_LABEL[i.category],
                    size: i.sizeBytes,
                    modified: i.modifiedAt,
                    owner: owners?.[i.id] ?? "",
                    path: i.path,
                  })),
                })}
              />
            </div>
          </div>

          {result.items.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nada com esses filtros"
              description="Tente um tamanho menor ou outro tipo de arquivo."
            />
          ) : (
            <ListPanel label="Arquivos encontrados" className="max-h-[480px] overflow-y-auto">
              {result.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Checkbox
                    checked={selected.has(item.id)}
                    disabled={!item.deletable}
                    onCheckedChange={() => toggle(item.id)}
                    aria-label={`Selecionar ${item.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={item.name}>
                      {item.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" title={item.path}>
                      {item.path}
                    </p>
                  </div>
                  <div className="hidden shrink-0 flex-col items-end gap-1 @xl/main:flex">
                    <StatusBadge tone="neutral">{CATEGORY_LABEL[item.category]}</StatusBadge>
                    {owners?.[item.id] && (
                      <span className="text-[11px] text-muted-foreground">{owners[item.id]}</span>
                    )}
                  </div>
                  <div className="w-24 shrink-0 text-right text-xs tabular-nums">
                    <span className="block font-semibold">{formatBytes(item.sizeBytes)}</span>
                    <span className="text-muted-foreground">{formatAge(item.modifiedAt)}</span>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0 rounded-full"
                    aria-label={`Mostrar ${item.name} no Explorador`}
                    title="Mostrar no Explorador"
                    onClick={() => void revealItem(item.id)}
                  >
                    <FolderOpen />
                  </Button>
                </li>
              ))}
            </ListPanel>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Arquivos do Windows e de programas aparecem na lista, mas não podem ser selecionados.
            </p>
            <Button
              type="button"
              disabled={!selectedItems.length || trashing}
              onClick={() => setConfirm(true)}
            >
              {trashing ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Mover {selectedItems.length || ""} para a Lixeira
              {selectedItems.length > 0 && ` (${formatBytes(selectedBytes)})`}
            </Button>
          </div>
        </>
      )}

      <ConfirmModal
        open={confirm}
        title="Mover para a Lixeira?"
        confirmLabel="Mover para a Lixeira"
        onConfirm={() => void doTrash()}
        onCancel={() => setConfirm(false)}
      >
        <p className="text-sm text-muted-foreground">
          {plural(selectedItems.length, "arquivo", "arquivos")} ({formatBytes(selectedBytes)}) vão
          para a Lixeira do Windows. Até você esvaziar a Lixeira, dá para restaurar.
        </p>
      </ConfirmModal>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
