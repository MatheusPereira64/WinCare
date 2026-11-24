import { useEffect, useMemo, useState } from "react";
import { Download, FolderOpen, Loader2, PackageOpen, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  forgottenFiles,
  revealItem,
  trashItems,
  type ForgottenAge,
  type ForgottenItem,
  type ForgottenResult,
} from "@/lib/wincare/explorer";
import { formatAge, plural } from "@/lib/wincare/format";
import { formatBytes } from "@/lib/wincare/report";
import { ChoiceChips } from "./ChoiceChips";
import { ConfirmModal } from "./ConfirmModal";
import { ListPanel, Panel, PanelHeader } from "./Panel";
import { EmptyState, ErrorState, LoadingState } from "./States";

/**
 * Instaladores já usados e downloads antigos esquecidos em Downloads e na
 * Área de Trabalho. Mostra tudo antes; você marca o que sai (vai para a Lixeira).
 */
export function ForgottenFiles() {
  const [age, setAge] = useState<ForgottenAge>("180d");
  const [data, setData] = useState<ForgottenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [trashing, setTrashing] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    forgottenFiles(age)
      .then((out) => {
        if (!alive) return;
        if (!out.ok) setError(out.reason || "Não foi possível verificar.");
        else {
          setError(null);
          setData(out);
          // Instaladores marcados por padrão: já foram usados; downloads antigos, você escolhe.
          setSelected(new Set(out.installers.map((i) => i.id)));
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Falha ao verificar."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [age, reload]);

  const all = useMemo(() => [...(data?.installers ?? []), ...(data?.oldDownloads ?? [])], [data]);
  const selectedBytes = all.filter((i) => selected.has(i.id)).reduce((n, i) => n + i.sizeBytes, 0);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const doTrash = async () => {
    setConfirm(false);
    setTrashing(true);
    try {
      const out = await trashItems([...selected], "forgotten");
      if (out.removed) {
        toast.success(
          `${plural(out.removed, "arquivo enviado", "arquivos enviados")} para a Lixeira.`,
          {
            description: `${formatBytes(out.freedBytes)} liberados.`,
          },
        );
      }
      if (out.failed.length) toast.warning(out.failed[0].reason);
      setReload((n) => n + 1);
    } finally {
      setTrashing(false);
    }
  };

  return (
    <Panel>
      <PanelHeader
        icon={PackageOpen}
        title="Arquivos esquecidos"
        description="Instaladores que já cumpriram o papel e downloads antigos em Downloads e na Área de Trabalho."
        actions={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full"
            disabled={loading}
            onClick={() => setReload((n) => n + 1)}
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} /> Verificar de novo
          </Button>
        }
      />

      {error && !data ? (
        <ErrorState description={error} onRetry={() => setReload((n) => n + 1)} />
      ) : !data ? (
        <LoadingState label="Procurando instaladores e downloads antigos…" rows={3} />
      ) : all.length === 0 && age === "90d" ? (
        <EmptyState
          icon={PackageOpen}
          title="Nada esquecido por aqui"
          description="Downloads e Área de Trabalho estão sem instaladores velhos ou arquivos antigos."
        />
      ) : (
        <div className="space-y-4">
          <Section
            title="Instaladores já usados"
            hint="Programas costumam ser instalados uma vez só. Mais de 2 semanas na pasta e o instalador vira peso morto."
            items={data.installers}
            totalBytes={data.installersBytes}
            selected={selected}
            onToggle={toggle}
            icon={PackageOpen}
          />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Downloads sem mexer há
              </span>
              <ChoiceChips
                label="Idade dos downloads"
                value={age}
                options={[
                  { value: "90d", label: "3 meses" },
                  { value: "180d", label: "6 meses" },
                  { value: "1y", label: "1 ano" },
                ]}
                onChange={setAge}
              />
            </div>
            <Section
              title="Downloads antigos"
              hint="Confira antes: podem ser documentos que você ainda quer guardar em outro lugar."
              items={data.oldDownloads}
              totalBytes={data.oldDownloadsBytes}
              selected={selected}
              onToggle={toggle}
              icon={Download}
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!selected.size || trashing}
              onClick={() => setConfirm(true)}
            >
              {trashing ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Mover {plural(selected.size, "arquivo", "arquivos")} para a Lixeira (
              {formatBytes(selectedBytes)})
            </Button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirm}
        title="Mover para a Lixeira?"
        confirmLabel="Mover para a Lixeira"
        onConfirm={() => void doTrash()}
        onCancel={() => setConfirm(false)}
      >
        <p className="text-sm text-muted-foreground">
          {plural(selected.size, "arquivo vai", "arquivos vão")} para a Lixeira (
          {formatBytes(selectedBytes)}). Até esvaziar a Lixeira, dá para restaurar.
        </p>
      </ConfirmModal>
    </Panel>
  );
}

function Section({
  title,
  hint,
  items,
  totalBytes,
  selected,
  onToggle,
  icon: Icon,
}: {
  title: string;
  hint: string;
  items: ForgottenItem[];
  totalBytes: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
  icon: typeof Download;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon aria-hidden className="size-4 text-primary" /> {title}
        </h3>
        <span className="text-xs text-muted-foreground">
          {plural(items.length, "arquivo", "arquivos")} · {formatBytes(totalBytes)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
          Nenhum arquivo nessa categoria.
        </p>
      ) : (
        <ListPanel label={title} className="max-h-72 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2">
              <Checkbox
                checked={selected.has(item.id)}
                onCheckedChange={() => onToggle(item.id)}
                aria-label={`Selecionar ${item.name}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" title={item.path}>
                  {item.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.where} · alterado {formatAge(item.modifiedAt)}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums">
                {formatBytes(item.sizeBytes)}
              </span>
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
    </div>
  );
}
