import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileText,
  ScrollText,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ChoiceChips } from "@/components/wincare/ChoiceChips";
import { CommandFeed } from "@/components/wincare/CommandFeed";
import { EmptyState } from "@/components/wincare/EmptyState";
import { PageHeader } from "@/components/wincare/PageHeader";
import { cn } from "@/lib/utils";
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

type LogFilter = "all" | "success" | "error";

function formatDuration(run: { startedAt: number; finishedAt?: number }) {
  if (!run.finishedAt) return null;
  const seconds = Math.max(0, Math.round((run.finishedAt - run.startedAt) / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function LogsPage() {
  const runs = useStore((s) => s.runs);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const errorCount = useMemo(() => runs.filter((r) => r.status === "error").length, [runs]);
  const visible = useMemo(
    () => (filter === "all" ? runs : runs.filter((r) => r.status === filter)),
    [runs, filter],
  );

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
      <PageHeader
        icon={ScrollText}
        title="Logs"
        subtitle="O que foi executado neste computador, quando e com qual resultado."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={exportTxt} disabled={!runs.length}>
              <Download /> TXT
            </Button>
            <Button variant="secondary" size="sm" onClick={exportPdf} disabled={!runs.length}>
              <FileText /> PDF
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!runs.length}
              onClick={async () => {
                await navigator.clipboard.writeText(fullText);
                toast.success("Log completo copiado");
              }}
            >
              <Copy /> Copiar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!runs.length}
              onClick={() => {
                actions.clearRuns();
                toast.success("Histórico limpo");
              }}
            >
              <Trash2 /> Limpar
            </Button>
          </>
        }
      />

      {runs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Nenhuma execução registrada ainda"
          description="Quando você executar uma ferramenta, o resultado e a saída completa aparecem aqui."
        />
      ) : (
        <>
          <ChoiceChips
            label="Filtrar execuções"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `Todas (${runs.length})` },
              { value: "success", label: `Sucesso (${runs.length - errorCount})` },
              { value: "error", label: `Com erro (${errorCount})` },
            ]}
          />
          {visible.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nenhuma execução neste filtro" />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/60">
              <ul className="divide-y divide-border/40">
                {visible.map((run) => {
                  const open = expanded === run.id;
                  const duration = formatDuration(run);
                  return (
                    <li key={run.id}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? null : run.id)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                      >
                        {run.status === "error" ? (
                          <XCircle className="size-4 shrink-0 text-destructive" />
                        ) : (
                          <CheckCircle2 className="size-4 shrink-0 text-success" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{run.toolName}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {run.result ?? run.command}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                          {new Date(run.startedAt).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                          {duration && <span className="block">{duration}</span>}
                        </span>
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-transform",
                            open && "rotate-180",
                          )}
                        />
                      </button>
                      {open && (
                        <div className="animate-fade-in space-y-2 px-4 pb-4">
                          <code className="block font-mono text-xs break-all text-muted-foreground">
                            {run.command}
                          </code>
                          <CommandFeed
                            lines={run.lines}
                            running={run.status === "running"}
                            status={run.status}
                            result={run.result}
                            toolName={run.toolName}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
