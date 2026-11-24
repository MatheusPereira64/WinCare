import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  AppWindow,
  Bluetooth,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Gauge,
  HardDrive,
  Loader2,
  MemoryStick,
  Network,
  PlugZap,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Wifi,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getBackgroundState, onBackgroundChanged } from "@/lib/wincare/bridge";
import { formatDecimal, formatRate, plural } from "@/lib/wincare/format";
import { formatBytes } from "@/lib/wincare/report";
import {
  bluetoothState,
  cpuBreakdown,
  networkStatus,
  onPanelVisibility,
  panelExpand,
  panelOpenApp,
  speedTest,
  type BluetoothState,
  type CpuBreakdown,
  type NetworkStatus,
  type SpeedTestResult,
} from "@/lib/wincare/systemTools";
import type { BackgroundState } from "@/lib/wincare/types";
import { useHistory, usePolling } from "@/lib/wincare/useLive";
import { useDiskList, useSystemInfo } from "@/lib/wincare/useSystem";
import { AreaChart } from "./AreaChart";
import { ProcessList } from "./ProcessList";

type Detail = "cpu" | "network" | "disk" | "memory" | "bluetooth" | "monitor" | null;

/* ------------------------------ Dados ao vivo ------------------------------ */

interface BatteryInfo {
  level: number;
  charging: boolean;
}

/** Bateria pelo próprio Chromium (sem processo externo); desktop = sem bateria. */
function useBattery() {
  const [battery, setBattery] = useState<BatteryInfo | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        chargingTime: number;
        dischargingTime: number;
        addEventListener: (t: string, h: () => void) => void;
        removeEventListener: (t: string, h: () => void) => void;
      }>;
    };
    if (!nav.getBattery) return;
    let cleanup = () => undefined as void;
    void nav.getBattery().then((b) => {
      const update = () => {
        // Desktop sem bateria: Chromium informa 100% carregando e tempo infinito.
        const desktop =
          b.charging && b.level === 1 && b.chargingTime === 0 && b.dischargingTime === Infinity;
        setBattery(desktop ? null : { level: b.level, charging: b.charging });
      };
      update();
      b.addEventListener("levelchange", update);
      b.addEventListener("chargingchange", update);
      cleanup = () => {
        b.removeEventListener("levelchange", update);
        b.removeEventListener("chargingchange", update);
      };
    });
    return () => cleanup();
  }, []);
  return battery;
}

/* ------------------------------ Peças visuais ------------------------------ */

function Tile({
  icon: Icon,
  label,
  title,
  subtitle,
  active,
  onOpen,
  children,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  /** Nome para o leitor de tela (o título pode ter ícones). */
  label: string;
  title: ReactNode;
  subtitle?: ReactNode;
  active?: boolean;
  onOpen?: () => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[7.5rem] flex-col rounded-2xl border bg-card/80 p-3.5 shadow-sm transition-colors",
        active ? "border-primary/70 ring-2 ring-primary/25" : "border-border/60",
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-ring"
        aria-label={`Detalhes: ${label}`}
      />
      <div className="pointer-events-none flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" />
      </div>
      <div className="relative mt-auto pt-2">{children}</div>
    </div>
  );
}

function Bar({ value, tone = "bg-primary" }: { value: number; tone?: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
      <div
        className={cn("h-full rounded-full", tone)}
        style={{ width: `${Math.min(100, Math.max(2, value))}%` }}
      />
    </div>
  );
}

