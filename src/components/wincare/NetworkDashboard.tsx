import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Cable, Gauge, Loader2, Network, Wifi, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatAge, formatRate } from "@/lib/wincare/format";
import { formatBytes } from "@/lib/wincare/report";
import {
  networkStatus,
  speedTest,
  type NetworkStatus,
  type SpeedTestResult,
} from "@/lib/wincare/systemTools";
import { useHistory, usePolling } from "@/lib/wincare/useLive";
import { AreaChart } from "./AreaChart";
import { Panel } from "./Panel";

const HISTORY_KEY = "wincare:speed-tests";
const MAX_HISTORY = 8;

interface SavedTest {
  at: number;
  latencyMs: number;
  downloadMbps: number;
  uploadMbps: number;
}

function loadHistory(): SavedTest[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(raw)
      ? raw.filter((t) => typeof t?.downloadMbps === "number").slice(-MAX_HISTORY)
      : [];
  } catch {
    return [];
  }
}

function saveHistory(list: SavedTest[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-MAX_HISTORY)));
  } catch {
    /* armazenamento indisponível: o histórico só não persiste */
  }
}

/** Anel do velocímetro: escala logarítmica (10 Mbps a 1 Gbps ocupam o anel todo). */
const ringFraction = (mbps: number) =>
  Math.max(0.02, Math.min(1, Math.log10(Math.max(1, mbps)) / 3));

/**
 * Rede em dashboard: tipo de conexão, tráfego ao vivo (download e upload com
 * total desde que o PC ligou) e teste de velocidade com comparativo dos
 * últimos testes.
 */
