import { createFileRoute } from "@tanstack/react-router";
import { HardDrive, Thermometer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DiskSpaceAnalyzer } from "@/components/wincare/DiskSpaceAnalyzer";
import { ToolSection } from "@/components/wincare/ToolSection";
import { useDisks } from "@/lib/wincare/useSystem";

export const Route = createFileRoute("/disco")({
  head: () => ({
    meta: [
      { title: "Integridade e saúde dos discos | WinCare" },
      {
        name: "description",
        content: "Status SMART, espaço livre, análise de pastas grandes e limpeza direcionada.",
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
  const disks = useDisks();

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Disco</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Integridade das unidades instaladas, espaço disponível e pastas que mais ocupam.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          {disks.map((disk) => {
            const used = Math.round(((disk.totalGb - disk.freeGb) / disk.totalGb) * 100);
            return (
              <Card key={disk.letter} className="surface-panel gap-4 border-border/60 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <HardDrive className="size-5" />
                    </span>
                    <div>
                      <p className="font-semibold">
                        {disk.letter} — {disk.model}
                      </p>
                      <p className="text-xs text-muted-foreground">{disk.type}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`rounded-full ${
                      disk.smart === "OK"
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    }`}
                  >
                    SMART {disk.smart}
                  </Badge>
                </div>

                <Progress value={used} className="h-2" />
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    {disk.freeGb} GB livres de {disk.totalGb} GB ({used}% usado)
                  </span>
                  {typeof disk.temperature === "number" && (
                    <span className="flex items-center gap-1">
                      <Thermometer className="size-4" /> {disk.temperature} °C
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <DiskSpaceAnalyzer />

      <ToolSection
        title="Diagnóstico de armazenamento"
        subtitle="Consultas SMART e de espaço executadas diretamente no Windows."
        categories={["disk"]}
      />
    </div>
  );
}
