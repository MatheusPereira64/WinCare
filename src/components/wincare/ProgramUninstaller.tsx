import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileKey2,
  FolderOpen,
  Loader2,
  PackageSearch,
  PackageX,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  createRestorePoint,
  listPrograms,
  openWindowsTarget,
  removeLeftovers,
  scanLeftovers,
  uninstallProgram,
} from "@/lib/wincare/bridge";
import { formatAge, plural } from "@/lib/wincare/format";
import { formatBytes } from "@/lib/wincare/report";
import { useStore } from "@/lib/wincare/store";
import type { InstalledProgram, LeftoverItem, LeftoverRemoval } from "@/lib/wincare/types";
import { TONE_CALLOUT } from "@/lib/wincare/tone";
import { useResource } from "@/lib/wincare/useResource";
import { CheckboxCard } from "./CheckboxCard";
import { ChoiceChips } from "./ChoiceChips";
import { ModalShell } from "./ConfirmModal";
import { ListPanel, Panel } from "./Panel";
import { EmptyState, LoadingState, ResourceView } from "./States";
import { StatusBadge } from "./StatusBadge";
import { PageHeader } from "./PageHeader";

type SortKey = "name" | "size" | "date" | "lastUsed";
type FilterKey = "all" | "idle" | "large" | "recent" | "user";

const LARGE_BYTES = 500 * 1024 ** 2;
const RECENT_DAYS = 30;
/** Sem abrir há 3 meses ou mais (pelo registro de uso do Windows): "encostado". */
const IDLE_DAYS = 90;
const DAY_MS = 86_400_000;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Nome" },
  { value: "size", label: "Tamanho" },
  { value: "date", label: "Mais recentes" },
  { value: "lastUsed", label: "Menos usados" },
];

const FILTER_OPTIONS: { value: FilterKey; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "idle", label: "Encostados" },
  { value: "large", label: "Grandes" },
  { value: "recent", label: `Últimos ${RECENT_DAYS} dias` },
  { value: "user", label: "Só deste usuário" },
];

const firstLetter = (name: string) => {
  const letter = name.trim().charAt(0).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return /[A-Z]/.test(letter) ? letter : "#";
};

/** Encostado: aberto pela última vez há 3 meses ou mais. Sem registro de uso não conta. */
function isIdle(program: InstalledProgram, now: number) {
  return (
    !program.critical &&
    typeof program.lastUsedAt === "number" &&
    now - program.lastUsedAt >= IDLE_DAYS * DAY_MS
  );
}

function lastUseLabel(program: InstalledProgram) {
  if (typeof program.lastUsedAt !== "number") return null;
  return `aberto ${formatAge(program.lastUsedAt)}`;
}

const formatDate = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "Data desconhecida";