export function NetworkDashboard() {
  const net = usePolling<NetworkStatus>(networkStatus, 2000);
  const down = useHistory(net?.downBps ?? null, 40);
  const up = useHistory(net?.upBps ?? null, 40);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<SpeedTestResult | null>(null);
  const [history, setHistory] = useState<SavedTest[]>([]);

  useEffect(() => setHistory(loadHistory()), []);

  const run = async () => {
    setRunning(true);
    try {
      const out = await speedTest();
      setLast(out);
      if (out.ok && out.downloadMbps !== undefined) {
        const next = [
          ...history,
          {
            at: out.at ?? Date.now(),
            latencyMs: out.latencyMs ?? 0,
            downloadMbps: out.downloadMbps,
            uploadMbps: out.uploadMbps ?? 0,
          },
        ].slice(-MAX_HISTORY);
        setHistory(next);
        saveHistory(next);
      }
    } finally {
      setRunning(false);
    }
  };

  const shown = last?.ok
    ? last
    : history.length
      ? { ok: true, ...history[history.length - 1] }
      : null;
  const adapter = net?.adapter;
  const ConnIcon = !adapter?.connected ? WifiOff : adapter.kind === "wifi" ? Wifi : Cable;
  const peak = useMemo(() => Math.max(64 * 1024, ...down, ...up), [down, up]);
  const maxTest = Math.max(1, ...history.map((t) => t.downloadMbps));

  return (
    <Panel variant="hero" padding="lg" className="gap-5">
      <div className="flex items-center gap-3">
        <Network aria-hidden className="size-6 text-primary" />
        <h2 className="text-xl font-semibold tracking-tight">Rede</h2>
      </div>

      <div className="grid gap-5 @5xl/main:grid-cols-2">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
            <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
              <ConnIcon aria-hidden className="size-6 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{adapter?.name || "Rede"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {!adapter
                    ? "Lendo a conexão…"
                    : !adapter.connected
                      ? "Sem conexão"
                      : adapter.kind === "wifi"
                        ? `Wi-Fi${adapter.ssid ? ` · ${adapter.ssid}` : ""}`
                        : "Conexão cabeada"}
                </p>
              </div>
            </div>
            <div className="space-y-2 px-4 py-3 text-sm text-muted-foreground">
              <p>
                {adapter?.kind === "ethernet"
                  ? "Conectado por cabo: o tráfego até o roteador não passa pelo ar."
                  : adapter?.kind === "wifi"
                    ? "Conectado sem fio: paredes e distância do roteador afetam a velocidade."
                    : "Nenhum adaptador de rede ativo."}
              </p>
              <p className="text-xs">
                {[
                  adapter?.ip && `IP ${adapter.ip}`,
                  adapter?.linkSpeed && `link de ${adapter.linkSpeed}`,
                  adapter?.description,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>

          <div className="grid gap-3 @md/main:grid-cols-2">
            <TrafficCard
              label="Download"
              icon={ArrowDown}
              total={net?.totalReceived ?? null}
              rate={net?.downBps ?? null}
              values={down}
              peak={peak}
              tone="text-success"
            />
            <TrafficCard
              label="Upload"
              icon={ArrowUp}
              total={net?.totalSent ?? null}
              rate={net?.upBps ?? null}
              values={up}
              peak={peak}
              tone="text-chart-3"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Totais desde que o PC ligou. Velocidade atual medida a cada 2 segundos.
          </p>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold tracking-tight">Teste a sua conexão</h3>
          <div className="flex flex-wrap items-center gap-6">
            <SpeedRing
              mbps={shown?.downloadMbps ?? 0}
              running={running}
              hasResult={!!shown}
              onRun={() => void run()}
            />
            <dl className="grid gap-3 text-sm">
              <Metric label="Latência" value={shown ? `${shown.latencyMs} ms` : "—"} />
              <Metric label="Download" value={shown ? `${shown.downloadMbps} Mbps` : "—"} />
              <Metric label="Upload" value={shown ? `${shown.uploadMbps} Mbps` : "—"} />
            </dl>
          </div>
          {last && !last.ok && <p className="text-sm text-destructive">{last.reason}</p>}

          <div className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Comparativo dos últimos testes</p>
              <span className="text-xs text-muted-foreground">Download (Mbps)</span>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Faça um teste: os próximos aparecem aqui para comparar horários e dias.
              </p>
            ) : (
              <ul
                className="flex h-36 items-end gap-2"
                aria-label="Velocidade de download dos últimos testes"
              >
                {history.map((t) => (
                  <li key={t.at} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <span className="text-[11px] font-semibold tabular-nums">
                      {Math.round(t.downloadMbps)}
                    </span>
                    <span
                      className="w-full max-w-10 rounded-t-md bg-gradient-to-t from-primary-solid to-primary-glow"
                      style={{ height: `${Math.max(6, (t.downloadMbps / maxTest) * 88)}px` }}
                      aria-hidden
                    />
                    <span className="sr-only">
                      {Math.round(t.downloadMbps)} Mbps de download, {Math.round(t.uploadMbps)} de
                      upload, {formatAge(t.at)}
                    </span>
                    <span
                      aria-hidden
                      className="w-full truncate text-center text-[10px] text-muted-foreground"
                    >
                      {new Date(t.at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Servidor Cloudflare. Cada teste usa cerca de 33 MB de dados.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function TrafficCard({
  label,
  icon: Icon,
  total,
  rate,
  values,
  peak,
  tone,
}: {
  label: string;
  icon: typeof ArrowDown;
  total: number | null;
  rate: number | null;
  values: number[];
  peak: number;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon aria-hidden className={cn("size-4", tone)} /> {label}
      </p>
      <p className="mt-0.5 flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{total === null ? "—" : formatBytes(total)}</span>
        <span className="font-semibold text-foreground">{formatRate(rate)}</span>
      </p>
      <AreaChart
        series={[{ values, className: tone }]}
        max={peak}
        grid={false}
        className="mt-3 h-20"
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function SpeedRing({
  mbps,
  running,
  hasResult,
  onRun,
}: {
  mbps: number;
  running: boolean;
  hasResult: boolean;
  onRun: () => void;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const fraction = hasResult ? ringFraction(mbps) : 0;
  return (
    <div className="relative size-40 shrink-0">
      <svg viewBox="0 0 120 120" className="size-40 -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--muted)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - fraction * c}
          className="transition-[stroke-dashoffset] duration-1000"
        />
      </svg>
      <Button
        type="button"
        variant="ghost"
        onClick={onRun}
        disabled={running}
        className="absolute inset-4 flex h-auto flex-col gap-0 rounded-full bg-card/80 shadow-inner hover:bg-card"
      >
        {running ? (
          <>
            <Loader2 className="size-7 animate-spin text-primary" />
            <span className="mt-1 text-[11px] text-muted-foreground">Testando…</span>
          </>
        ) : hasResult ? (
          <>
            <span className="text-3xl font-semibold tabular-nums">{Math.round(mbps)}</span>
            <span className="text-[11px] font-normal text-muted-foreground">
              Mbps · testar de novo
            </span>
          </>
        ) : (
          <>
            <Gauge className="size-6 text-primary" />
            <span className="mt-1 text-sm font-semibold text-primary">Iniciar teste</span>
          </>
        )}
      </Button>
    </div>
  );
}
