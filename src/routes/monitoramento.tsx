import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card } from "@/components/ui/card";
import { useSystemInfo } from "@/lib/wincare/useSystem";

export const Route = createFileRoute("/monitoramento")({
  head: () => ({
    meta: [
      { title: "Monitoramento de CPU e memória | WinCare" },
      {
        name: "description",
        content:
          "Gráficos em tempo real do uso de processador e memória para identificar gargalos no Windows.",
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
        },
      ].slice(-30),
    );
  }, [info]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Monitoramento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uso de CPU e memória amostrado a cada 2 segundos.
        </p>
      </header>

      <Card className="surface-panel border-border/60 p-5">
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
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
