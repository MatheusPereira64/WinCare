import { createFileRoute } from "@tanstack/react-router";
import { Activity, Cpu, HardDrive, MemoryStick, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";

import { Button } from "@/components/ui/button";
import { AppScrollArea } from "@/components/wincare/AppScrollArea";
import { PageHeader } from "@/components/wincare/PageHeader";
import { MemoryOptimizerCard } from "@/components/wincare/MemoryOptimizerCard";
import { Panel } from "@/components/wincare/Panel";
import { EmptyState } from "@/components/wincare/States";
import { StatCard } from "@/components/wincare/StatCard";
import { getNative } from "@/lib/wincare/bridge";
import { formatGb } from "@/lib/wincare/format";
import { pageHidden } from "@/lib/wincare/pageVisibility";
import type { TopProcess } from "@/lib/wincare/types";
import { useStore } from "@/lib/wincare/store";
import { useDisks, useSystemInfo } from "@/lib/wincare/useSystem";

export const Route = createFileRoute("/monitoramento")({
  head: () => ({
    meta: [
      { title: "Monitoramento de CPU e memória | WinCare" },
      {
        name: "description",
        content: "Dashboards em tempo real de CPU, memória, disco e processos no Windows.",
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

/*
 * Cores dos textos dos gráficos por tema (ApexCharts precisa de cor literal):
 * mesmos tons de --muted-foreground / --foreground, >= 4.5:1 nos cards.
 */
const CHART_TEXT = {
  dark: { muted: "#9aa2ae", strong: "#f1f4f7", grid: "rgba(148, 163, 184, 0.18)" },
  light: { muted: "#545b66", strong: "#11161f", grid: "rgba(71, 85, 105, 0.18)" },
} as const;

type ChartMode = keyof typeof CHART_TEXT;

/** Resumo em texto de uma série (o gráfico em si fica oculto para o leitor de tela). */
function describeSeries(label: string, values: number[]) {
  if (values.length === 0) return `${label}: sem dados ainda.`;
  const now = values[values.length - 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return `${label} agora em ${now}%. Nas últimas ${values.length} leituras: mínimo ${min}%, máximo ${max}%.`;
}

function chartTheme(mode: ChartMode, overrides: ApexOptions = {}): ApexOptions {
  // Defaults por último nas chaves aninhadas — evita que `...overrides` no fim
  // apague toolbar:false e outros defaults (bug que deixava o zoom do ApexCharts aparecer).
  return {
    ...overrides,
    chart: {
      background: "transparent",
      animations: { enabled: true, speed: 400 },
      fontFamily: "inherit",
      // A camada acessível do Apex é em inglês e deixa o SVG/legenda no Tab;
      // os gráficos ficam ocultos e cada um tem um resumo em texto em português.
      accessibility: { enabled: false },
      ...overrides.chart,
      toolbar: { show: false, ...overrides.chart?.toolbar },
      zoom: { enabled: false, ...overrides.chart?.zoom },
    },
    theme: { mode, ...overrides.theme },
    grid: {
      borderColor: CHART_TEXT[mode].grid,
      strokeDashArray: 4,
      ...overrides.grid,
    },
    dataLabels: { enabled: false, ...overrides.dataLabels },
    stroke: { curve: "smooth", width: 2, ...overrides.stroke },
    tooltip: {
      theme: mode,
      ...overrides.tooltip,
    },
    legend: {
      labels: { colors: CHART_TEXT[mode].muted },
      ...overrides.legend,
    },
  };
}

function MonitorPage() {
  const mode: ChartMode = useStore((s) => s.theme);
  const text = CHART_TEXT[mode];
  const info = useSystemInfo(2000);
  const disks = useDisks();
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
    const id = setInterval(() => {
      if (!pageHidden()) void refreshProcesses();
    }, 8000);
    return () => clearInterval(id);
  }, []);

  const categories = useMemo(() => data.map((d) => d.t), [data]);
  const cpuSeries = useMemo(() => [{ name: "CPU %", data: data.map((d) => d.cpu) }], [data]);
  const memSeries = useMemo(() => [{ name: "Memória %", data: data.map((d) => d.mem) }], [data]);

  const radialOptions = useMemo(
    () =>
      chartTheme(mode, {
        chart: { type: "radialBar" },
        plotOptions: {
          radialBar: {
            hollow: { size: "42%" },
            track: { background: "rgba(148,163,184,0.12)", margin: 6 },
            dataLabels: {
              name: { show: true, color: text.muted, fontSize: "12px", offsetY: -8 },
              value: {
                show: true,
                color: text.strong,
                fontSize: "20px",
                fontWeight: 600,
                offsetY: 2,
                formatter: (val) => `${Math.round(Number(val))}%`,
              },
              total: {
                show: true,
                label: "Saúde",
                color: text.muted,
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
    [info.health, mode, text],
  );

  const areaCpuOptions = useMemo(
    () =>
      chartTheme(mode, {
        chart: { type: "area", sparkline: { enabled: false } },
        colors: ["#548dfc"],
        fill: {
          type: "gradient",
          gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05 },
        },
        xaxis: {
          categories,
          labels: {
            style: { colors: text.muted, fontSize: "10px" },
            rotate: 0,
            hideOverlappingLabels: true,
          },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: {
          min: 0,
          max: 100,
          labels: { style: { colors: text.muted, fontSize: "11px" }, formatter: (v) => `${v}%` },
        },
      }),
    [categories, mode, text],
  );

  const areaMemOptions = useMemo(
    () =>
      chartTheme(mode, {
        chart: { type: "area" },
        colors: ["#43c6f5"],
        fill: {
          type: "gradient",
          gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 },
        },
        xaxis: {
          categories,
          labels: {
            style: { colors: text.muted, fontSize: "10px" },
            rotate: 0,
            hideOverlappingLabels: true,
          },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: {
          min: 0,
          max: 100,
          labels: { style: { colors: text.muted, fontSize: "11px" }, formatter: (v) => `${v}%` },
        },
      }),
    [categories, mode, text],
  );

  const diskBarOptions = useMemo(
    () =>
      chartTheme(mode, {
        chart: { type: "bar", stacked: false },
        plotOptions: { bar: { borderRadius: 6, horizontal: true, barHeight: "55%" } },
        colors: ["#fbbf24", "#2e3650"],
        xaxis: {
          categories: disks.map((d) => d.letter),
          max: 100,
          labels: { style: { colors: text.muted }, formatter: (v) => `${v}%` },
        },
        yaxis: { labels: { style: { colors: text.muted } } },
        legend: { show: true },
      }),
    [disks, mode, text],
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

  const maxProcessMem = useMemo(() => Math.max(1, ...processes.map((p) => p.memMb)), [processes]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Activity}
        title="Monitoramento"
        subtitle="Painéis em tempo real: CPU, memória, discos e processos."
        actions={<LiveBadge />}
      />

      <MemoryOptimizerCard />

      <div className="grid gap-4 @sm/main:grid-cols-2 @4xl/main:grid-cols-4">
        <StatCard
          icon={<Cpu className="size-4" />}
          label="CPU"
          value={`${info.cpuUsage}%`}
          hint={info.osName || "Processador"}
        />
        <StatCard
          icon={<MemoryStick className="size-4" />}
          label="Memória"
          value={`${info.memoryUsage}%`}
          hint={`${info.memoryTotalGb} GB no total`}
        />
        <StatCard
          icon={<HardDrive className="size-4" />}
          label="Disco C:"
          value={`${info.diskUsage}%`}
          hint={`${info.diskTotalGb} GB no total`}
        />
        <StatCard
          icon={<Activity className="size-4" />}
          label="Saúde"
          value={`${info.health}`}
          hint={`Ligado há ${info.uptime}`}
        />
      </div>

      <div className="grid gap-4 @5xl/main:grid-cols-[340px_1fr]">
        <Panel padding="sm" className="@container/overview gap-0">
          <h2 className="mb-1 text-sm font-medium">Visão geral</h2>
          <p className="mb-2 text-xs text-muted-foreground">Uso atual dos principais recursos</p>
          {/* Na coluna estreita a legenda vira uma linha de 3 abaixo do gráfico. */}
          <div className="flex flex-col items-stretch gap-3 @md/overview:flex-row @md/overview:items-center">
            {/* Os mesmos números estão na legenda ao lado (lida pelo Narrador). */}
            <div className="min-w-0 flex-1" aria-hidden>
              <Chart
                type="radialBar"
                height={230}
                options={radialOptions}
                series={[info.cpuUsage, info.memoryUsage, info.diskUsage]}
              />
            </div>
            <ul
              aria-label="Uso atual"
              className="grid w-full shrink-0 grid-cols-3 gap-2 @md/overview:flex @md/overview:w-[132px] @md/overview:flex-col @md/overview:gap-2.5"
            >
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
                    ? `${formatGb(info.memoryUsedGb)} de ${info.memoryTotalGb} GB`
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
        </Panel>

        <div className="grid gap-4 @xl/main:grid-cols-2">
          <Panel padding="sm" className="min-w-0 gap-0">
            <h2 className="mb-2 text-sm font-medium">CPU ao longo do tempo</h2>
            <p className="sr-only">{describeSeries("CPU", cpuSeries[0].data)}</p>
            <div aria-hidden>
              <Chart type="area" height={240} options={areaCpuOptions} series={cpuSeries} />
            </div>
          </Panel>
          <Panel padding="sm" className="min-w-0 gap-0">
            <h2 className="mb-2 text-sm font-medium">Memória ao longo do tempo</h2>
            <p className="sr-only">{describeSeries("Memória", memSeries[0].data)}</p>
            <div aria-hidden>
              <Chart type="area" height={240} options={areaMemOptions} series={memSeries} />
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 @4xl/main:grid-cols-2">
        <Panel padding="sm" className="min-w-0 gap-0">
          <h2 className="mb-2 text-sm font-medium">Uso das unidades</h2>
          {disks.length === 0 ? (
            <EmptyState
              size="sm"
              icon={HardDrive}
              title="Nenhuma unidade detectada"
              description="O Windows não informou unidades de disco."
            />
          ) : (
            <>
              <ul className="sr-only">
                {disks.map((d, i) => (
                  <li key={d.letter}>
                    Unidade {d.letter}: {diskBarSeries[0].data[i]}% usado, {d.freeGb} GB livres de{" "}
                    {d.totalGb} GB
                  </li>
                ))}
              </ul>
              <div aria-hidden>
                <Chart type="bar" height={260} options={diskBarOptions} series={diskBarSeries} />
              </div>
            </>
          )}
        </Panel>

        <Panel padding="sm" className="min-h-0 min-w-0 gap-0">
          <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-medium">Processos (memória)</h2>
              <p className="text-xs text-muted-foreground">
                {processes.length} processo{processes.length === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 rounded-full"
              aria-label="Atualizar lista de processos"
              onClick={() => void refreshProcesses()}
              disabled={procLoading}
            >
              <RefreshCw className={procLoading ? "size-3.5 animate-spin" : "size-3.5"} />
              Atualizar
            </Button>
          </div>

          <div
            aria-hidden
            className="mb-2 grid shrink-0 grid-cols-[minmax(5.5rem,8rem)_1fr_auto] gap-3 px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
          >
            <span>Processo</span>
            <span>Memória</span>
            <span className="text-right">CPU · MB</span>
          </div>

          <AppScrollArea
            viewportLabel="Processos por uso de memória"
            className="h-[min(20rem,48vh)] w-full sm:h-[min(22rem,52vh)] lg:h-[min(24rem,56vh)]"
          >
            <ul className="space-y-2.5 pr-3" aria-label="Processos por uso de memória">
              {processes.map((p) => {
                const pct = Math.max(4, Math.round((p.memMb / maxProcessMem) * 100));
                return (
                  <li
                    key={`${p.pid}-${p.name}`}
                    className="grid grid-cols-[minmax(5.5rem,8rem)_1fr_auto] items-center gap-3 rounded-lg px-1 py-1 hover:bg-muted/30"
                  >
                    {/* Uma frase por processo para o Narrador; as colunas visuais ficam ocultas. */}
                    <span className="sr-only">
                      {p.name}, PID {p.pid}: {p.memMb} MB de memória, {p.cpu} segundos de CPU
                    </span>
                    <div className="min-w-0" aria-hidden>
                      <p
                        className="truncate text-sm font-semibold tracking-tight text-foreground"
                        title={p.name}
                      >
                        {p.name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">#{p.pid}</p>
                    </div>
                    <div
                      aria-hidden
                      className="h-2.5 min-w-0 overflow-hidden rounded-full bg-muted/55 forced-colors:border forced-colors:border-[CanvasText]"
                    >
                      <div
                        className="h-full rounded-full bg-[oklch(0.72_0.14_300)] transition-[width] duration-500 forced-colors:forced-color-adjust-none forced-colors:bg-[Highlight]"
                        style={{ width: `${pct}%` }}
                        title={`${p.memMb} MB`}
                      />
                    </div>
                    <div
                      aria-hidden
                      className="shrink-0 text-right text-xs whitespace-nowrap tabular-nums text-muted-foreground"
                    >
                      <span className="text-foreground">{p.cpu}s</span>
                      <span className="mx-1">·</span>
                      <span className="font-medium text-foreground">{p.memMb} MB</span>
                    </div>
                  </li>
                );
              })}
              {processes.length === 0 && (
                <li>
                  <EmptyState size="sm" icon={Activity} title="Nenhum processo listado" />
                </li>
              )}
            </ul>
          </AppScrollArea>
        </Panel>
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
      <span className="text-[11px] font-medium text-primary">atualiza a cada 2s</span>
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
    <li className="surface-inset px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
    </li>
  );
}
