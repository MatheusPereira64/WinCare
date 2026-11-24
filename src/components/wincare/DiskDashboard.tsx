import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Download, HardDrive, HeartPulse, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getNative } from "@/lib/wincare/bridge";
import { diskBreakdown, type DiskBreakdown, type DiskCategory } from "@/lib/wincare/explorer";
import { formatAge, formatDecimal } from "@/lib/wincare/format";
import { formatBytes } from "@/lib/wincare/report";
import { invalidateSystemData } from "@/lib/wincare/systemData";
import { useDiskList } from "@/lib/wincare/useSystem";
import { ChoiceChips } from "./ChoiceChips";
import { ConfirmModal } from "./ConfirmModal";
import { Panel } from "./Panel";

type Slice = DiskCategory | "other";

/** Cor e nome de cada fatia (tokens do tema: funciona no claro e no escuro). */
const SLICES: Record<Slice, { label: string; color: string }> = {
  apps: { label: "Aplicativos", color: "var(--chart-1)" },
  system: { label: "Windows", color: "var(--chart-3)" },
  pictures: { label: "Imagens", color: "var(--chart-2)" },
  videos: { label: "Vídeos", color: "oklch(0.68 0.19 22)" },
  downloads: { label: "Downloads", color: "var(--chart-4)" },
  documents: { label: "Documentos", color: "var(--success)" },
  desktop: { label: "Área de Trabalho", color: "oklch(0.74 0.15 330)" },
  music: { label: "Músicas", color: "oklch(0.78 0.12 190)" },
  recycle: { label: "Lixeira", color: "oklch(0.6 0.06 260)" },
  other: {
    label: "Outros",
    color: "color-mix(in oklab, var(--muted-foreground) 55%, transparent)",
  },
};

const GB = 1024 ** 3;
const gbText = (bytes: number) => formatDecimal(bytes / GB, bytes >= 100 * GB ? 0 : 1);

/**
 * O que está ocupando a unidade: rosca com aplicativos, Windows, pastas do
 * usuário, Lixeira e outros; espaço livre no centro; saúde (SMART), tipo e
 * atalhos para liberar.
 */
export function DiskDashboard({ compact = false }: { compact?: boolean }) {
  const { disks } = useDiskList();
  const letters = useMemo(
    () => disks.map((d) => d.letter.replace(/[:\\]/g, "").toUpperCase()),
    [disks],
  );
  const [drive, setDrive] = useState("C");
  const [data, setData] = useState<DiskBreakdown | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [emptying, setEmptying] = useState(false);

  useEffect(() => {
    if (letters.length && !letters.includes(drive)) setDrive(letters[0]);
  }, [letters, drive]);

  // Consulta e, enquanto mede, atualiza a cada 1,5 s (as fatias vão aparecendo).
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const tick = async (force: boolean) => {
      const out = await diskBreakdown(drive, force).catch(() => null);
      if (!alive || !out) return;
      setData(out.ok ? out : null);
      if (out.ok && out.state === "running")
        timer = window.setTimeout(() => void tick(false), 1500);
    };
    void tick(refresh > 0);
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [drive, refresh]);

  const disk = disks.find((d) => d.letter.toUpperCase().startsWith(drive));
  const slices = useMemo(() => {
    if (!data) return [];
    const list = (Object.keys(SLICES) as Slice[])
      .map((id) => ({
        id,
        bytes: id === "other" ? (data.otherBytes ?? 0) : (data.sizes[id as DiskCategory] ?? 0),
      }))
      .filter((s) => s.bytes > 0);
    return list.sort((a, b) => (a.id === "other" ? 1 : b.id === "other" ? -1 : b.bytes - a.bytes));
  }, [data]);

  const emptyRecycle = async () => {
    setConfirm(false);
    setEmptying(true);
    try {
      const native = getNative();
      const out = native
        ? await native.clearDiskFolder("recycle")
        : { ok: true, freedBytes: data?.sizes.recycle };
      if (out.ok) {
        toast.success("Lixeira esvaziada.", {
          description: out.freedBytes ? `${formatBytes(out.freedBytes)} liberados.` : undefined,
        });
        invalidateSystemData();
        setRefresh((n) => n + 1);
      } else toast.error("Não foi possível esvaziar a Lixeira.", { description: out.reason });
    } finally {
      setEmptying(false);
    }
  };

  const running = data?.state === "running";
  const recycleBytes = data?.sizes.recycle ?? 0;
  const smartOk = !disk || /^ok$/i.test(disk.smart);

  return (
    <Panel variant={compact ? "default" : "hero"} padding={compact ? "md" : "lg"} className="gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <HardDrive aria-hidden className="size-6 text-primary" />
          <h2 className="text-xl font-semibold tracking-tight">Disco</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {letters.length > 1 && (
            <ChoiceChips
              label="Unidade"
              value={drive}
              options={letters.map((l) => ({ value: l, label: `${l}:` }))}
              onChange={setDrive}
            />
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full"
            disabled={running}
            onClick={() => setRefresh((n) => n + 1)}
            title="Medir de novo"
          >
            {running ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {running ? "Medindo…" : "Atualizar"}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "grid items-center gap-6",
          !compact && "@3xl/main:grid-cols-[auto_minmax(0,1fr)]",
        )}
      >
        <Donut data={data} slices={slices} />
        <ul
          aria-label="O que ocupa a unidade"
          className={cn("grid gap-x-6 gap-y-3", !compact && "@xl/main:grid-cols-2")}
        >
          {slices.map((s) => (
            <li key={s.id} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-1 size-3 shrink-0 rounded-full"
                style={{ background: SLICES[s.id].color }}
              />
              <span className="min-w-0">
                <span className="block text-sm text-muted-foreground">{SLICES[s.id].label}</span>
                <span className="block text-base font-semibold tabular-nums">
                  {formatBytes(s.bytes)}
                </span>
              </span>
            </li>
          ))}
          {!slices.length && (
            <li className="text-sm text-muted-foreground">
              {running ? "Medindo o que ocupa a unidade…" : "Sem dados ainda."}
            </li>
          )}
        </ul>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground" aria-live="polite">
        {running
          ? `Medindo pastas (${data?.progress?.done ?? 0} de ${data?.progress?.total ?? 9})… ${data?.at ? "Números da medição anterior enquanto isso." : "Unidades com muitos jogos podem levar alguns minutos."}`
          : data?.at
            ? `Medido ${formatAge(data.at)}. "Outros" é o resto do espaço usado (arquivos de programas fora das pastas padrão, jogos em outras pastas, arquivo de paginação).`
            : ""}
      </p>

      <div className="grid gap-3 @2xl/main:grid-cols-2">
        <StatusCard
          icon={HeartPulse}
          title="Saúde"
          value={disk ? (smartOk ? "Boa" : "Atenção") : "—"}
          tone={smartOk ? "text-success" : "text-warning"}
          detail={
            !disk
              ? "Lendo o autodiagnóstico da unidade…"
              : smartOk
                ? "Esta unidade está em boas condições (SMART)."
                : `O autodiagnóstico (SMART) informou: ${disk.smart}. Faça backup dos seus arquivos.`
          }
        />
        <StatusCard
          icon={HardDrive}
          title="Tipo"
          value={disk?.type ?? "—"}
          detail={
            disk
              ? `${disk.model}${typeof disk.temperature === "number" ? ` · ${disk.temperature} °C` : ""}`
              : "—"
          }
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Componentes</h3>
        <div className="grid gap-3 @2xl/main:grid-cols-2">
          <ComponentCard
            icon={Trash2}
            title="Lixeira"
            bytes={recycleBytes}
            total={data?.usedBytes ?? 1}
            action={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 rounded-full text-primary"
                disabled={!recycleBytes || emptying}
                onClick={() => setConfirm(true)}
              >
                {emptying ? <Loader2 className="animate-spin" /> : null} Liberar
              </Button>
            }
          />
          <ComponentCard
            icon={Download}
            title="Downloads"
            bytes={data?.sizes.downloads ?? 0}
            total={data?.usedBytes ?? 1}
            action={
              <Button asChild size="sm" variant="ghost" className="h-7 rounded-full text-primary">
                <Link to="/limpeza">Revisar</Link>
              </Button>
            }
          />
        </div>
      </div>

      <ConfirmModal
        open={confirm}
        title="Esvaziar a Lixeira?"
        confirmLabel="Esvaziar"
        destructive
        onConfirm={() => void emptyRecycle()}
        onCancel={() => setConfirm(false)}
      >
        <p className="text-sm text-muted-foreground">
          {formatBytes(recycleBytes)} na Lixeira serão apagados de vez. Depois disso não dá para
          restaurar esses arquivos.
        </p>
      </ConfirmModal>
    </Panel>
  );
}

