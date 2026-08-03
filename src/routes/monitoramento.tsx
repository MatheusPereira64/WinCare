import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { CircuitBoard, Cpu, MemoryStick, Thermometer } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useSystemInfo } from "@/lib/wincare/useSystem";

export const Route = createFileRoute("/monitoramento")({
  head: () => ({
    meta: [
      { title: "Monitoramento de CPU, memória e GPU | WinCare" },
      {
        name: "description",
        content:
          "Gráficos em tempo real de CPU, memória e GPU, com uso e temperatura quando o hardware expõe sensores.",
      },
      { property: "og:title", content: "Monitoramento de CPU, memória e GPU | WinCare" },
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
  gpu: number;
}

function formatTemp(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/D";
  return `${Math.round(value)} °C`;
}

function MetricCard({
  icon,
  title,
  usage,
  temp,
  detail,
  tempHint,
}: {
  icon: ReactNode;
  title: string;
  usage: number | null | undefined;
  temp: number | null | undefined;
  detail?: string;
  tempHint?: string;
}) {
  const usageValue = typeof usage === "number" ? usage : null;

  return (
    <Card className="surface-panel gap-4 border-border/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            {icon}
          </span>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
          </div>
        </div>
        <p className="text-2xl font-semibold tabular-nums">
          {usageValue == null ? "—" : `${usageValue}%`}
        </p>
      </div>

      <Progress value={usageValue ?? 0} className="h-2" />

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5" title={tempHint}>
          <Thermometer className="size-4" />
          {formatTemp(temp)}
        </span>
        {usageValue == null && !detail && (
          <span className="text-xs">Sensor ou contador indisponível neste PC</span>
        )}
      </div>
    </Card>
  );
}

function MonitorPage() {
  const info = useSystemInfo(2000);
  const [data, setData] = useState<Point[]>([]);

  useEffect(() => {
    setData((prev) =>
      [
        ...prev,
        {
          t: new Date().toLocaleTimeString("pt-BR", { minute: "2-digit", second: "2-digit" }),
          cpu: info.cpuUsage,
          mem: info.memoryUsage,
          gpu: typeof info.gpuUsage === "number" ? info.gpuUsage : 0,
        },
      ].slice(-30),
    );
  }, [info]);

  const memDetail =
    typeof info.memoryUsedGb === "number"
      ? `${info.memoryUsedGb} / ${info.memoryTotalGb} GB`
      : `${info.memoryTotalGb} GB instalados`;

  const gpuDetailParts = [
    info.gpuName,
    typeof info.gpuMemoryUsedMb === "number" && typeof info.gpuMemoryTotalMb === "number"
      ? `VRAM ${Math.round((info.gpuMemoryUsedMb / 1024) * 10) / 10}/${Math.round((info.gpuMemoryTotalMb / 1024) * 10) / 10} GB`
      : typeof info.gpuMemoryUsedMb === "number"
        ? `VRAM ${Math.round((info.gpuMemoryUsedMb / 1024) * 10) / 10} GB em uso`
        : typeof info.gpuMemoryUsage === "number"
          ? `VRAM ${info.gpuMemoryUsage}%`
          : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Monitoramento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uso e temperatura de CPU, memória e GPU — amostra a cada 2 segundos.
          {info.simulated ? " (modo demonstração)" : ""}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <MetricCard
          icon={<Cpu className="size-5" />}
          title="CPU"
          usage={info.cpuUsage}
          temp={info.cpuTemperature}
          detail="Processador"
          tempHint="Via zona térmica ACPI do Windows (pode ser N/D em alguns PCs)."
        />
        <MetricCard
          icon={<MemoryStick className="size-5" />}
          title="Memória"
          usage={info.memoryUsage}
          temp={info.memoryTemperature}
          detail={memDetail}
          tempHint="Temperatura de RAM raramente é exposta pelo Windows sem sensor dedicado."
        />
        <MetricCard
          icon={<CircuitBoard className="size-5" />}
          title="GPU"
          usage={info.gpuUsage}
          temp={info.gpuTemperature}
          detail={gpuDetailParts.join(" · ") || "Placa de vídeo"}
          tempHint="NVIDIA: nvidia-smi. AMD/outros: uso via Windows; temperatura só se o driver expuser."
        />
      </div>

      <Card className="surface-panel border-border/60 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: "var(--chart-1)" }} />
            CPU %
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: "var(--chart-3)" }} />
            Memória %
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: "var(--chart-2)" }} />
            GPU %
          </span>
        </div>
        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="memFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gpuFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="t" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  color: "var(--popover-foreground)",
                }}
              />
              <Area
                type="monotone"
                dataKey="cpu"
                name="CPU %"
                stroke="var(--chart-1)"
                fill="url(#cpuFill)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="mem"
                name="Memória %"
                stroke="var(--chart-3)"
                fill="url(#memFill)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="gpu"
                name="GPU %"
                stroke="var(--chart-2)"
                fill="url(#gpuFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
