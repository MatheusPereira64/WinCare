import { createFileRoute } from "@tanstack/react-router";
import { Activity, Cpu, HardDrive, MemoryStick, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppScrollArea } from "@/components/wincare/AppScrollArea";
import { getNative, isNative } from "@/lib/wincare/bridge";
import type { TopProcess } from "@/lib/wincare/types";
import { useDisks, useSystemInfo } from "@/lib/wincare/useSystem";

export const Route = createFileRoute("/monitoramento")({
  head: () => ({
    meta: [
      { title: "Monitoramento de CPU e memória | WinCare" },
      {
        name: "description",
        content:
          "Dashboards em tempo real de CPU, memória, disco e processos no Windows.",
      },
      { property: "og:title", content: "Monitoramento de CPU e memória | WinCare" },
      {
        property: "og:description",
        content: "Acompanhe o desempenho do computador em tempo real.",
      },
    ],
  }),
  component: MonitorPage,
});

interface Point {
  t: string;
  cpu: number;
  mem: number;
}

const SIM_PROCESSES: TopProcess[] = [
  { name: "chrome", pid: 1204, cpu: 42.1, memMb: 890 },
  { name: "Code", pid: 3301, cpu: 18.4, memMb: 612 },
  { name: "explorer", pid: 980, cpu: 3.2, memMb: 210 },
  { name: "WinCare", pid: 4412, cpu: 2.1, memMb: 168 },
];

function chartTheme(overrides: ApexOptions = {}): ApexOptions {
  // Defaults por último nas chaves aninhadas — evita que `...overrides` no fim
  // apague toolbar:false e outros defaults (bug que deixava o zoom do ApexCharts aparecer).
  return {
    ...overrides,
    chart: {
      background: "transparent",
      animations: { enabled: true, speed: 400 },
      fontFamily: "inherit",
      ...overrides.chart,
      toolbar: { show: false, ...overrides.chart?.toolbar },
      zoom: { enabled: false, ...overrides.chart?.zoom },
    },
    theme: { mode: "dark", ...overrides.theme },
    grid: {
      borderColor: "rgba(148, 163, 184, 0.18)",
      strokeDashArray: 4,
      ...overrides.grid,
    },
    dataLabels: { enabled: false, ...overrides.dataLabels },
    stroke: { curve: "smooth", width: 2, ...overrides.stroke },
    tooltip: {
      theme: "dark",
      ...overrides.tooltip,
    },
    legend: {
      labels: { colors: "#94a3b8" },
      ...overrides.legend,
    },
  };
}