function Donut({
  data,
  slices,
}: {
  data: DiskBreakdown | null;
  slices: { id: Slice; bytes: number }[];
}) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const total = data?.totalBytes || 1;
  // Início de cada fatia no anel (soma das anteriores).
  const segments = slices.map((s, i) => ({
    ...s,
    len: (s.bytes / total) * c,
    start: slices.slice(0, i).reduce((n, p) => n + (p.bytes / total) * c, 0),
  }));
  return (
    <div
      className="relative mx-auto size-56 shrink-0"
      role="img"
      aria-label={
        data
          ? `${gbText(data.freeBytes)} GB livres de ${gbText(data.totalBytes)} GB`
          : "Lendo a unidade"
      }
    >
      <svg viewBox="0 0 180 180" className="size-56 -rotate-90" aria-hidden>
        <circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="26"
          opacity="0.7"
        />
        {segments.map((s) => (
          <circle
            key={s.id}
            cx="90"
            cy="90"
            r={r}
            fill="none"
            stroke={SLICES[s.id].color}
            strokeWidth="26"
            strokeDasharray={`${Math.max(0, s.len - 1.5)} ${c}`}
            strokeDashoffset={-s.start}
            className="transition-[stroke-dasharray] duration-700"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {data ? gbText(data.freeBytes) : "—"}
          <span className="ml-1 text-sm font-medium text-muted-foreground">GB</span>
        </p>
        <p className="text-xs text-muted-foreground">
          de {data ? gbText(data.totalBytes) : "—"} GB
          <br />
          disponíveis
        </p>
      </div>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  title,
  value,
  tone,
  detail,
}: {
  icon: typeof HardDrive;
  title: string;
  value: string;
  tone?: string;
  detail: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3">
        <Icon aria-hidden className="size-4.5 text-muted-foreground" />
        <span className="flex-1 text-sm font-semibold">{title}</span>
        <span className={cn("text-sm font-semibold", tone)}>{value}</span>
      </div>
      <p className="px-4 py-3 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function ComponentCard({
  icon: Icon,
  title,
  bytes,
  total,
  action,
}: {
  icon: typeof HardDrive;
  title: string;
  bytes: number;
  total: number;
  action: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon aria-hidden className="size-4.5 text-muted-foreground" /> {title}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(1, Math.min(100, (bytes / Math.max(1, total)) * 100))}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Em uso: {formatBytes(bytes)}</span>
        {action}
      </div>
    </div>
  );
}
