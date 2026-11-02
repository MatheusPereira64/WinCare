import { createFileRoute } from "@tanstack/react-router";
import {
  CircuitBoard,
  Clock,
  LayoutDashboard,
  Monitor,
  ShieldCheck,
  Star,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DiagnosticReportCard } from "@/components/wincare/DiagnosticReport";
import { FullCheckCard } from "@/components/wincare/FullCheckCard";
import { HealthRing } from "@/components/wincare/HealthRing";
import { PageHeader } from "@/components/wincare/PageHeader";
import { QuickActions, RecommendationsCard } from "@/components/wincare/RecommendationsCard";
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

  const favoriteTools = TOOLS.filter((t) => favorites.includes(t.id));
  const healthy = info.health >= 80;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle={
          loading
            ? "Lendo informações do sistema…"
            : "Estado atual do computador, atualizado a cada 3 segundos."
        }
      />

      <Card className="hero-panel border-border/50 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-8">
          <HealthRing value={info.health} loading={loading} />
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={
                  loading
                    ? "rounded-full border-border/60 px-3 text-muted-foreground"
                    : healthy
                      ? "rounded-full border-success/30 bg-success/10 px-3 text-success"
                      : "rounded-full border-warning/30 bg-warning/10 px-3 text-warning"
                }
              >
                {!loading && (
                  <span
                    className={`size-1.5 rounded-full ${healthy ? "bg-success" : "bg-warning"}`}
                  />
                )}
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
              <HeroMeter
                label="CPU"
                value={info.cpuUsage}
                hint={
                  typeof info.cpuTemperature === "number" ? `${info.cpuTemperature} °C` : undefined
                }
              />
              <HeroMeter
                label="Memória"
                value={info.memoryUsage}
                hint={
                  typeof info.memoryUsedGb === "number"
                    ? `${info.memoryUsedGb} de ${info.memoryTotalGb} GB`
                    : `${info.memoryTotalGb} GB instalados`
                }
              />
              <HeroMeter
                label="Disco C:"
                value={info.diskUsage}
                hint={`${info.diskTotalGb} GB no total`}
              />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <RecommendationsCard system={info} disks={disks} loading={loading} />
        <QuickActions />
      </div>

      <FullCheckCard />

      <DiagnosticReportCard system={info} disks={disks} />

      {favoriteTools.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Star className="size-4 text-warning" />
            <h2 className="text-lg font-semibold">Favoritos</h2>
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
function HeroMeter({ label, value, hint }: { label: string; value: number; hint?: string }) {
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
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
