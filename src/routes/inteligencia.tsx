import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Brain, Lightbulb } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GamingSessionCard, SystemProfilesCard } from "@/components/wincare/SystemProfilesCard";
import { HealthTimelineCard, SnapshotCompareCard } from "@/components/wincare/HealthTimelineCard";
import { RecommendationList } from "@/components/wincare/RecommendationList";
import { SymptomDiagnosis } from "@/components/wincare/SymptomDiagnosis";
import { getNative, isNative, SIMULATED_DISK_USAGE, SIMULATED_STARTUP } from "@/lib/wincare/bridge";
import { buildRecommendations } from "@/lib/wincare/intelligence";
import { hydrateIntelligence, useIntel } from "@/lib/wincare/intelligenceStore";
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
  { id: "saude", label: "Saúde e snapshots" },
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
  const startupNewIds = useIntel((s) => s.startupNewIds);
  const startupKnown = useIntel((s) => s.startupKnown);
  const newcomers = useMemo(() => {
    const ids = new Set(startupNewIds);
    return startupKnown.filter((k) => ids.has(k.id));
  }, [startupNewIds, startupKnown]);
  const [tab, setTab] = useState<Tab>("saude");
  const [folders, setFolders] = useState<DiskUsageFolder[]>([]);
  const [processes, setProcesses] = useState<TopProcess[]>([]);

  /**
   * Não chama listStartup/diskUsage/topProcesses ao montar.
   * No Electron, listStartup extrai ícones no processo principal e diskUsage
   * varre pastas — os dois travam cliques assim que a aba abre.
   * O coletor já preenche startupKnown; diagnóstico pesado só na sub-aba.
   */
  const startup = useMemo<StartupItem[]>(() => {
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
  }, [startupKnown]);

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
          native?.diskUsage?.() ?? SIMULATED_DISK_USAGE,
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

  const recs = useMemo(
    () =>
      buildRecommendations({
        info,
        startup,
        folders,
        newcomers,
        trend: samples,
      }),
    [info, startup, folders, newcomers, samples],
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Inteligência</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Histórico, recomendações com base no seu PC, diagnóstico por sintoma e perfis de uso.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={tab === item.id ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {tab === "saude" && (
        <div className="space-y-4">
          <HealthTimelineCard samples={samples} />
          <Card className="surface-panel gap-4 border-border/60 p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Lightbulb className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">Recomendações</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Geradas a partir de CPU, RAM, disco, boot e tendência de saúde — não de regras
                  fixas.
                </p>
              </div>
            </div>
            <RecommendationList items={recs} />
          </Card>
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

      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Brain className="size-3.5" />
        Arquivos grandes ficam na aba Disco. Mudanças no boot aparecem em Inicialização.
      </p>
    </div>
  );
}
