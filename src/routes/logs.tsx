import { createFileRoute } from "@tanstack/react-router";
import { Copy, Download, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CommandFeed } from "@/components/wincare/CommandFeed";
import { actions, useStore } from "@/lib/wincare/store";
import { formatLog } from "@/lib/wincare/runner";

export const Route = createFileRoute("/logs")({
  head: () => ({
    meta: [
      { title: "Histórico e logs de execução | WinCare" },
      {
        name: "description",
        content:
          "Todas as execuções registradas com horário, comando e resultado. Exporte em TXT ou PDF e copie o log.",
      },
      { property: "og:title", content: "Histórico e logs de execução | WinCare" },
      {
        property: "og:description",
        content: "Registro completo das manutenções feitas no computador.",
      },
    ],
  }),
  component: LogsPage,
});

function LogsPage() {
  const runs = useStore((s) => s.runs);

  const fullText = runs
    .map(
      (r) =>
        `=== ${new Date(r.startedAt).toLocaleString("pt-BR")} — ${r.toolName} ===\n` +
        `Comando: ${r.command}\n${formatLog(r.lines)}\nResultado: ${r.result ?? "-"}\n`,
    )
    .join("\n");

  const exportTxt = () => {
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wincare-log-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(
      `<html><head><title>WinCare — Log</title></head><body style="font-family:monospace;white-space:pre-wrap;padding:24px">${fullText.replace(/</g, "&lt;")}</body></html>`,
    );
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Histórico de execuções — {runs.length} registro(s).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportTxt} disabled={!runs.length}>
            <Download /> Exportar TXT
          </Button>
          <Button variant="secondary" onClick={exportPdf} disabled={!runs.length}>
            <FileText /> Exportar PDF
          </Button>
          <Button
            variant="secondary"
            disabled={!runs.length}
            onClick={async () => {
              await navigator.clipboard.writeText(fullText);
              toast.success("Log completo copiado");
            }}
          >
            <Copy /> Copiar log
          </Button>
          <Button
            variant="ghost"
            disabled={!runs.length}
            onClick={() => {
              actions.clearRuns();
              toast.success("Histórico limpo");
            }}
          >
            <Trash2 /> Limpar
          </Button>
        </div>
      </header>

      {runs.length === 0 && (
        <Card className="surface-panel border-border/60 p-8 text-center text-sm text-muted-foreground">
          Nenhuma execução registrada ainda.
        </Card>
      )}

      <div className="space-y-4">
        {runs.map((run) => (
          <Card key={run.id} className="surface-panel gap-3 border-border/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{run.toolName}</p>
                <p className="font-mono text-xs text-muted-foreground">{run.command}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(run.startedAt).toLocaleString("pt-BR")}
                </span>
                <Badge
                  variant="outline"
                  className={`rounded-full ${
                    run.status === "success"
                      ? "border-success/30 bg-success/10 text-success"
                      : run.status === "error"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-primary/30 bg-primary/10 text-primary"
                  }`}
                >
                  {run.status === "success"
                    ? "Sucesso"
                    : run.status === "error"
                      ? "Erro"
                      : "Em execução"}
                </Badge>
              </div>
            </div>
            <CommandFeed
              lines={run.lines}
              running={run.status === "running"}
              status={run.status}
              result={run.result}
              toolName={run.toolName}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}