/** Anel compacto da saúde (o HealthRing grande não cabe no cabeçalho do painel). */
function MiniRing({ value }: { value: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const v = Math.min(100, Math.max(0, value));
  const tone = v >= 80 ? "var(--success)" : v >= 55 ? "var(--warning)" : "var(--destructive)";
  return (
    <div
      className="relative size-14 shrink-0"
      role="img"
      aria-label={`Saúde geral: ${Math.round(v)}%`}
    >
      <svg viewBox="0 0 48 48" className="size-14 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" stroke="var(--muted)" strokeWidth="5" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">
        {Math.round(v)}
      </span>
    </div>
  );
}

const healthLabel = (h: number) => (h >= 80 ? "Boa" : h >= 55 ? "Regular" : "Precisa de atenção");

/* ------------------------------ Painel ------------------------------ */

/**
 * Painel da bandeja: resumo ao vivo à direita e o detalhe do item escolhido
 * num segundo cartão à esquerda (a janela cresce para o lado).
 */
export function TrayPanel() {
  const [visible, setVisible] = useState(true);
  const [detail, setDetail] = useState<Detail>(null);
  const info = useSystemInfo(visible ? 2000 : 60_000);
  const { disks } = useDiskList();
  const battery = useBattery();
  const net = usePolling<NetworkStatus>(networkStatus, 2000, visible);
  const bt = usePolling<BluetoothState>(bluetoothState, 30_000, visible);
  const cpu = usePolling<CpuBreakdown>(cpuBreakdown, 2000, visible && detail === "cpu");
  const [bg, setBg] = useState<BackgroundState | null>(null);

  const cpuHistory = useHistory(info.cpuUsage);
  const downHistory = useHistory(net?.downBps ?? null);
  const upHistory = useHistory(net?.upBps ?? null);
  const userHistory = useHistory(cpu?.userPct);
  const sysHistory = useHistory(cpu?.systemPct);

  useEffect(() => onPanelVisibility(setVisible), []);
  useEffect(() => {
    void getBackgroundState().then(setBg);
    return onBackgroundChanged(setBg);
  }, []);

  // Fundo transparente: só os cartões aparecem sobre a área de trabalho.
  useEffect(() => {
    const root = document.documentElement;
    const prev = [root.style.background, document.body.style.background];
    root.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      root.style.background = prev[0];
      document.body.style.background = prev[1];
    };
  }, []);

  useEffect(() => {
    void panelExpand(detail !== null);
  }, [detail]);
  useEffect(() => {
    if (!visible) setDetail(null);
  }, [visible]);

  const toggle = (d: Exclude<Detail, null>) => setDetail((cur) => (cur === d ? null : d));
  const systemDisk = disks.find((d) => d.letter.startsWith("C")) ?? disks[0];
  const diskUsed = systemDisk
    ? ((systemDisk.totalGb - systemDisk.freeGb) / Math.max(1, systemDisk.totalGb)) * 100
    : 0;
  const alerts = bg?.monitor.active ?? [];
  const connected = bt?.devices.filter((d) => d.connected) ?? [];

  return (
    <div className="flex h-svh w-full items-stretch justify-end gap-3.5 p-0 text-foreground select-none">
      {detail && (
        <section
          aria-label="Detalhes"
          className="animate-fade-in flex w-[392px] min-w-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center gap-2 bg-gradient-to-b from-primary/15 to-transparent px-5 pt-5 pb-3">
            <button
              type="button"
              aria-label="Fechar detalhes"
              onClick={() => setDetail(null)}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronLeft className="size-4" />
            </button>
            <h2 className="text-lg font-semibold tracking-tight">
              {
                {
                  cpu: "Processador",
                  network: "Rede",
                  disk: "Armazenamento",
                  memory: "Memória",
                  bluetooth: "Dispositivos conectados",
                  monitor: "Monitoramento",
                }[detail]
              }
            </h2>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
            {detail === "cpu" && (
              <CpuDetail
                cpu={cpu}
                userHistory={userHistory}
                sysHistory={sysHistory}
                uptime={info.uptime}
                temperature={info.cpuTemperature ?? null}
              />
            )}
            {detail === "network" && (
              <NetworkDetail net={net} downHistory={downHistory} upHistory={upHistory} />
            )}
            {detail === "disk" && (
              <div className="space-y-2.5">
                {disks.map((d) => {
                  const used = ((d.totalGb - d.freeGb) / Math.max(1, d.totalGb)) * 100;
                  return (
                    <div
                      key={d.letter}
                      className="rounded-2xl border border-border/60 bg-card/80 p-3.5"
                    >
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">{d.letter}</span>
                        <span className="text-muted-foreground">
                          {d.type} · SMART {d.smart}
                        </span>
                      </div>
                      <p className="mb-2 text-xs text-muted-foreground">
                        {d.freeGb} GB livres de {d.totalGb} GB
                      </p>
                      <Bar
                        value={used}
                        tone={
                          used >= 90 ? "bg-destructive" : used >= 75 ? "bg-warning" : "bg-primary"
                        }
                      />
                    </div>
                  );
                })}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => void panelOpenApp("/limpeza")}
                  >
                    Liberar espaço
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => void panelOpenApp("/disco")}
                  >
                    Mapa do disco
                  </Button>
                </div>
              </div>
            )}
            {detail === "memory" && (
              <>
                <div className="rounded-2xl border border-border/60 bg-card/80 p-3.5">
                  <p className="text-3xl font-semibold tabular-nums">
                    {Math.round(info.memoryUsage)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {info.memoryUsedGb ? `${formatDecimal(info.memoryUsedGb, 1)} GB de ` : ""}
                    {formatDecimal(info.memoryTotalGb, 0)} GB em uso
                  </p>
                </div>
                <h3 className="text-sm font-semibold">Maiores consumidores</h3>
                <ProcessList compact limit={8} refreshMs={4000} />
              </>
            )}
            {detail === "bluetooth" && (
              <ul className="space-y-2">
                {!bt?.available && (
                  <p className="text-sm text-muted-foreground">Este PC não tem Bluetooth ligado.</p>
                )}
                {bt?.devices.map((d) => (
                  <li
                    key={d.name}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-card/80 px-3 py-2.5 text-sm"
                  >
                    <span className="truncate">{d.name}</span>
                    <span
                      className={cn(
                        "text-xs",
                        d.connected ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      {d.connected ? "Conectado" : "Pareado"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {detail === "monitor" && (
              <div className="space-y-2.5">
                {alerts.length === 0 ? (
                  <p className="rounded-2xl border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
                    Nenhum problema agora.
                  </p>
                ) : (
                  alerts.map((a) => (
                    <button
                      key={a.type}
                      type="button"
                      onClick={() => void panelOpenApp(a.route)}
                      className="block w-full rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-left"
                    >
                      <p className="text-sm font-semibold">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.body}</p>
                    </button>
                  ))
                )}
                {bg &&
                  Object.entries(bg.monitor.checks).map(([type, check]) =>
                    check ? (
                      <p key={type} className="text-xs text-muted-foreground">
                        • {check.summary}
                      </p>
                    ) : null,
                  )}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => void panelOpenApp("/configuracoes")}
                >
                  Configurar alertas
                </Button>
              </div>
            )}
          </div>
        </section>
      )}

      <section
        aria-label="Resumo do PC"
        className="flex w-[392px] shrink-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl"
      >
        <header className="flex items-start justify-between gap-3 bg-gradient-to-b from-primary/20 via-primary/5 to-transparent px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">
              Saúde do PC: <span className="text-primary">{healthLabel(info.health)}</span>
            </h1>
            <p className="truncate text-sm text-muted-foreground">{info.hostname}</p>
          </div>
          <MiniRing value={info.health} />
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
          <button
            type="button"
            onClick={() => toggle("monitor")}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl border bg-card/80 px-3.5 py-3 text-left shadow-sm focus-visible:outline-2 focus-visible:outline-ring",
              detail === "monitor" ? "border-primary/70" : "border-border/60",
            )}
          >
            {alerts.length ? (
              <ShieldAlert className="size-5 shrink-0 text-warning" />
            ) : (
              <ShieldCheck className="size-5 shrink-0 text-primary" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                {bg?.monitor.enabled === false
                  ? "Monitoramento desligado"
                  : alerts.length
                    ? plural(alerts.length, "alerta ativo", "alertas ativos")
                    : "Monitoramento ativo"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {alerts[0]?.short ??
                  "Avisa quando um disco crescer mais de 1 GB ou um programa novo for instalado"}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" />
          </button>

          <div className="grid grid-cols-2 gap-3">
            <Tile
              icon={HardDrive}
              label="Disco"
              title={systemDisk ? `${systemDisk.letter.replace(/:?$/, ":")}\\` : "Disco"}
              subtitle={systemDisk ? `Livres: ${systemDisk.freeGb} GB` : "Lendo…"}
              active={detail === "disk"}
              onOpen={() => toggle("disk")}
            >
              <Bar
                value={diskUsed}
                tone={
                  diskUsed >= 90 ? "bg-destructive" : diskUsed >= 75 ? "bg-warning" : "bg-primary"
                }
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className="relative z-10 text-xs font-semibold text-primary hover:underline"
                  onClick={() => void panelOpenApp("/limpeza")}
                >
                  Liberar
                </button>
              </div>
            </Tile>
            <Tile
              icon={MemoryStick}
              label="Memória"
              title="Memória"
              subtitle={`Pressão: ${Math.round(info.memoryUsage)}%`}
              active={detail === "memory"}
              onOpen={() => toggle("memory")}
            >
              <Bar
                value={info.memoryUsage}
                tone={info.memoryUsage >= 90 ? "bg-destructive" : "bg-chart-3"}
              />
              <p className="mt-2 text-right text-xs text-muted-foreground">
                {info.memoryUsedGb ? `${formatDecimal(info.memoryUsedGb, 1)} de ` : ""}
                {formatDecimal(info.memoryTotalGb, 0)} GB
              </p>
            </Tile>
            <Tile
              icon={PlugZap}
              label="Energia"
              title="Energia"
              subtitle={
                battery
                  ? `${Math.round(battery.level * 100)}% · ${battery.charging ? "carregando" : "na bateria"}`
                  : "Na tomada"
              }
              onOpen={() => void panelOpenApp("/sistema")}
            >
              {battery && (
                <Bar
                  value={battery.level * 100}
                  tone={battery.level < 0.2 ? "bg-destructive" : "bg-success"}
                />
              )}
            </Tile>
            <Tile
              icon={Cpu}
              label="Processador"
              title={
                <span className="flex items-center justify-between gap-1">
                  CPU
                  {typeof info.cpuTemperature === "number" && (
                    <span className="flex items-center text-xs font-semibold text-primary">
                      <Thermometer className="size-3" />
                      {Math.round(info.cpuTemperature)}°C
                    </span>
                  )}
                </span>
              }
              subtitle={`Carga: ${Math.round(info.cpuUsage)}%`}
              active={detail === "cpu"}
              onOpen={() => toggle("cpu")}
            >
              <AreaChart
                series={[{ values: cpuHistory, className: "text-primary" }]}
                className="h-9"
              />
            </Tile>
            <Tile
              icon={net?.adapter.kind === "wifi" ? Wifi : Network}
              label="Rede"
              title="Rede"
              subtitle={net?.adapter.kind === "wifi" ? (net.adapter.ssid ?? "Wi-Fi") : "Cabo"}
              active={detail === "network"}
              onOpen={() => toggle("network")}
            >
              <p className="text-xs tabular-nums">
                <span className="text-success">↓ {formatRate(net?.downBps)}</span>
                <span className="ml-2 text-primary">↑ {formatRate(net?.upBps)}</span>
              </p>
              <AreaChart
                series={[
                  { values: downHistory, className: "text-success" },
                  { values: upHistory, className: "text-primary" },
                ]}
                max={1}
                className="mt-1 h-8"
              />
            </Tile>
            <Tile
              icon={Bluetooth}
              label="Dispositivos Bluetooth"
              title="Dispositivos"
              subtitle={
                !bt
                  ? "Lendo…"
                  : connected.length
                    ? plural(connected.length, "conectado", "conectados")
                    : "Nenhum dispositivo Bluetooth"
              }
              active={detail === "bluetooth"}
              onOpen={() => toggle("bluetooth")}
            >
              {connected.length > 0 && (
                <p className="truncate text-xs text-muted-foreground">
                  {connected.map((d) => d.name).join(", ")}
                </p>
              )}
            </Tile>
          </div>

          <Recommendation diskUsed={diskUsed} memory={info.memoryUsage} alerts={alerts.length} />
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
          <Button
            size="icon"
            variant="ghost"
            className="rounded-xl"
            aria-label="Monitoramento"
            title="Monitoramento"
            onClick={() => void panelOpenApp("/monitoramento")}
          >
            <Gauge />
          </Button>
          <Button
            variant="ghost"
            className="flex-1 rounded-xl font-semibold"
            onClick={() => void panelOpenApp("/")}
          >
            <AppWindow /> Abrir WinCare
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="rounded-xl"
            aria-label="Configurações"
            title="Configurações"
            onClick={() => void panelOpenApp("/configuracoes")}
          >
            <Settings />
          </Button>
        </footer>
      </section>
    </div>
  );
}

/* ------------------------------ Detalhes ------------------------------ */

function CpuDetail({
  cpu,
  userHistory,
  sysHistory,
  uptime,
  temperature,
}: {
  cpu: CpuBreakdown | null;
  userHistory: number[];
  sysHistory: number[];
  uptime: string;
  temperature: number | null;
}) {
  return (
    <>
      <div className="grid grid-cols-[1fr_auto] gap-4">
        <AreaChart
          series={[
            { values: userHistory, className: "text-success" },
            { values: sysHistory, className: "text-primary" },
          ]}
          max={40}
          className="h-36 rounded-xl border border-border/60 bg-card/60"
        />
        <dl className="space-y-2 text-sm">
          <div className="border-l-2 border-muted-foreground/40 pl-2">
            <dt className="text-xs text-muted-foreground">Livre</dt>
            <dd className="text-lg font-semibold tabular-nums">{cpu?.idlePct ?? "—"}%</dd>
          </div>
          <div className="border-l-2 border-success pl-2">
            <dt className="text-xs text-muted-foreground">Usuário</dt>
            <dd className="text-lg font-semibold tabular-nums">{cpu?.userPct ?? "—"}%</dd>
          </div>
          <div className="border-l-2 border-primary pl-2">
            <dt className="text-xs text-muted-foreground">Sistema</dt>
            <dd className="text-lg font-semibold tabular-nums">{cpu?.systemPct ?? "—"}%</dd>
          </div>
        </dl>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border/60 bg-card/80 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Clock className="size-4 text-muted-foreground" /> Ligado há
          </p>
          <p className="mt-1 text-sm">{uptime || "—"}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/80 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Thermometer className="size-4 text-muted-foreground" /> Temperatura
          </p>
          <p className="mt-1 text-sm">
            {temperature === null
              ? "Sem sensor"
              : `${Math.round(temperature)} °C · ${temperature >= 85 ? "alta" : "normal"}`}
          </p>
        </div>
      </div>
      <h3 className="text-sm font-semibold">Maiores consumidores</h3>
      <ProcessList compact limit={6} refreshMs={3000} />
    </>
  );
}

function NetworkDetail({
  net,
  downHistory,
  upHistory,
}: {
  net: NetworkStatus | null;
  downHistory: number[];
  upHistory: number[];
}) {
  const [test, setTest] = useState<SpeedTestResult | null>(null);
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    try {
      setTest(await speedTest());
    } finally {
      setRunning(false);
    }
  };
  const adapter = net?.adapter;
  const max = useMemo(() => Math.max(1, ...downHistory, ...upHistory), [downHistory, upHistory]);
  return (
    <>
      <div className="rounded-2xl border border-border/60 bg-card/80 p-3.5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {adapter?.kind === "wifi" ? <Wifi className="size-4" /> : <Network className="size-4" />}
          {adapter?.kind === "wifi"
            ? `Wi-Fi${adapter.ssid ? ` · ${adapter.ssid}` : ""}`
            : adapter?.connected
              ? "Conexão cabeada"
              : "Sem conexão"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {adapter?.kind === "ethernet"
            ? "Conectado por cabo: o tráfego até o roteador não passa pelo ar."
            : adapter?.kind === "wifi"
              ? "Conectado sem fio. Paredes e distância do roteador afetam a velocidade."
              : "Nenhum adaptador de rede ativo."}
        </p>
        {adapter?.ip && (
          <p className="mt-2 text-xs text-muted-foreground">
            IP {adapter.ip}
            {adapter.linkSpeed ? ` · link ${adapter.linkSpeed}` : ""}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          {
            label: "Download",
            total: net?.totalReceived,
            rate: net?.downBps,
            values: downHistory,
            cls: "text-success",
          },
          {
            label: "Upload",
            total: net?.totalSent,
            rate: net?.upBps,
            values: upHistory,
            cls: "text-primary",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/60 bg-card/80 p-3">
            <p className="text-sm font-semibold">{s.label}</p>
            <p className="flex justify-between text-xs text-muted-foreground">
              <span>{s.total ? formatBytes(s.total) : "—"}</span>
              <span>{formatRate(s.rate)}</span>
            </p>
            <AreaChart
              series={[{ values: s.values, className: s.cls }]}
              max={max}
              className="mt-2 h-12"
            />
          </div>
        ))}
      </div>
      <h3 className="text-sm font-semibold">Teste a sua conexão</h3>
      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="relative flex size-32 shrink-0 flex-col items-center justify-center rounded-full border-[10px] border-primary/20 bg-card text-center focus-visible:outline-2 focus-visible:outline-ring"
        >
          {running ? (
            <Loader2 className="size-7 animate-spin text-primary" />
          ) : test?.ok ? (
            <>
              <span className="text-3xl font-semibold tabular-nums">
                {Math.round(test.downloadMbps ?? 0)}
              </span>
              <span className="text-[11px] text-muted-foreground">Mbps · testar de novo</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-primary">Iniciar teste</span>
          )}
        </button>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Latência</dt>
            <dd className="font-semibold">{test?.ok ? `${test.latencyMs} ms` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Download</dt>
            <dd className="font-semibold">{test?.ok ? `${test.downloadMbps} Mbps` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Upload</dt>
            <dd className="font-semibold">{test?.ok ? `${test.uploadMbps} Mbps` : "—"}</dd>
          </div>
        </dl>
      </div>
      {test && !test.ok && <p className="text-xs text-destructive">{test.reason}</p>}
      <p className="text-[11px] text-muted-foreground">
        Servidor Cloudflare. Usa cerca de 33 MB de dados.
      </p>
    </>
  );
}

/** Uma sugestão por vez, escolhida pelo que está acontecendo agora. */
function Recommendation({
  diskUsed,
  memory,
  alerts,
}: {
  diskUsed: number;
  memory: number;
  alerts: number;
}) {
  const rec =
    alerts > 0
      ? {
          title: "Há alertas ativos",
          text: "Veja o que precisa de atenção agora.",
          action: "Ver alertas",
          to: "/",
        }
      : diskUsed >= 80
        ? {
            title: "Disco ficando cheio",
            text: "Veja no mapa do disco o que mais ocupa espaço.",
            action: "Abrir mapa",
            to: "/disco",
          }
        : memory >= 85
          ? {
              title: "Memória no limite",
              text: "Feche ou encerre apps que estão pesando.",
              action: "Ver processos",
              to: "/monitoramento",
            }
          : {
              title: "Apps esquecidos",
              text: "Descubra programas que você não abre há meses e quanto espaço liberam.",
              action: "Ver apps",
              to: "/programas",
            };
  return (
    <div className="space-y-2">
      <h2 className="px-1 text-sm font-semibold text-muted-foreground">Recomendação de agora</h2>
      <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/80 p-3.5 shadow-sm">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-solid text-primary-foreground">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{rec.title}</p>
          <p className="text-xs text-muted-foreground">{rec.text}</p>
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => void panelOpenApp(rec.to)}>
              {rec.action}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
