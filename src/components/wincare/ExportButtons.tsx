import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { exportTable, type ExportFormat, type ExportPayload } from "@/lib/wincare/explorer";
import { isNative } from "@/lib/wincare/bridge";

const FORMATS: { value: ExportFormat; label: string; title: string }[] = [
  { value: "xlsx", label: "Excel", title: "Planilha do Excel (.xlsx)" },
  { value: "csv", label: "CSV", title: "Planilha CSV (abre no Excel e no Google Planilhas)" },
  { value: "pdf", label: "PDF", title: "Documento PDF para imprimir ou enviar" },
  { value: "html", label: "HTML", title: "Página HTML para abrir no navegador" },
  { value: "txt", label: "Texto", title: "Texto simples (.txt)" },
];

/**
 * Exportar uma tabela: um botão por formato (sem menu suspenso — no Electron
 * evitamos portais). O arquivo é salvo pela janela "Salvar como" do Windows.
 */
export function ExportButtons({
  build,
  disabled,
  className,
}: {
  /** Monta os dados na hora do clique (sempre a lista atual). */
  build: () => Omit<ExportPayload, "format">;
  disabled?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  // No navegador (demonstração) só dá para baixar CSV.
  const formats = isNative() ? FORMATS : FORMATS.filter((f) => f.value === "csv");

  const run = async (format: ExportFormat) => {
    setBusy(format);
    try {
      const out = await exportTable({ ...build(), format });
      if (out.ok) toast.success("Arquivo exportado.", { description: out.path });
      else if (out.reason !== "cancelled") {
        toast.error("Não foi possível exportar.", { description: out.reason });
      }
    } catch (error) {
      toast.error("Não foi possível exportar.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      role="group"
      aria-label="Exportar resultado"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Download aria-hidden className="size-3.5" /> Exportar
      </span>
      {formats.map((f) => (
        <Button
          key={f.value}
          type="button"
          size="sm"
          variant="outline"
          className="h-7 rounded-full px-2.5 text-xs"
          title={f.title}
          disabled={disabled || busy !== null}
          onClick={() => void run(f.value)}
        >
          {busy === f.value && <Loader2 aria-hidden className="size-3 animate-spin" />}
          {f.label}
        </Button>
      ))}
    </div>
  );
}
