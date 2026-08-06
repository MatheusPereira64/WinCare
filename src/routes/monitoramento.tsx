import { createFileRoute } from "@tanstack/react-router";
import { Activity, Cpu, HardDrive, MemoryStick, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  return {
    chart: {
      background: "transparent",
      toolbar: { show: false },
      animations: { enabled: true, speed: 400 },
      fontFamily: "inherit",
      ...overrides.chart,
    },
    theme: { mode: "dark" },
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
    ...overrides,
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
            hollow: { size: "58%" },
            track: { background: "rgba(148,163,184,0.12)" },
            dataLabels: {
              name: { color: "#94a3b8", fontSize: "12px" },
              value: { color: "#e2e8f0", fontSize: "22px", fontWeight: 600 },
            },
          },
        },
        labels: ["CPU", "RAM", "Disco C:"],
        colors: ["#2dd4bf", "#38bdf8", "#f59e0b"],
      }),
    [],
  );

  const areaCpuOptions = useMemo(
    () =>
      chartTheme({
        chart: { type: "area", sparkline: { enabled: false } },
        colors: ["#2dd4bf"],
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
        colors: ["#38bdf8"],
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
        colors: ["#f59e0b", "#334155"],
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

  const procBarOptions = useMemo(
    () =>
      chartTheme({
        chart: { type: "bar" },
        plotOptions: { bar: { borderRadius: 5, horizontal: true, barHeight: "60%" } },
        colors: ["#a78bfa"],
        xaxis: {
          categories: processes.map((p) => p.name),
          labels: { style: { colors: "#64748b" } },
        },
        yaxis: { labels: { style: { colors: "#94a3b8", fontSize: "11px" } } },
        tooltip: {
          y: { formatter: (v) => `${v} MB` },
        },
      }),
    [processes],
  );

  const procBarSeries = useMemo(
    () => [{ name: "Memória (MB)", data: processes.map((p) => p.memMb) }],
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
            Painéis em tempo real (ApexCharts) — CPU, memória, discos e processos.
            {!nativeMode && " Modo demonstração."}
          </p>
        </div>
        <Badge variant="outline">Atualização a cada 2s</Badge>
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
        <MetricTile icon={Activity} label="Saúde" value={`${info.health}`} hint={`Uptime ${info.uptime}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <Card className="surface-panel border-border/60 p-4">
          <p className="mb-2 text-sm font-medium text-muted-foreground">Visão geral</p>
          <Chart
            type="radialBar"
            height={280}
            options={radialOptions}
            series={[info.cpuUsage, info.memoryUsage, info.diskUsage]}
          />
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="surface-panel border-border/60 p-4">
            <p className="mb-2 text-sm font-medium">CPU ao longo do tempo</p>
            <Chart type="area" height={240} options={areaCpuOptions} series={cpuSeries} />
          </Card>
          <Card className="surface-panel border-border/60 p-4">
            <p className="mb-2 text-sm font-medium">Memória ao longo do tempo</p>
            <Chart type="area" height={240} options={areaMemOptions} series={memSeries} />
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="surface-panel border-border/60 p-4">
          <p className="mb-2 text-sm font-medium">Uso das unidades</p>
          {disks.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma unidade detectada.</p>
          ) : (
            <Chart type="bar" height={260} options={diskBarOptions} series={diskBarSeries} />
          )}
        </Card>

        <Card className="surface-panel border-border/60 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Processos (memória)</p>
            <Button variant="ghost" size="sm" onClick={() => void refreshProcesses()} disabled={procLoading}>
              <RefreshCw className={procLoading ? "size-3.5 animate-spin" : "size-3.5"} />
              Atualizar
            </Button>
          </div>
          <Chart type="bar" height={220} options={procBarOptions} series={procBarSeries} />
          <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
            {processes.map((p) => (
              <li key={`${p.pid}-${p.name}`} className="flex justify-between gap-2 border-b border-border/40 py-1">
                <span className="truncate">
                  {p.name} <span className="opacity-60">#{p.pid}</span>
                </span>
                <span>
                  CPU {p.cpu}s · {p.memMb} MB
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
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
    <Card className="surface-panel border-border/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Icon className="size-4" />
        </div>
      </div>
    </Card>
  );
}
