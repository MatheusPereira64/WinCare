import { createFileRoute, Link } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";
import { Braces, Brush, FileSpreadsheet, History, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ChoiceChips } from "@/components/wincare/ChoiceChips";
import { ConfirmModal } from "@/components/wincare/ConfirmModal";
import {
  HistoryTimeline,
  HistoryTotals,
  LifetimeLine,
  WeeklyChart,
} from "@/components/wincare/MaintenanceHistory";
import { PageHeader } from "@/components/wincare/PageHeader";
import { EmptyState, LoadingState, ResourceView } from "@/components/wincare/States";
import { clearMaintenanceHistory, saveGeneratedFile } from "@/lib/wincare/bridge";
import {
  describeSummary,
  exportFileName,
  historyToCsv,
  historyToJson,
  lifetimeSummary,
  PERIODS,
  summarizePeriod,
  weeklyBuckets,
  weeksForPeriod,
  type PeriodDays,
} from "@/lib/wincare/history";
import { useMaintenanceHistory, type LoadedHistory } from "@/lib/wincare/useMaintenanceHistory";

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico de manutenção | WinCare" },
      {
        name: "description",
        content:
          "Quanto o WinCare já ajudou o PC: espaço liberado, programas removidos, reparos e saúde ao longo do tempo.",
      },
      { property: "og:title", content: "Histórico de manutenção | WinCare" },
      {
        property: "og:description",
        content:
          "Antes e depois da manutenção: totais de 7, 30 ou 90 dias, semanas e linha do tempo.",
      },
    ],
  }),
  component: HistoryPage,
});

const PERIOD_OPTIONS = PERIODS.map((days) => ({ value: days, label: `${days} dias` }));

type ExportFormat = "csv" | "json";

function HistoryPage() {
  const resource = useMaintenanceHistory();
  const [days, setDays] = useState<PeriodDays>(30);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const data = resource.data;

  const periodEvents = useMemo(
    () => (data ? summarizePeriod(data, days, data.loadedAt).events : []),
    [data, days],
  );
  const hasAnything = !!data && (data.events.length > 0 || data.health.length > 0);

  const exportHistory = async (format: ExportFormat) => {
    if (!data) return;
    setExporting(format);
    try {
      const now = Date.now();
      const content =
        format === "csv" ? historyToCsv(periodEvents) : historyToJson(data, days, now);
      const out = await saveGeneratedFile(content, exportFileName(days, format, now), {
        title: "Exportar histórico de manutenção",
        mime: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
      });
      if (out.ok) {
        toast.success("Histórico exportado", {
          description: out.path ?? `Últimos ${days} dias em ${format.toUpperCase()}.`,
        });
      } else if (!out.cancelled) {
        toast.error("Não foi possível exportar o histórico.", { description: out.reason });
      }
    } catch (error) {
      toast.error("Não foi possível exportar o histórico.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setExporting(null);
    }
  };

  const clearAll = async () => {
    setConfirmClear(false);
    const out = await clearMaintenanceHistory();
    if (out.ok) {
      toast.success("Histórico de manutenção apagado");
      await resource.reload();
    } else {
      toast.error("Não foi possível apagar o histórico.", { description: out.reason });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={History}
        title="Histórico"
        subtitle="Quanto o WinCare já ajudou este PC: espaço liberado, programas removidos, reparos e a saúde ao longo do tempo."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={!periodEvents.length || exporting !== null}
              onClick={() => void exportHistory("csv")}
              aria-label={`Exportar os últimos ${days} dias em CSV (planilha)`}
              title="Planilha para Excel ou LibreOffice"
            >
              {exporting === "csv" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
              CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!periodEvents.length || exporting !== null}
              onClick={() => void exportHistory("json")}
              aria-label={`Exportar os últimos ${days} dias em JSON (com totais e saúde)`}
              title="Dados completos do período, com totais e saúde diária"
            >
              {exporting === "json" ? <Loader2 className="animate-spin" /> : <Braces />}
              JSON
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasAnything}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 /> Apagar
            </Button>
          </>
        }
      />

      <ResourceView
        resource={resource}
        errorTitle="Não foi possível ler o histórico de manutenção"
        loading={<LoadingState label="Lendo o histórico de manutenção…" variant="cards" rows={2} />}
        isEmpty={(d) => d.events.length === 0 && d.health.length === 0}
        empty={
          <EmptyState
            icon={History}
            title="Nada registrado ainda"
            description="Quando você limpar o PC, remover um programa ou fizer um reparo — ou quando uma rotina agendada rodar — o resultado aparece aqui. A saúde do PC é registrada enquanto o WinCare fica aberto."
            action={
              <Button asChild size="sm">
                <Link to="/limpeza">
                  <Brush /> Ir para a Limpeza
                </Link>
              </Button>
            }
          />
        }
      >
        {(history) => <HistoryContent history={history} days={days} onDaysChange={setDays} />}
      </ResourceView>

      <ConfirmModal
        open={confirmClear}
        title="Apagar o histórico de manutenção?"
        confirmLabel="Apagar histórico"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => void clearAll()}
      >
        <p>
          Apaga todos os registros de limpezas, programas removidos, reparos e a saúde diária deste
          PC. Não dá para desfazer — se quiser guardar, exporte antes.
        </p>
        <p>Os logs de execução e as rotinas agendadas continuam como estão.</p>
      </ConfirmModal>
    </div>
  );
}

function HistoryContent({
  history,
  days,
  onDaysChange,
}: {
  history: LoadedHistory;
  days: PeriodDays;
  onDaysChange: (days: PeriodDays) => void;
}) {
  const now = history.loadedAt;
  const headingId = useId();
  const summary = useMemo(() => summarizePeriod(history, days, now), [history, days, now]);
  const weeks = useMemo(
    () => weeklyBuckets(history, weeksForPeriod(days), now),
    [history, days, now],
  );
  const lifetime = useMemo(() => lifetimeSummary(history), [history]);
  const sentence = describeSummary(summary);
  const olderExists = history.events.some((e) => e.ts < summary.since);
  const limits = history.limits;

  return (
    <div className="space-y-6">
      <section aria-labelledby={headingId} className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 space-y-1">
            <h2 id={headingId} className="text-lg font-semibold tracking-tight">
              Nos últimos {days} dias
            </h2>
            <p className="text-sm text-muted-foreground">
              {sentence ? `${sentence}.` : "Nenhuma limpeza, remoção ou reparo no período."}
            </p>
            {lifetime && <LifetimeLine {...lifetime} />}
          </div>
          <ChoiceChips
            label="Período"
            value={days}
            options={PERIOD_OPTIONS}
            onChange={onDaysChange}
          />
        </div>
        <HistoryTotals summary={summary} health={history.health} now={now} />
      </section>

      <WeeklyChart weeks={weeks} />

      {summary.events.length > 0 ? (
        <HistoryTimeline
          key={days}
          events={summary.events}
          days={days}
          now={now}
          limitNote={
            limits
              ? `O histórico fica neste PC e guarda até ${limits.maxEvents.toLocaleString("pt-BR")} registros e ${limits.maxHealthDays} dias de saúde; os mais antigos saem primeiro. É separado dos logs.`
              : undefined
          }
        />
      ) : (
        <EmptyState
          icon={History}
          title={`Nada registrado nos últimos ${days} dias`}
          description={
            olderExists
              ? "Há registros mais antigos: escolha um período maior."
              : "Limpezas, remoções e reparos feitos a partir de agora aparecem aqui."
          }
          action={
            olderExists && days < 90 ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => onDaysChange(90)}>
                Ver 90 dias
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
