import { createFileRoute } from "@tanstack/react-router";
import { HardDrive, Thermometer } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { DiskDashboard } from "@/components/wincare/DiskDashboard";
import { DiskHealthPanel } from "@/components/wincare/DiskHealthPanel";
import { DiskSpaceAnalyzer } from "@/components/wincare/DiskSpaceAnalyzer";
import { IconChip } from "@/components/wincare/IconChip";
import { Panel } from "@/components/wincare/Panel";
import { EmptyState, LoadingState } from "@/components/wincare/States";
import { StatusBadge } from "@/components/wincare/StatusBadge";
import { PageHeader } from "@/components/wincare/PageHeader";
import { StorageExplorer } from "@/components/wincare/StorageExplorer";
import { ToolSection } from "@/components/wincare/ToolSection";
import { useDiskList } from "@/lib/wincare/useSystem";

export const Route = createFileRoute("/disco")({
  head: () => ({
    meta: [
      { title: "Integridade e saúde dos discos | WinCare" },
      {
        name: "description",
        content:
          "Status SMART, mapa do disco, busca de arquivos grandes, duplicados e comparação ao longo do tempo.",
      },
      { property: "og:title", content: "Integridade e saúde dos discos | WinCare" },
      {
        property: "og:description",
        content: "Acompanhe SMART, espaço livre e limpe pastas que ocupam disco.",
      },
    ],
  }),
  component: DiskPage,
});

function DiskPage() {
  const { disks, loading } = useDiskList();

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <PageHeader
          icon={HardDrive}
          title="Disco"
          subtitle="Integridade das unidades instaladas, espaço disponível e pastas que mais ocupam."
        />

        <DiskDashboard />

        <DiskHealthPanel />

        {loading ? (
          <LoadingState label="Lendo as unidades de disco…" variant="block" />
        ) : disks.length === 0 ? (
          <EmptyState
            icon={HardDrive}
            title="Nenhuma unidade informada"
            description="O Windows não respondeu com as unidades de disco. Tente abrir esta página de novo em instantes."
          />
        ) : (
          <div className="grid gap-4 @4xl/main:grid-cols-2">
            {disks.map((disk) => {
              const used = Math.round(((disk.totalGb - disk.freeGb) / disk.totalGb) * 100);
              return (
                <Panel key={disk.letter}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <IconChip icon={HardDrive} />
                      <div className="min-w-0">
                        <p
                          className="truncate font-semibold"
                          title={`${disk.letter} — ${disk.model}`}
                        >
                          {disk.letter} — {disk.model}
                        </p>
                        <p className="text-xs text-muted-foreground">{disk.type}</p>
                      </div>
                    </div>
                    <StatusBadge
                      tone={disk.smart === "OK" ? "success" : "danger"}
                      className="shrink-0"
                      title="Autodiagnóstico do disco (SMART)"
                    >
                      SMART {disk.smart}
                    </StatusBadge>
                  </div>

                  <Progress
                    value={used}
                    className="h-2"
                    aria-label={`Uso da unidade ${disk.letter}`}
                    aria-valuetext={`${used}% usado, ${disk.freeGb} GB livres de ${disk.totalGb} GB`}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span>
                      {disk.freeGb} GB livres de {disk.totalGb} GB ({used}% usado)
                    </span>
                    {typeof disk.temperature === "number" && (
                      <span className="flex items-center gap-1">
                        <Thermometer aria-hidden className="size-4" /> {disk.temperature} °C
                      </span>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </section>

      <StorageExplorer />

      <DiskSpaceAnalyzer />

      <ToolSection
        embedded
        title="Diagnóstico de armazenamento"
        subtitle="Consultas SMART e de espaço executadas diretamente no Windows."
        categories={["disk"]}
      />
    </div>
  );
}
