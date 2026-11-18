import { useMemo, useState } from "react";
import { Activity, Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ChoiceChips } from "@/components/wincare/ChoiceChips";
import { Sparkline } from "@/components/wincare/Sparkline";
import { Panel, PanelHeader } from "./Panel";
import { EmptyState } from "./States";
import { diffSnapshots, snapshotFromState, type HealthSample } from "@/lib/wincare/intelligence";
import { intelActions, useIntel } from "@/lib/wincare/intelligenceStore";
import type { StartupItem, SystemInfo, TopProcess } from "@/lib/wincare/types";

function formatWhen(ts: number) {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HealthTimelineCard({ samples }: { samples: HealthSample[] }) {
  const health = samples.map((s) => s.health);
  const cpu = samples.map((s) => s.cpu);
  const ram = samples.map((s) => s.ram);
  const last = samples[samples.length - 1];
  const first = samples[0];
  const delta = last && first ? last.health - first.health : 0;

  return (
    <Panel className="@container">
      <PanelHeader
        icon={Activity}
        title="Linha do tempo da saúde"
        description={`Uma medição a cada ~10 min enquanto o WinCare está aberto.${last ? ` Última: ${formatWhen(last.ts)}.` : ""}`}
        actions={
          last && (
            <p className="text-sm tabular-nums text-muted-foreground">
              Saúde {last.health}%{" "}
              <span className={delta >= 0 ? "text-success" : "text-destructive"}>
                ({delta >= 0 ? "+" : ""}
                {delta} desde o início)
              </span>
            </p>
          )
        }
      />

      <div className="grid gap-4 @lg:grid-cols-3" role="list" aria-label="Tendências">
        <Meter label="Saúde" values={health} suffix="%" />
        <Meter label="CPU" values={cpu} suffix="%" />
        <Meter label="Memória" values={ram} suffix="%" />
      </div>
    </Panel>
  );
}

function Meter({ label, values, suffix }: { label: string; values: number[]; suffix: string }) {
  const current = values[values.length - 1];
  return (
    <div role="listitem" className="surface-inset p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums">
          {typeof current === "number" ? `${current}${suffix}` : "—"}
        </p>
      </div>
      <div className="mt-2 text-primary">
        <Sparkline values={values} label={`${label}: tendência`} suffix={suffix} />
      </div>
    </div>
  );
}

export function SnapshotCompareCard({
  info,
  startup,
  processes,
}: {
  info: SystemInfo;
  startup: StartupItem[];
  processes: TopProcess[];
}) {
  const snapshots = useIntel((s) => s.snapshots);
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  const left = snapshots.find((s) => s.id === (leftId || snapshots[1]?.id));
  const right = snapshots.find((s) => s.id === (rightId || snapshots[0]?.id));
  const rows = useMemo(() => (left && right ? diffSnapshots(left, right) : []), [left, right]);

  const capture = () => {
    const snap = snapshotFromState(info, startup, processes);
    intelActions.addSnapshot(snap);
    toast.success("Captura salva", { description: snap.label });
  };

  return (
    <Panel className="@container">
      <PanelHeader
        icon={Camera}
        title="Antes e depois"
        description="Capture o estado do PC, faça uma limpeza ou mude a inicialização e compare os números."
        actions={
          <Button
            type="button"
            className="rounded-full"
            onClick={capture}
            disabled={info.hostname === "…"}
          >
            <Camera /> Capturar agora
          </Button>
        }
      />

      {snapshots.length === 0 && (
        <EmptyState
          size="sm"
          icon={Camera}
          title="Nenhuma captura ainda"
          description="Capture o estado atual antes de uma limpeza para comparar depois."
        />
      )}

      {snapshots.length > 0 && (
        <ul className="divide-y divide-border/60" aria-label="Capturas">
          {snapshots.slice(0, 6).map((snap) => (
            <li key={snap.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{snap.label}</p>
                <p className="text-xs text-muted-foreground">
                  Saúde {snap.health}% · memória {snap.ram}% · {snap.startupEnabled} na
                  inicialização
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0"
                aria-label={`Remover ${snap.label}`}
                onClick={() => intelActions.removeSnapshot(snap.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {snapshots.length >= 2 && left && right && (
        <div className="space-y-3 border-t border-border/60 pt-3">
          <PickerRow
            label="Antes"
            selectedId={left.id}
            snapshots={snapshots}
            onSelect={setLeftId}
          />
          <PickerRow
            label="Depois"
            selectedId={right.id}
            snapshots={snapshots}
            onSelect={setRightId}
          />
          <div className="grid gap-2 @lg:grid-cols-2">
            {rows.map((row) => (
              <div
                key={row.label}
                className="surface-inset flex items-center justify-between px-3 py-2 text-sm"
              >
                <span className="min-w-0 text-muted-foreground">{row.label}</span>
                <span className="shrink-0 tabular-nums">
                  {row.before} → {row.after}{" "}
                  {row.delta != null && row.delta !== 0 && (
                    <span
                      className={
                        row.tone === "up"
                          ? "text-success"
                          : row.tone === "down"
                            ? "text-destructive"
                            : ""
                      }
                    >
                      ({row.delta > 0 ? "+" : ""}
                      {row.delta})
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Escolha do snapshot (radiogroup) — botões no lugar de <select>, que trava a UI no Electron. */
function PickerRow({
  label,
  selectedId,
  snapshots,
  onSelect,
}: {
  label: string;
  selectedId: string;
  snapshots: { id: string; ts: number }[];
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground" aria-hidden>
        {label}
      </p>
      <ChoiceChips
        label={`Captura ${label.toLowerCase()}`}
        value={selectedId}
        onChange={onSelect}
        options={snapshots.map((snap) => ({ value: snap.id, label: formatWhen(snap.ts) }))}
      />
    </div>
  );
}
