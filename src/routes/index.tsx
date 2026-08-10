import { createFileRoute } from "@tanstack/react-router";
import {
  CircuitBoard,
  Clock,
  Cpu,
  HardDrive,
  MemoryStick,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Star,
} from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DiagnosticReportCard } from "@/components/wincare/DiagnosticReport";
import { FullCheckCard } from "@/components/wincare/FullCheckCard";
import { HealthRing } from "@/components/wincare/HealthRing";
import { StatCard } from "@/components/wincare/StatCard";
import { ToolCard } from "@/components/wincare/ToolCard";
import { useStore } from "@/lib/wincare/store";
import { TOOLS } from "@/lib/wincare/tools";
import { isSystemInfoLoading, useDisks, useSystemInfo } from "@/lib/wincare/useSystem";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard do sistema | WinCare" },
      {
        name: "description",
        content:
          "Veja CPU, memória, disco, tempo ligado, Windows Defender e a saúde geral do computador em tempo real.",
      },
      { property: "og:title", content: "Dashboard do sistema | WinCare" },
      {
        property: "og:description",
        content: "Diagnóstico do Windows em tempo real com saúde geral de 0 a 100%.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const info = useSystemInfo();
  const disks = useDisks();
  const loading = isSystemInfoLoading(info);
  const favorites = useStore((s) => s.favorites);
  const autoCheck = useStore((s) => s.autoCheck);

  useEffect(() => {
    if (autoCheck) {
      toast.info("Verificação automática concluída", {
        description: "Nenhum problema crítico detectado na inicialização.",
      });
    }
  }, [autoCheck]);

  const favoriteTools = TOOLS.filter((t) => favorites.includes(t.id));
  const healthy = info.health >= 80;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? "Lendo informações do sistema…"
            : `Estado atual de ${info.hostname} — atualizado a cada 3 segundos.`}
        </p>
      </header>

      <Card className="hero-panel border-border/50 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-8">
          <HealthRing value={info.health} />
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={
                  healthy
                    ? "rounded-full border-success/30 bg-success/10 px-3 text-success"
                    : "rounded-full border-warning/30 bg-warning/10 px-3 text-warning"
                }
              >
                <span
                  className={`size-1.5 rounded-full ${healthy ? "bg-success" : "bg-warning"}`}
                />
                {loading ? "Carregando…" : healthy ? "Sistema saudável" : "Requer atenção"}
              </Badge>
              <Badge variant="outline" className="rounded-full border-border/60 px-3 text-muted-foreground">
                <Monitor className="size-3" /> {info.hostname}
              </Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {info.osName} — Build {info.build}. Ligado há {info.uptime}. Última atualização do
              Windows: {info.lastUpdate}.
            </p>
            <div className="grid max-w-2xl gap-x-8 gap-y-3 sm:grid-cols-3">
              <HeroMeter label="CPU" value={info.cpuUsage} />
              <HeroMeter label="Memória" value={info.memoryUsage} />
              <HeroMeter label="Disco C:" value={info.diskUsage} />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            icon={<Cpu className="size-4" />}
            label="Uso de CPU"
            value={`${info.cpuUsage}%`}
            hint={
              typeof info.cpuTemperature === "number"
                ? `${info.cpuTemperature} °C`
                : "Temperatura indisponível"
            }
            progress={info.cpuUsage}
          />
          <StatCard
            icon={<MemoryStick className="size-4" />}
            label="Memória"
            value={`${info.memoryUsage}%`}
            hint={
              typeof info.memoryUsedGb === "number"
                ? `${info.memoryUsedGb} / ${info.memoryTotalGb} GB`
                : `${info.memoryTotalGb} GB instalados`
            }
            progress={info.memoryUsage}
          />
          <StatCard
            icon={<CircuitBoard className="size-4" />}
            label="GPU"
            value={typeof info.gpuUsage === "number" ? `${info.gpuUsage}%` : "—"}
            hint={[
              info.gpuName,
              typeof info.gpuTemperature === "number" ? `${info.gpuTemperature} °C` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Sensor indisponível"}
            progress={typeof info.gpuUsage === "number" ? info.gpuUsage : 0}
          />
          <StatCard
            icon={<HardDrive className="size-4" />}
            label="Espaço em disco (C:)"
            value={`${info.diskUsage}% usado`}
            hint={`${info.diskTotalGb} GB no total`}
            progress={info.diskUsage}
          />
          <StatCard
            icon={<Clock className="size-4" />}
            label="Tempo ligado"
            value={info.uptime}
            hint={`Última atualização do Windows: ${info.lastUpdate}`}
          />
          <StatCard
            icon={<ShieldCheck className="size-4" />}
            label="Windows Defender"
            value={info.defenderStatus}
            hint={info.simulated ? "Dados simulados no modo demonstração" : "Dados nativos"}
          />
      </div>

      <DiagnosticReportCard system={info} disks={disks} />

      <FullCheckCard />

      {favoriteTools.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Star className="size-4 text-warning" />
            <h2 className="text-lg font-semibold">Favoritos</h2>
            <RefreshCw className="size-3.5 text-muted-foreground" />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {favoriteTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Medidor compacto usado dentro do painel hero. */
function HeroMeter({ label, value }: { label: string; value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  const tone =
    clamped >= 90 ? "bg-destructive" : clamped >= 75 ? "bg-warning" : "bg-primary";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{clamped}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tone}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
