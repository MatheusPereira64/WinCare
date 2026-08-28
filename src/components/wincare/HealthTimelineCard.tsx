import { useMemo, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/wincare/Sparkline";
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
    <Card className="surface-panel gap-4 border-border/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Linha do tempo da saúde</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Amostras a cada ~10 min enquanto o WinCare está aberto.
            {last ? ` Última: ${formatWhen(last.ts)}.` : ""}
          </p>
        </div>
        {last && (
          <p className="text-sm tabular-nums text-muted-foreground">
            Saúde {last.health}%{" "}
            <span className={delta >= 0 ? "text-success" : "text-destructive"}>
              {delta >= 0 ? "+" : ""}
              {delta} vs início
            </span>
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Meter label="Saúde" values={health} suffix="%" />
        <Meter label="CPU" values={cpu} suffix="%" />
        <Meter label="RAM" values={ram} suffix="%" />
      </div>
    </Card>
  );
}

function Meter({ label, values, suffix }: { label: string; values: number[]; suffix: string }) {
  const current = values[values.length - 1];
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums">
          {typeof current === "number" ? `${current}${suffix}` : "—"}
        </p>
      </div>
      <div className="mt-2 text-primary">
        <Sparkline values={values} />
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
    toast.success("Snapshot salvo", { description: snap.label });
  };

  return (
    <Card className="surface-panel gap-4 border-border/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Antes e depois</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Capture o estado do PC, faça uma limpeza ou mude o boot e compare os números.
          </p>
        </div>
        <Button type="button" className="rounded-full" onClick={capture} disabled={info.hostname === "…"}>
          <Camera /> Capturar agora
        </Button>
      </div>

      {snapshots.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum snapshot ainda. Capture o estado atual.</p>
      )}

      {snapshots.length > 0 && (
        <ul className="divide-y divide-border/40">
          {snapshots.slice(0, 6).map((snap) => (
            <li key={snap.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{snap.label}</p>
                <p className="text-xs text-muted-foreground">
                  Saúde {snap.health}% · RAM {snap.ram}% · {snap.startupEnabled} no boot
                </p>
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={() => intelActions.removeSnapshot(snap.id)}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {snapshots.length >= 2 && left && right && (
        <div className="space-y-3 border-t border-border/40 pt-3">
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
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className="tabular-nums">
                  {row.before} → {row.after}{" "}
                  {row.delta != null && row.delta !== 0 && (
                    <span
                      className={
                        row.tone === "up" ? "text-success" : row.tone === "down" ? "text-destructive" : ""
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
    </Card>
  );
}

/** Botões no lugar de &lt;select&gt; — nativo no Electron trava a UI ao montar a aba. */
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
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {snapshots.map((s) => (
          <Button
            key={`${label}-${s.id}`}
            type="button"
            size="sm"
            variant={s.id === selectedId ? "default" : "outline"}
            className="h-8 rounded-full px-2.5 text-[11px]"
            onClick={() => onSelect(s.id)}
          >
            {formatWhen(s.ts)}
          </Button>
        ))}
      </div>
    </div>
  );
}