function ProgramIcon({ program }: { program: InstalledProgram }) {
  if (program.icon) {
    return (
      <img src={program.icon} alt="" className="size-8 shrink-0 rounded-md" draggable={false} />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-semibold text-primary"
    >
      {firstLetter(program.name)}
    </span>
  );
}

async function loadPrograms() {
  const out = await listPrograms();
  if (!out.ok) throw new Error(out.reason);
  return out.items;
}

export function ProgramUninstaller() {
  const resource = useResource(loadPrograms, {
    errorMessage: "Não foi possível listar os programas.",
  });
  const { reload: refresh, refreshing, status } = resource;
  const programs = useMemo(() => resource.data ?? [], [resource.data]);
  const loading = status === "loading";
  const [sort, setSort] = useState<SortKey>("name");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [letter, setLetter] = useState("Todas");
  const [queue, setQueue] = useState<InstalledProgram[]>([]);
  const [queueSize, setQueueSize] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const target = queue[0] ?? null;
  const startQueue = (list: InstalledProgram[]) => {
    setQueue(list);
    setQueueSize(list.length);
  };
  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pickedPrograms = programs.filter((p) => picked.has(p.id));
  const [openedAt] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const cutoff = openedAt - RECENT_DAYS * 86_400_000;
    return programs.filter((p) => {
      if (filter === "large" && p.sizeBytes < LARGE_BYTES) return false;
      if (filter === "user" && p.scope !== "user") return false;
      if (filter === "idle" && !isIdle(p, openedAt)) return false;
      if (filter === "recent" && (!p.installDate || new Date(p.installDate).getTime() < cutoff)) {
        return false;
      }
      return true;
    });
  }, [programs, filter, openedAt]);

  const letters = useMemo(
    () => [...new Set(filtered.map((p) => firstLetter(p.name)))].sort(),
    [filtered],
  );

  const visible = useMemo(() => {
    const list =
      letter === "Todas" ? filtered : filtered.filter((p) => firstLetter(p.name) === letter);
    const sorted = [...list];
    if (sort === "size") sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
    if (sort === "lastUsed") sorted.sort((a, b) => (a.lastUsedAt ?? 0) - (b.lastUsedAt ?? 0));
    if (sort === "date")
      sorted.sort((a, b) => (b.installDate ?? "").localeCompare(a.installDate ?? ""));
    return sorted;
  }, [filtered, letter, sort]);

  const totalBytes = programs.reduce((sum, p) => sum + p.sizeBytes, 0);
  const idleCount = programs.filter((p) => isIdle(p, openedAt)).length;

  return (
    <div className="space-y-6" data-wincare-programs>
      <PageHeader
        icon={PackageX}
        title="Programas"
        subtitle="Desinstale programas e remova o que eles deixaram para trás."
        badges={
          status === "ready" && (
            <>
              <StatusBadge>
                {programs.length} instalados · {formatBytes(totalBytes)}
              </StatusBadge>
              {idleCount > 0 && (
                <StatusBadge tone="warning" title="Sem abrir há 3 meses ou mais">
                  {plural(idleCount, "encostado", "encostados")}
                </StatusBadge>
              )}
            </>
          )
        }
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => void openWindowsTarget("start ms-settings:appsfeatures")}
              title="Apps da Microsoft Store são geridos pelo próprio Windows"
            >
              <ExternalLink /> Apps da Store
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-full"
              disabled={loading || refreshing}
              onClick={() => void refresh()}
            >
              {loading || refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Atualizar
            </Button>
          </>
        }
      />

      <Panel padding="sm" className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Mostrar</span>
            <ChoiceChips
              label="Filtrar programas"
              value={filter}
              options={FILTER_OPTIONS}
              onChange={(v) => {
                setFilter(v);
                setLetter("Todas");
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Ordenar por</span>
            <ChoiceChips
              label="Ordenar programas"
              value={sort}
              options={SORT_OPTIONS}
              onChange={setSort}
            />
          </div>
        </div>
        {filter === "idle" && (
          <p className="text-xs text-muted-foreground">
            Programas que você não abre há 3 meses ou mais, segundo o registro de uso do Windows.
            Apps que só rodam em segundo plano podem não ter esse registro e não aparecem aqui.
          </p>
        )}
        {picked.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-sm">
              {plural(picked.size, "programa selecionado", "programas selecionados")} ·{" "}
              {formatBytes(pickedPrograms.reduce((n, p) => n + p.sizeBytes, 0))}
            </span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
                Limpar seleção
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  startQueue(pickedPrograms);
                  setPicked(new Set());
                }}
              >
                <Trash2 /> Desinstalar em sequência
              </Button>
            </div>
          </div>
        )}
        {letters.length > 1 && (
          <ChoiceChips
            variant="letter"
            label="Filtrar pela inicial"
            value={letter}
            onChange={setLetter}
            options={["Todas", ...letters].map((l) => ({
              value: l,
              label: l,
              ariaLabel: l === "#" ? "Números e símbolos" : undefined,
            }))}
          />
        )}
      </Panel>

      <ResourceView
        resource={resource}
        errorTitle="Não foi possível listar os programas"
        loading={<LoadingState label="Lendo os programas instalados…" rows={6} />}
      >
        {() =>
          visible.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="Nenhum programa aqui"
              description={
                programs.length === 0
                  ? "O Windows não informou nenhum programa instalado."
                  : "Nenhum programa corresponde a este filtro."
              }
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setFilter("all");
                    setLetter("Todas");
                  }}
                >
                  Mostrar todos
                </Button>
              }
            />
          ) : (
            <ListPanel label="Programas instalados">
              {visible.map((program) => (
                <li
                  key={program.id}
                  className="group flex items-center gap-3.5 px-4 py-2.5 transition-colors hover:bg-muted/30"
                >
                  <Checkbox
                    checked={picked.has(program.id)}
                    onCheckedChange={() => togglePicked(program.id)}
                    aria-label={`Selecionar ${program.name} para desinstalar em sequência`}
                  />
                  <ProgramIcon program={program} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium" title={program.name}>
                        {program.name}
                      </span>
                      {program.critical && (
                        <StatusBadge
                          tone="warning"
                          title="Outros programas costumam depender deste componente"
                        >
                          Componente
                        </StatusBadge>
                      )}
                      {isIdle(program, openedAt) && (
                        <StatusBadge tone="neutral" title="Sem abrir há 3 meses ou mais">
                          Encostado
                        </StatusBadge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        program.publisher,
                        program.version && `v${program.version}`,
                        formatDate(program.installDate),
                        lastUseLabel(program),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="hidden w-20 shrink-0 text-right text-sm whitespace-nowrap tabular-nums text-muted-foreground @md/main:block">
                    {program.sizeBytes > 0 ? formatBytes(program.sizeBytes) : "—"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-full"
                    aria-label={`Desinstalar ${program.name}`}
                    onClick={() => startQueue([program])}
                  >
                    <Trash2 /> Desinstalar
                  </Button>
                </li>
              ))}
            </ListPanel>
          )
        }
      </ResourceView>

      {target && (
        <UninstallWizard
          key={target.id}
          program={target}
          position={queueSize > 1 ? `${queueSize - queue.length + 1} de ${queueSize}` : undefined}
          onClose={() => setQueue((q) => q.slice(1))}
          onFinished={() => void refresh()}
        />
      )}
    </div>
  );
}

