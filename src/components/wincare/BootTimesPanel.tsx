import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Timer } from "lucide-react";

import { cn } from "@/lib/utils";
import { getNative } from "@/lib/wincare/bridge";
import { formatDecimal, plural } from "@/lib/wincare/format";
import { Panel, PanelHeader } from "./Panel";

type BootRecord = {
  ts: number;
  /** Do Windows começar a carregar até o login. */
  logonMs: number;
  /** Do login até os programas de inicialização terminarem de abrir. */
  readyMs: number | null;
};

export type BootTimes = {
  supported: boolean;
  boots: BootRecord[];
  lastChange?: { ts: number; action: string; subject: string | null } | null;
  comparison?: {
    beforeMs: number | null;
    afterMs: number | null;
    beforeCount: number;
    afterCount: number;
  } | null;
};

type BootBridge = { bootTimes?: () => Promise<BootTimes> };
const bridge = () => getNative() as (ReturnType<typeof getNative> & BootBridge) | null;

const DAY = 24 * 60 * 60 * 1000;

/** Dados de exemplo para o navegador (sem Electron). */
function demoBootTimes(now = Date.now()): BootTimes {
  const ready = [38, 41, 36, 44, 40, 71, 78, 69, 82, 75];
  const boots = ready.map((s, i) => ({
    ts: now - (i + 0.6) * DAY,
    logonMs: (11 + (i % 3)) * 1000,
    readyMs: s * 1000,
  }));
  const changeTs = now - 5.2 * DAY;
  return {
    supported: true,
    boots,
    lastChange: { ts: changeTs, action: "startup-disable", subject: "Steam" },
    comparison: { beforeMs: 75_000, afterMs: 39_800, beforeCount: 5, afterCount: 5 },
  };
}

const seconds = (ms: number) => `${formatDecimal(ms / 1000, ms < 10_000 ? 1 : 0)} s`;
const shortDate = (ts: number) =>
  new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/**
 * Tempo para ligar o PC (dos logs do Windows) e o efeito da última mudança na
 * inicialização: média dos boots antes × depois.
 */
export function BootTimesPanel() {
  const [data, setData] = useState<BootTimes | null>(null);

  useEffect(() => {
    let alive = true;
    const api = bridge();
    const load = api?.bootTimes
      ? api.bootTimes().catch(() => null)
      : Promise.resolve(api ? null : demoBootTimes());
    void load.then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);

  if (!data?.supported || data.boots.length === 0) return null;

  const boots = [...data.boots].slice(0, 10).reverse(); // mais antigo à esquerda
  const totals = boots.map((b) => b.logonMs + (b.readyMs ?? 0));
  const max = Math.max(...totals, 1);
  const latest = data.boots[0];
  const cmp = data.comparison;
  const changeTs = data.lastChange?.ts ?? null;
  const hasCompare = !!cmp && cmp.beforeMs !== null && cmp.afterMs !== null;
  const delta = hasCompare ? cmp.afterMs! - cmp.beforeMs! : 0;
  const better = delta < 0;

  return (
    <Panel data-wincare-boot-times>
      <PanelHeader
        icon={Timer}
        size="sm"
        title="Tempo para ligar o PC"
        description={
          <>
            Último boot: {seconds(latest.logonMs)} até o login
            {latest.readyMs !== null && (
              <> e mais {seconds(latest.readyMs)} até os programas de inicialização abrirem</>
            )}
            .
          </>
        }
      />

      {hasCompare ? (
        <div className="grid gap-3 @xl/main:grid-cols-3">
          <Stat label="Antes da última mudança" value={seconds(cmp.beforeMs!)} />
          <Stat label="Depois" value={seconds(cmp.afterMs!)} />
          <div
            className={cn(
              "flex flex-col justify-center rounded-2xl border p-4",
              better
                ? "border-success/30 bg-success/10 text-success"
                : "border-warning/30 bg-warning/10 text-warning",
            )}
          >
            <p className="flex items-center gap-1 text-lg font-semibold tabular-nums">
              {better ? <ArrowDownRight className="size-4" /> : <ArrowUpRight className="size-4" />}
              {seconds(Math.abs(delta))} {better ? "mais rápido" : "mais lento"}
            </p>
            <p className="text-xs text-foreground/70">
              Média de {plural(cmp.beforeCount, "boot", "boots")} antes ×{" "}
              {plural(cmp.afterCount, "boot", "boots")} depois
              {data.lastChange?.subject && <> (mudança: {data.lastChange.subject})</>}.
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {changeTs
            ? "Reinicie o PC algumas vezes para comparar o tempo antes e depois da sua última mudança."
            : "Desative um programa abaixo e reinicie: o WinCare mostra aqui quanto o PC ficou mais rápido."}
        </p>
      )}

      <div>
        <div
          className="flex h-28 items-end gap-1.5"
          role="img"
          aria-label={`Tempo dos últimos ${boots.length} boots, do mais antigo ao mais recente`}
        >
          {boots.map((b, i) => {
            const isChange =
              changeTs !== null && b.ts > changeTs && (i === 0 || boots[i - 1].ts <= changeTs);
            return (
              <div
                key={b.ts}
                className={cn(
                  "flex h-full flex-1 flex-col justify-end",
                  isChange && "border-l-2 border-dashed border-primary/60 pl-1",
                )}
                title={`${shortDate(b.ts)}: ${seconds(b.logonMs)} até o login${
                  b.readyMs !== null ? ` + ${seconds(b.readyMs)} de programas` : ""
                }`}
              >
                <div
                  className="rounded-t-md bg-primary"
                  style={{ height: `${((b.readyMs ?? 0) / max) * 100}%` }}
                />
                <div className="bg-primary/35" style={{ height: `${(b.logonMs / max) * 100}%` }} />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1.5 text-[10px] text-muted-foreground tabular-nums">
          {boots.map((b) => (
            <span key={b.ts} className="flex-1 truncate text-center">
              {shortDate(b.ts)}
            </span>
          ))}
        </div>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-primary/35" /> Até o login
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-primary" /> Programas de
            inicialização
          </span>
          {changeTs !== null && (
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-3 border-l-2 border-dashed border-primary/60" /> Sua
              última mudança
            </span>
          )}
        </p>
      </div>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