function MonitorPage() {
  const info = useSystemInfo(2000);
  const disks = useDisks();
  const nativeMode = isNative();
  const [data, setData] = useState<Point[]>([]);
  const [processes, setProcesses] = useState<TopProcess[]>(SIM_PROCESSES);
  const [procLoading, setProcLoading] = useState(false);

  useEffect(() => {
    setData((prev) =>
      [
        ...prev,
        {
          t: new Date().toLocaleTimeString("pt-BR", { minute: "2-digit", second: "2-digit" }),
          cpu: info.cpuUsage,
          mem: info.memoryUsage,
        },
      ].slice(-40),
    );
  }, [info]);

  const refreshProcesses = async () => {
    setProcLoading(true);
    try {
      const native = getNative();
      if (native?.topProcesses) {
        const list = await native.topProcesses();
        setProcesses(Array.isArray(list) && list.length ? list : SIM_PROCESSES);
      } else {
        setProcesses(SIM_PROCESSES);
      }
    } catch {
      setProcesses(SIM_PROCESSES);
    } finally {
      setProcLoading(false);
    }
  };

  useEffect(() => {
    void refreshProcesses();
    const id = setInterval(() => void refreshProcesses(), 8000);
    return () => clearInterval(id);
  }, []);

  const categories = useMemo(() => data.map((d) => d.t), [data]);
  const cpuSeries = useMemo(() => [{ name: "CPU %", data: data.map((d) => d.cpu) }], [data]);
  const memSeries = useMemo(() => [{ name: "Memória %", data: data.map((d) => d.mem) }], [data]);

  const radialOptions = useMemo(
    () =>
      chartTheme({
        chart: { type: "radialBar" },
        plotOptions: {
          radialBar: {
            hollow: { size: "42%" },
            track: { background: "rgba(148,163,184,0.12)", margin: 6 },
            dataLabels: {
              name: { show: true, color: "#94a3b8", fontSize: "12px", offsetY: -8 },
              value: {
                show: true,
                color: "#e2e8f0",
                fontSize: "20px",
                fontWeight: 600,
                offsetY: 2,
                formatter: (val) => `${Math.round(Number(val))}%`,
              },
              total: {
                show: true,
                label: "Saúde",
                color: "#94a3b8",
                fontSize: "12px",
                formatter: () => `${Math.round(info.health)}`,
              },
            },
          },
        },
        labels: ["CPU", "RAM", "Disco"],
        colors: ["#548dfc", "#43c6f5", "#a78bfa"],
        legend: { show: false },
      }),
    [info.health],
  );

  const areaCpuOptions = useMemo(
    () =>
      chartTheme({
        chart: { type: "area", sparkline: { enabled: false } },
        colors: ["#548dfc"],
        fill: {
          type: "gradient",
          gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05 },
        },
        xaxis: {
          categories,
          labels: { style: { colors: "#64748b", fontSize: "10px" }, rotate: 0, hideOverlappingLabels: true },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: {
          min: 0,
          max: 100,
          labels: { style: { colors: "#64748b", fontSize: "11px" }, formatter: (v) => `${v}%` },
        },
      }),
    [categories],
  );

  const areaMemOptions = useMemo(
    () =>
      chartTheme({
        chart: { type: "area" },
        colors: ["#43c6f5"],
        fill: {
          type: "gradient",
          gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 },
        },
        xaxis: {
          categories,
          labels: { style: { colors: "#64748b", fontSize: "10px" }, rotate: 0, hideOverlappingLabels: true },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: {
          min: 0,
          max: 100,
          labels: { style: { colors: "#64748b", fontSize: "11px" }, formatter: (v) => `${v}%` },
        },
      }),
    [categories],
  );

  const diskBarOptions = useMemo(
    () =>
      chartTheme({
        chart: { type: "bar", stacked: false },
        plotOptions: { bar: { borderRadius: 6, horizontal: true, barHeight: "55%" } },
        colors: ["#fbbf24", "#2e3650"],
        xaxis: {
          categories: disks.map((d) => d.letter),
          max: 100,
          labels: { style: { colors: "#64748b" }, formatter: (v) => `${v}%` },
        },
        yaxis: { labels: { style: { colors: "#94a3b8" } } },
        legend: { show: true },
      }),
    [disks],
  );

  const diskBarSeries = useMemo(() => {
    const used = disks.map((d) =>
      d.totalGb > 0 ? Math.round(((d.totalGb - d.freeGb) / d.totalGb) * 100) : 0,
    );
    const free = used.map((u) => Math.max(0, 100 - u));
    return [
      { name: "Usado %", data: used },
      { name: "Livre %", data: free },
    ];
  }, [disks]);

  const maxProcessMem = useMemo(
    () => Math.max(1, ...processes.map((p) => p.memMb)),
    [processes],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="size-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Monitoramento</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Painéis em tempo real — CPU, memória, discos e processos.
            {!nativeMode && " Modo demonstração."}
          </p>
        </div>
        <LiveBadge />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={Cpu}
          label="CPU"
          value={`${info.cpuUsage}%`}
          hint={info.osName || "Processador"}
        />
        <MetricTile
          icon={MemoryStick}
          label="Memória"
          value={`${info.memoryUsage}%`}
          hint={`${info.memoryTotalGb} GB total`}
        />
        <MetricTile
          icon={HardDrive}
          label="Disco C:"
          value={`${info.diskUsage}%`}
          hint={`${info.diskTotalGb} GB total`}
        />
        <MetricTile
          icon={Activity}
          label="Saúde"
          value={`${info.health}`}
          hint={`Uptime ${info.uptime}`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <Card className="surface-panel border-border/50 p-4">
          <p className="mb-1 text-sm font-medium">Visão geral</p>
          <p className="mb-2 text-xs text-muted-foreground">Uso atual dos principais recursos</p>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <Chart
                type="radialBar"
                height={230}
                options={radialOptions}
                series={[info.cpuUsage, info.memoryUsage, info.diskUsage]}
              />
            </div>
            <ul className="flex w-full shrink-0 flex-col gap-2.5 sm:w-[132px]">
              <OverviewLegend
                color="#548dfc"
                label="CPU"
                value={`${info.cpuUsage}%`}
                hint={
                  typeof info.cpuTemperature === "number"
                    ? `${info.cpuTemperature} °C`
                    : "Processador"
                }
              />
              <OverviewLegend
                color="#43c6f5"
                label="Memória"
                value={`${info.memoryUsage}%`}
                hint={
                  typeof info.memoryUsedGb === "number"
                    ? `${info.memoryUsedGb}/${info.memoryTotalGb} GB`
                    : `${info.memoryTotalGb} GB`
                }
              />
              <OverviewLegend
                color="#a78bfa"
                label="Disco C:"
                value={`${info.diskUsage}%`}
                hint={`${info.diskTotalGb} GB`}
              />
            </ul>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="surface-panel border-border/50 p-4">
            <p className="mb-2 text-sm font-medium">CPU ao longo do tempo</p>
            <Chart type="area" height={240} options={areaCpuOptions} series={cpuSeries} />
          </Card>
          <Card className="surface-panel border-border/50 p-4">
            <p className="mb-2 text-sm font-medium">Memória ao longo do tempo</p>
            <Chart type="area" height={240} options={areaMemOptions} series={memSeries} />
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="surface-panel border-border/50 p-4">
          <p className="mb-2 text-sm font-medium">Uso das unidades</p>
          {disks.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma unidade detectada.
            </p>
          ) : (
            <Chart type="bar" height={260} options={diskBarOptions} series={diskBarSeries} />
          )}
        </Card>

        <Card className="surface-panel flex min-h-0 flex-col border-border/50 p-4">
          <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">Processos (memória)</p>
              <p className="text-xs text-muted-foreground">
                {processes.length} processo{processes.length === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 rounded-full"
              onClick={() => void refreshProcesses()}
              disabled={procLoading}
            >
              <RefreshCw className={procLoading ? "size-3.5 animate-spin" : "size-3.5"} />
              Atualizar
            </Button>
          </div>

          <div className="mb-2 grid shrink-0 grid-cols-[minmax(5.5rem,8rem)_1fr_auto] gap-3 px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            <span>Processo</span>
            <span>Memória</span>
            <span className="text-right">CPU · MB</span>
          </div>

          <AppScrollArea className="h-[min(20rem,48vh)] w-full sm:h-[min(22rem,52vh)] lg:h-[min(24rem,56vh)]">
            <ul className="space-y-2.5 pr-3">
              {processes.map((p) => {
                const pct = Math.max(4, Math.round((p.memMb / maxProcessMem) * 100));
                return (
                  <li
                    key={`${p.pid}-${p.name}`}
                    className="grid grid-cols-[minmax(5.5rem,8rem)_1fr_auto] items-center gap-3 rounded-lg px-1 py-1 hover:bg-muted/30"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold tracking-tight text-foreground" title={p.name}>
                        {p.name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">#{p.pid}</p>
                    </div>
                    <div className="h-2.5 min-w-0 overflow-hidden rounded-full bg-muted/55">
                      <div
                        className="h-full rounded-full bg-[oklch(0.72_0.14_300)] transition-[width] duration-500"
                        style={{ width: `${pct}%` }}
                        title={`${p.memMb} MB`}
                      />
                    </div>
                    <div className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      <span className="text-foreground/90">{p.cpu}s</span>
                      <span className="mx-1 opacity-40">·</span>
                      <span className="font-medium text-foreground">{p.memMb} MB</span>
                    </div>
                  </li>
                );
              })}
              {processes.length === 0 && (
                <li className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum processo listado.
                </li>
              )}
            </ul>
          </AppScrollArea>
        </Card>
      </div>
    </div>
  );
}

function LiveBadge() {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-primary shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_12%,transparent)]">
      <span className="relative flex size-2.5 shrink-0" aria-hidden>
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/50" />
        <span className="relative m-auto size-2 rounded-full bg-primary" />
      </span>
      <span className="text-xs font-semibold tracking-tight">Ao vivo</span>
      <span className="h-3 w-px bg-primary/25" aria-hidden />
      <span className="text-[11px] font-medium text-primary/75">atualiza a cada 2s</span>
    </div>
  );
}

function OverviewLegend({
  color,
  label,
  value,
  hint,
}: {
  color: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <li className="rounded-xl border border-border/50 bg-background/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
    </li>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="surface-panel hover-lift border-border/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Icon className="size-4" />
        </div>
      </div>
    </Card>
  );
}
