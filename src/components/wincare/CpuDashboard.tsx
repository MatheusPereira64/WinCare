import { useState, type ComponentType, type ReactNode } from "react";
import { ChevronDown, Clock, Cpu, Thermometer } from "lucide-react";

import { cn } from "@/lib/utils";
import { plural } from "@/lib/wincare/format";
import { cleanCpuName, cpuBreakdown, type CpuBreakdown } from "@/lib/wincare/systemTools";
import { useHistory, usePolling } from "@/lib/wincare/useLive";
import { useSystemInfo } from "@/lib/wincare/useSystem";
import { AreaChart } from "./AreaChart";
import { Panel } from "./Panel";
import { ProcessList } from "./ProcessList";
import { StatusBadge } from "./StatusBadge";

function uptimeText(seconds?: number) {
  if (!seconds)
    return {
      value: "—",
      detail: "Não foi possível ler há quanto tempo o PC está ligado.",
      tone: "neutral" as const,
    };
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const value = days ? `${days} d ${hours} h` : `${hours || 1} h`;
  if (days >= 7) {
    return {
      value,
      tone: "warning" as const,
      detail: `Ligado há ${plural(days, "dia", "dias")} sem reiniciar. Reinicie para aplicar atualizações e liberar memória.`,
    };
  }
  if (days >= 1) {
    return {
      value,
      tone: "neutral" as const,
      detail: `Ligado há ${plural(days, "dia", "dias")}. Tudo certo.`,
    };
  }
  return { value, tone: "success" as const, detail: "Você iniciou o sistema há pouco tempo." };
}

function temperatureText(celsius: number | null | undefined) {
  if (typeof celsius !== "number") {
    return {
      value: "—",
      tone: "neutral" as const,
      detail: "Este PC não informa a temperatura do processador ao Windows.",
    };
  }
  const value = `${Math.round(celsius)} °C`;
  if (celsius >= 85) {
    return {
      value,
      tone: "danger" as const,
      detail: "Temperatura alta. Verifique a ventilação e a poeira.",
    };
  }
  if (celsius >= 70) {
    return { value, tone: "warning" as const, detail: "Morna: comum em jogos e tarefas pesadas." };
  }
  return { value, tone: "success" as const, detail: "A temperatura está no intervalo normal." };
}

/**
 * Comparativo do processador: quanto está livre e quanto vai para seus apps
 * (usuário) e para o Windows (sistema), com histórico, tempo ligado,
 * temperatura e quem mais consome agora.
 */
export function CpuDashboard() {
  const info = useSystemInfo(2000);
  const cpu = usePolling<CpuBreakdown>(cpuBreakdown, 2000);
  const userHistory = useHistory(cpu?.userPct, 40);
  const sysHistory = useHistory(cpu?.systemPct, 40);
  const uptime = uptimeText(cpu?.uptimeSeconds);
  const temp = temperatureText(info.cpuTemperature);
  const peak = Math.max(20, ...userHistory, ...sysHistory);

  return (
    <Panel variant="hero" padding="lg" className="gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Cpu aria-hidden className="size-6 shrink-0 text-primary" />
          <h2 className="truncate text-xl font-semibold tracking-tight">
            {cleanCpuName(cpu?.model)}
          </h2>
        </div>
        {cpu?.cores ? (
          <StatusBadge>{plural(cpu.cores, "núcleo lógico", "núcleos lógicos")}</StatusBadge>
        ) : null}
      </div>

      <div className="grid gap-6 @5xl/main:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <div className="flex gap-5">
            <AreaChart
              series={[
                { values: userHistory, className: "text-success" },
                { values: sysHistory, className: "text-chart-3" },
              ]}
              max={peak}
              className="h-56 min-w-0 flex-1 rounded-xl border border-border/50 bg-card/40"
            />
            <dl
              className="flex w-28 shrink-0 flex-col justify-between gap-3"
              aria-label="Uso do processador agora"
            >
              <Legend label="Disponíveis" value={cpu?.idlePct} bar="bg-muted-foreground/60" />
              <Legend label="Usuário" value={cpu?.userPct} bar="bg-success" />
              <Legend label="Sistema" value={cpu?.systemPct} bar="bg-chart-3" />
            </dl>
          </div>

          <div className="grid gap-3 @2xl/main:grid-cols-2">
            <InfoCard
              icon={Clock}
              title="Funcionamento"
              value={uptime.value}
              tone={uptime.tone}
              detail={uptime.detail}
            >
              O Windows "fecha" de verdade só ao reiniciar: desligar com a inicialização rápida
              ligada mantém o mesmo tempo de funcionamento.
            </InfoCard>
            <InfoCard
              icon={Thermometer}
              title="Temperatura"
              value={temp.value}
              tone={temp.tone}
              detail={temp.detail}
            >
              Até 70 °C é tranquilo. Entre 70 e 85 °C é comum sob carga. Acima de 85 °C por muito
              tempo o processador reduz a velocidade para se proteger.
            </InfoCard>
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <h3 className="text-lg font-semibold tracking-tight">Maiores consumidores</h3>
          <ProcessList compact limit={8} refreshMs={3000} />
        </div>
      </div>
    </Panel>
  );
}

function Legend({ label, value, bar }: { label: string; value?: number; bar: string }) {
  return (
    <div className="flex gap-2.5">
      <span aria-hidden className={cn("w-1 shrink-0 rounded-full", bar)} />
      <div className="flex flex-col-reverse">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-2xl font-semibold tabular-nums">
          {typeof value === "number" ? `${value} %` : "—"}
        </dd>
      </div>
    </div>
  );
}

const TONE_VALUE = {
  neutral: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
} as const;

function InfoCard({
  icon: Icon,
  title,
  value,
  tone,
  detail,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  value: string;
  tone: keyof typeof TONE_VALUE;
  detail: string;
  /** Explicação extra em "Saiba mais". */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3">
        <Icon aria-hidden className="size-4.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
        <span className={cn("text-sm font-semibold tabular-nums", TONE_VALUE[tone])}>{value}</span>
      </div>
      <div className="space-y-2 px-4 py-3">
        <p className="text-sm text-muted-foreground">{detail}</p>
        {open && <p className="animate-fade-in text-xs text-muted-foreground">{children}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 rounded-md text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {open ? "Menos" : "Saiba mais"}
            <ChevronDown
              aria-hidden
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
