import { useEffect, useId, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Brain } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/wincare/PageHeader";
import { GamingSessionCard, SystemProfilesCard } from "@/components/wincare/SystemProfilesCard";
import { HealthTimelineCard, SnapshotCompareCard } from "@/components/wincare/HealthTimelineCard";
import { RecommendationsPanel } from "@/components/wincare/Recommendations";
import { SymptomDiagnosis } from "@/components/wincare/SymptomDiagnosis";
import { getNative, isNative, SIMULATED_DISK_USAGE, SIMULATED_STARTUP } from "@/lib/wincare/bridge";
import { hydrateIntelligence, useIntel } from "@/lib/wincare/intelligenceStore";
import { handleRovingKeyDown } from "@/lib/wincare/roving";
import { loadDiskUsageFolders, loadStartupItems } from "@/lib/wincare/systemData";
import { unlockUi } from "@/lib/wincare/unlockUi";
import type { DiskUsageFolder, StartupItem, TopProcess } from "@/lib/wincare/types";
import { useSystemInfo } from "@/lib/wincare/useSystem";

export const Route = createFileRoute("/inteligencia")({
  head: () => ({
    meta: [
      { title: "Inteligência do PC | WinCare" },
      {
        name: "description",
        content:
          "Histórico de saúde, recomendações reais, diagnóstico por sintoma, perfis e sessões de jogo.",
      },
    ],
  }),
  component: IntelligencePage,
});

type Tab = "saude" | "diagnostico" | "perfis";

const TABS: { id: Tab; label: string }[] = [
  { id: "saude", label: "Saúde e capturas" },
  { id: "diagnostico", label: "Diagnóstico" },
  { id: "perfis", label: "Perfis e jogos" },
];

const SIM_PROCESSES: TopProcess[] = [
  { name: "chrome", pid: 1204, cpu: 18, memMb: 890 },
  { name: "cs2", pid: 5510, cpu: 44, memMb: 2100 },
  { name: "discord", pid: 2201, cpu: 4, memMb: 280 },
];

function IntelligencePage() {
  const info = useSystemInfo(8000);
  const samples = useIntel((s) => s.samples);
  const startupKnown = useIntel((s) => s.startupKnown);
  const [tab, setTab] = useState<Tab>("saude");
  const tabsId = useId();
  const [folders, setFolders] = useState<DiskUsageFolder[]>([]);
  const [processes, setProcesses] = useState<TopProcess[]>([]);

  const [startupFull, setStartupFull] = useState<StartupItem[] | null>(null);

  /*
   * Leituras pesadas (ícones da inicialização, varredura de pastas) vêm do cache
   * compartilhado com o Dashboard e começam um pouco depois de a aba abrir.
   * Até chegarem, usa a lista do coletor (sem uso de memória).
   */
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      void loadStartupItems().then(
        (items) => !cancelled && setStartupFull(items),
        () => {},
      );
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  const startup = useMemo<StartupItem[]>(() => {
    if (startupFull) return startupFull;
    if (startupKnown.length > 0) {
      return startupKnown.map((item) => ({
        id: item.id,
        name: item.name,
        command: "",
        location: "hkcu-run" as const,
        enabled: item.enabled,
      }));
    }
    return isNative() ? [] : SIMULATED_STARTUP;
  }, [startupFull, startupKnown]);

  useEffect(() => {
    hydrateIntelligence();
    unlockUi();
    const t = window.setTimeout(unlockUi, 200);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    unlockUi();
    const timers = [0, 200, 500].map((ms) => window.setTimeout(unlockUi, ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [tab]);

  useEffect(() => {
    if (tab !== "diagnostico") return;
    let cancelled = false;
    const load = async () => {
      const native = getNative();
      try {
        const [disk, top] = await Promise.all([
          loadDiskUsageFolders(),
          native?.topProcesses?.() ?? (isNative() ? [] : SIM_PROCESSES),
        ]);
        if (cancelled) return;
        setFolders(Array.isArray(disk) ? disk : SIMULATED_DISK_USAGE);
        setProcesses(Array.isArray(top) ? top : []);
      } catch {
        if (!cancelled) {
          setFolders(isNative() ? [] : SIMULATED_DISK_USAGE);
          setProcesses(isNative() ? [] : SIM_PROCESSES);
        }
      }
      unlockUi();
    };
    const t = window.setTimeout(() => void load(), 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [tab]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Brain}
        title="Inteligência"
        subtitle="Histórico, recomendações com base no seu PC, diagnóstico por sintoma e perfis de uso."
      />

      {/* Abas (WAI-ARIA): só a aba ativa no Tab; setas/Home/End trocam. */}
      <div
        role="tablist"
        aria-label="Seções da Inteligência"
        className="flex flex-wrap gap-1.5"
        onKeyDown={(e) => handleRovingKeyDown(e, "[role=tab]")}
      >
        {TABS.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            role="tab"
            id={`${tabsId}-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`${tabsId}-panel`}
            tabIndex={tab === item.id ? 0 : -1}
            variant={tab === item.id ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${tabsId}-panel`}
        aria-labelledby={`${tabsId}-tab-${tab}`}
        className="space-y-4"
      >
        {tab === "saude" && (
          <div className="space-y-4">
            <HealthTimelineCard samples={samples} />
            <RecommendationsPanel variant="full" info={info} />
            <SnapshotCompareCard info={info} startup={startup} processes={processes} />
          </div>
        )}

        {tab === "diagnostico" && (
          <SymptomDiagnosis info={info} startup={startup} folders={folders} processes={processes} />
        )}

        {tab === "perfis" && (
          <div className="space-y-4">
            <SystemProfilesCard />
            <GamingSessionCard />
          </div>
        )}
      </div>

      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Brain className="size-3.5 shrink-0" />
        Arquivos grandes ficam na aba Disco. Mudanças no boot aparecem em Inicialização.
      </p>
    </div>
  );
}
