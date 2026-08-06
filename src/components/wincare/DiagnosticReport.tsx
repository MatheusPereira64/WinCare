import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNative, SIMULATED_DISK_USAGE, SIMULATED_STARTUP } from "@/lib/wincare/bridge";
import { buildDiagnosticReport, downloadOrSaveReport } from "@/lib/wincare/report";
import { useStore } from "@/lib/wincare/store";
import type { DiskDrive, SystemInfo } from "@/lib/wincare/types";

interface Props {
  system: SystemInfo;
  disks: DiskDrive[];
}

export function DiagnosticReportCard({ system, disks }: Props) {
  const runs = useStore((s) => s.runs);
  const [busy, setBusy] = useState(false);

  const exportReport = async () => {
    setBusy(true);
    try {
      const native = getNative();
      const [startup, diskUsage] = await Promise.all([
        native?.listStartup?.().catch(() => SIMULATED_STARTUP) ??
          Promise.resolve(SIMULATED_STARTUP),
        native?.diskUsage?.().catch(() => SIMULATED_DISK_USAGE) ??
          Promise.resolve(SIMULATED_DISK_USAGE),
      ]);

      const content = buildDiagnosticReport({
        system,
        disks,
        startup: Array.isArray(startup) ? startup : SIMULATED_STARTUP,
        diskUsage: Array.isArray(diskUsage) ? diskUsage : SIMULATED_DISK_USAGE,
        runs,
      });

      const name = `WinCare-relatorio-${system.hostname}-${new Date().toISOString().slice(0, 10)}.txt`;
      const out = await downloadOrSaveReport(content, name);
      if (!out.ok && out.reason === "cancelled") return;
      if (!out.ok) {
        toast.error(out.reason || "Não foi possível salvar o relatório.");
        return;
      }
      toast.success("Relatório exportado", {
        description: out.path ?? name,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar relatório.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="surface-panel gap-4 border-border/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <FileText className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Relatório de diagnóstico</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Exporta um .txt com saúde do PC, discos, pastas grandes, programas na inicialização e
              histórico recente — ideal para suporte técnico.
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => void exportReport()}
          disabled={busy}
          className="hover-lift"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          {busy ? "Gerando…" : "Exportar relatório"}
        </Button>
      </div>
    </Card>
  );
}
