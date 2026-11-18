import { createFileRoute } from "@tanstack/react-router";
import { CircuitBoard, Clock, LayoutDashboard, Monitor, ShieldCheck, Star } from "lucide-react";

import { BatteryStatCard } from "@/components/wincare/BatteryStatCard";
import { DiagnosticReportCard } from "@/components/wincare/DiagnosticReport";
import { FullCheckCard } from "@/components/wincare/FullCheckCard";
import { HealthRing } from "@/components/wincare/HealthRing";
import { HistoryHighlights } from "@/components/wincare/HistoryHighlights";
import { MemoryOptimizerCard } from "@/components/wincare/MemoryOptimizerCard";
import { PageHeader } from "@/components/wincare/PageHeader";
import { Panel } from "@/components/wincare/Panel";
import { QuickActions } from "@/components/wincare/QuickActions";
import { RecommendationsPanel } from "@/components/wincare/Recommendations";
import { Sparkline } from "@/components/wincare/Sparkline";
import { StatCard } from "@/components/wincare/StatCard";
import { StatusBadge } from "@/components/wincare/StatusBadge";
import { ToolCard } from "@/components/wincare/ToolCard";
import { summarizeBattery } from "@/lib/wincare/battery";
import { cn } from "@/lib/utils";
import { useIntel } from "@/lib/wincare/intelligenceStore";
import { useBatteryReport } from "@/lib/wincare/systemData";
import { useStore } from "@/lib/wincare/store";
import { TONE_FILL, usageTone } from "@/lib/wincare/tone";
import { formatGb } from "@/lib/wincare/format";
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
  const battery = useBatteryReport();
  const hasBattery = !!(battery && summarizeBattery(battery));
  const disks = useDisks();
  const loading = isSystemInfoLoading(info);
  const favorites = useStore((s) => s.favorites);
  const samples = useIntel((s) => s.samples);

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

      <Panel variant="hero" className="@2xl/main:p-8">
        {/* Estreito: anel em cima, centralizado; com espaço, lado a lado. */}
        <div className="flex flex-col items-center gap-6 @xl/main:flex-row @xl/main:gap-8">
          <HealthRing value={info.health} loading={loading} />
          <div className="@container/hero w-full min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                dot={!loading}
                tone={loading ? "neutral" : healthy ? "success" : "warning"}
              >
                {loading ? "Lendo…" : healthy ? "Sistema saudável" : "Requer atenção"}
              </StatusBadge>
              <StatusBadge>
                <Monitor className="size-3" aria-hidden /> {info.hostname}
              </StatusBadge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {info.osName} — build {info.build}. Ligado há {info.uptime}. Última atualização do
              Windows: {info.lastUpdate}.
            </p>
            <div className="grid max-w-2xl gap-x-6 gap-y-3 @sm/hero:grid-cols-3 @lg/hero:gap-x-8">
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
                    ? `${formatGb(info.memoryUsedGb)} de ${info.memoryTotalGb} GB`
                    : `${info.memoryTotalGb} GB instalados`
                }
              />
              <HeroMeter
                label="Disco C:"
                value={info.diskUsage}
                hint={`${info.diskTotalGb} GB no total`}
              />
            </div>
            {samples.length > 3 && (
              <div className="max-w-md text-primary">
                <p className="text-[11px] text-muted-foreground">Saúde nas últimas horas</p>
                <Sparkline values={samples.map((s) => s.health)} label="Saúde nas últimas horas" />
              </div>
            )}
          </div>
        </div>
      </Panel>

      <RecommendationsPanel variant="compact" info={info} />

      <MemoryOptimizerCard compact />

      {/* Com bateria são quatro cards (2 × 2 ou uma linha); sem, três (o último ocupa a linha em 2 colunas). */}
      <div
        className={cn(
          "grid gap-4 @xl/main:grid-cols-2",
          // Quatro em linha só com folga; senão 2 × 2 (os textos dos cards não cabem em 1/4).
          hasBattery ? "@7xl/main:grid-cols-4" : "@4xl/main:grid-cols-3",
        )}
      >
        <StatCard
          icon={<CircuitBoard className="size-4" />}
          label="GPU"
          value={typeof info.gpuUsage === "number" ? `${info.gpuUsage}%` : "—"}
          hint={
            [
              info.gpuName,
              typeof info.gpuTemperature === "number" ? `${info.gpuTemperature} °C` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Sensor indisponível"
          }
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
          hint={info.simulated ? "Dados simulados no modo demonstração" : "Lido agora no Windows"}
          // Em duas colunas, o terceiro card ocupa a linha inteira em vez de ficar sozinho.
          className={hasBattery ? undefined : "@xl/main:col-span-2 @4xl/main:col-span-1"}
        />
        <BatteryStatCard />
      </div>

      <QuickActions />

      <HistoryHighlights />

      <FullCheckCard />

      <DiagnosticReportCard system={info} disks={disks} />

      {favoriteTools.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Star className="size-4 text-warning" aria-hidden />
            <h2 className="text-lg font-semibold">Favoritos</h2>
          </div>
          <div className="grid gap-4 @4xl/main:grid-cols-2">
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
  const tone = TONE_FILL[usageTone(clamped)];

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{clamped}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Uso de ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={`${clamped}%${hint ? `, ${hint}` : ""}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60 forced-colors:border forced-colors:border-[CanvasText]"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 forced-colors:forced-color-adjust-none forced-colors:bg-[Highlight] ${tone}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