type Stage =
  | "confirm"
  | "restore-point"
  | "uninstalling"
  | "still-installed"
  | "scanning"
  | "leftovers"
  | "removing"
  | "done";

function UninstallWizard({
  program,
  position,
  onClose,
  onFinished,
}: {
  program: InstalledProgram;
  /** "2 de 5" quando faz parte de uma desinstalação em sequência. */
  position?: string;
  onClose: () => void;
  onFinished: () => void;
}) {
  const autoRestorePoint = useStore((s) => s.autoRestorePoint);
  const [stage, setStage] = useState<Stage>("confirm");
  const [wantRestorePoint, setWantRestorePoint] = useState(autoRestorePoint);
  const [error, setError] = useState<string | null>(null);
  const [leftovers, setLeftovers] = useState<LeftoverItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removal, setRemoval] = useState<LeftoverRemoval | null>(null);
  const [changed, setChanged] = useState(false);

  const busy = ["restore-point", "uninstalling", "scanning", "removing"].includes(stage);

  const close = () => {
    if (changed) onFinished();
    onClose();
  };

  const findLeftovers = async () => {
    setError(null);
    setStage("scanning");
    const out = await scanLeftovers(program.id);
    if (!out.ok) {
      if (out.reason === "still-installed") {
        setStage("still-installed");
        return;
      }
      setError(out.reason ?? "Não foi possível procurar resíduos.");
      setStage("confirm");
      return;
    }
    setChanged(true);
    setLeftovers(out.items);
    setSelected(new Set(out.items.map((i) => i.id)));
    setStage(out.items.length ? "leftovers" : "done");
  };

  const startUninstall = async () => {
    setError(null);
    if (wantRestorePoint) {
      setStage("restore-point");
      const point = await createRestorePoint(`antes de remover ${program.name}`);
      if (!point.ok) {
        setWantRestorePoint(false);
        setError(
          `O ponto de restauração não foi criado (${point.message ?? "erro desconhecido"}). Você pode tentar de novo ou desinstalar sem ele.`,
        );
        setStage("confirm");
        return;
      }
    }
    setStage("uninstalling");
    const out = await uninstallProgram(program.id);
    if (!out.ok) {
      if (out.reason === "uninstaller-missing") {
        await findLeftovers();
        return;
      }
      setError(
        out.reason === "cancelled"
          ? "O desinstalador não foi aberto: a permissão foi negada."
          : (out.message ?? "Não foi possível abrir o desinstalador."),
      );
      setStage("confirm");
      return;
    }
    if (out.stillInstalled) {
      setStage("still-installed");
      return;
    }
    await findLeftovers();
  };

  const remove = async () => {
    setStage("removing");
    const out = await removeLeftovers([...selected]);
    setRemoval(out);
    setStage("done");
  };

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectedBytes = leftovers
    .filter((i) => selected.has(i.id))
    .reduce((sum, i) => sum + i.sizeBytes, 0);

  const footer = () => {
    switch (stage) {
      case "confirm":
        return (
          <>
            <Button type="button" variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void startUninstall()}>
              Abrir desinstalador
            </Button>
          </>
        );
      case "still-installed":
        return (
          <>
            <Button type="button" variant="outline" onClick={close}>
              Fechar
            </Button>
            <Button type="button" onClick={() => void findLeftovers()}>
              <RefreshCw /> Verificar de novo
            </Button>
          </>
        );
      case "leftovers":
        return (
          <>
            <Button type="button" variant="outline" onClick={close}>
              Manter tudo
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={selected.size === 0}
              onClick={() => void remove()}
            >
              <Trash2 /> Remover {selected.size} {selected.size === 1 ? "item" : "itens"}
              {selectedBytes > 0 && ` (${formatBytes(selectedBytes)})`}
            </Button>
          </>
        );
      case "done":
        return (
          <Button type="button" onClick={close}>
            Concluir
          </Button>
        );
      default:
        return (
          <Button type="button" variant="outline" disabled>
            Aguarde…
          </Button>
        );
    }
  };

  return (
    <ModalShell
      open
      locked={busy}
      describeBody={stage !== "leftovers"}
      className="max-w-2xl"
      title={
        <span className="min-w-0 truncate">
          Desinstalar {program.name}
          {position && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">({position})</span>
          )}
        </span>
      }
      icon={<ProgramIcon program={program} />}
      onClose={close}
      footer={footer()}
    >
      {stage === "confirm" && (
        <>
          <p>
            Vamos abrir o desinstalador do próprio programa. Depois que ele terminar, o WinCare
            procura pastas e chaves de registro que ficaram para trás e mostra a lista antes de
            remover qualquer coisa.
          </p>
          {program.critical && (
            <p className={cn("flex items-start gap-2 rounded-xl border p-3", TONE_CALLOUT.warning)}>
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              Este é um componente usado por outros programas. Eles podem parar de funcionar sem
              ele.
            </p>
          )}
          <CheckboxCard
            checked={wantRestorePoint}
            onCheckedChange={setWantRestorePoint}
            icon={ShieldCheck}
            title="Criar ponto de restauração antes"
            description="Recomendado para drivers e programas grandes."
          />
          {error && (
            <p role="alert" className="flex items-start gap-2 text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
        </>
      )}

      {stage === "restore-point" && (
        <Waiting title="Criando ponto de restauração…" hint="Isso pode levar até um minuto." />
      )}
      {stage === "uninstalling" && (
        <Waiting
          title="Siga as instruções do desinstalador"
          hint="A janela do programa pode ter aberto atrás do WinCare. Quando terminar, seguimos sozinhos para a próxima etapa."
        />
      )}
      {stage === "scanning" && (
        <Waiting title="Procurando resíduos…" hint="Verificando pastas e registro." />
      )}
      {stage === "removing" && <Waiting title="Removendo os itens selecionados…" />}

      {stage === "still-installed" && (
        <p className={cn("flex items-start gap-2 rounded-xl border p-3", TONE_CALLOUT.warning)}>
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            O programa ainda aparece como instalado. Se o desinstalador continua aberto, termine por
            lá e verifique de novo. Nada será apagado enquanto ele estiver instalado.
          </span>
        </p>
      )}

      {stage === "leftovers" && (
        <>
          <p>
            Encontramos {leftovers.length} {leftovers.length === 1 ? "item" : "itens"} com o nome
            deste programa. Revise antes de remover e desmarque o que quiser manter.
          </p>
          <ul className="space-y-2">
            {leftovers.map((item) => (
              <LeftoverRow
                key={item.id}
                item={item}
                checked={selected.has(item.id)}
                onToggle={toggle}
              />
            ))}
          </ul>
        </>
      )}

      {stage === "done" && (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-foreground">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
            {removal
              ? `${removal.removed} ${removal.removed === 1 ? "item removido" : "itens removidos"}${removal.freedBytes > 0 ? `, ${formatBytes(removal.freedBytes)} liberados` : ""}.`
              : "Programa desinstalado, sem resíduos encontrados."}
          </p>
          {removal?.failed.length ? (
            <div className={cn("rounded-xl border p-3", TONE_CALLOUT.warning)}>
              <p className="font-medium">Não foi possível remover:</p>
              <ul className="mt-1 space-y-1 text-xs">
                {removal.failed.map((f) => (
                  <li key={f.path} className="break-all">
                    {f.path}: {f.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {removal?.backupDir && (
            <p className="text-xs break-all">
              Backup do registro salvo em <code className="font-mono">{removal.backupDir}</code>.
              Abra o arquivo .reg para restaurar.
            </p>
          )}
        </div>
      )}
    </ModalShell>
  );
}

function Waiting({ title, hint }: { title: string; hint?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-8 text-center">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-md text-xs">{hint}</p>}
    </div>
  );
}

function LeftoverRow({
  item,
  checked,
  onToggle,
}: {
  item: LeftoverItem;
  checked: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const Icon = item.kind === "folder" ? FolderOpen : FileKey2;
  const destiny =
    item.kind === "registry"
      ? "Backup .reg antes"
      : item.requiresAdmin
        ? "Remoção permanente"
        : "Vai para a Lixeira";
  return (
    <li>
      <label className="surface-inset flex cursor-pointer flex-wrap items-start gap-x-3 gap-y-2 p-3 hover:bg-muted/30">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onToggle(item.id, v === true)}
          className="mt-0.5"
        />
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        {/* Em janelas estreitas o selo desce para a linha de baixo em vez de espremer o caminho. */}
        <span className="min-w-48 flex-1">
          <span className="block font-mono text-xs break-all text-foreground">{item.path}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {item.reason}
            {item.kind === "folder" && (
              <span className="tabular-nums">
                · {formatBytes(item.sizeBytes)} em {item.fileCount} arquivos
              </span>
            )}
          </span>
        </span>
        <StatusBadge
          tone={item.kind === "folder" && item.requiresAdmin ? "warning" : "neutral"}
          className="ml-auto shrink-0"
        >
          {destiny}
        </StatusBadge>
      </label>
    </li>
  );
}
