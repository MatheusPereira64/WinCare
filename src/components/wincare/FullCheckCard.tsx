import { useRef, useState } from "react";
import { Copy, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getNative, simulateRun } from "@/lib/wincare/bridge";
import { actions } from "@/lib/wincare/store";
import { FULL_CHECK_IDS, getTool } from "@/lib/wincare/tools";
import { formatLog } from "@/lib/wincare/runner";
import type { LogLine } from "@/lib/wincare/types";
import { LogView } from "./LogView";

const now = () =>
  new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function FullCheckCard() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const buffer = useRef<LogLine[]>([]);

  const push = (text: string, kind: LogLine["kind"] = "output") => {
    buffer.current = [...buffer.current, { time: now(), text, kind }];
    setLines(buffer.current);
  };

  const start = async () => {
    setRunning(true);
    buffer.current = [];
    setLines([]);
    setProgress(0);
    push("Iniciando verificação completa do sistema...", "info");

    const tools = FULL_CHECK_IDS.map(getTool).filter(Boolean);
    const native = getNative();

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i]!;
      setCurrent(tool.name);
      push(`Executando: ${tool.command}`, "info");
      try {
        let elevated = false;
        if (native && tool.requiresAdmin) {
          const isAdmin = await native.isElevated();
          elevated = !isAdmin;
          if (elevated) {
            push("Solicitando elevação via UAC...", "warn");
          }
        }
        const out = native
          ? await native.run(
              tool.command,
              (chunk) =>
                chunk
                  .split(/\r?\n/)
                  .filter(Boolean)
                  .forEach((l) => push(l)),
              { elevated },
            )
          : await simulateRun(tool, (l) => push(l));
        push(`Resultado: ${out.result}`, out.code === 0 ? "success" : "error");
        actions.upsertRun({
          id: `${tool.id}-${Date.now()}`,
          toolId: tool.id,
          toolName: tool.name,
          command: tool.command,
          startedAt: Date.now(),
          finishedAt: Date.now(),
          status: out.code === 0 ? "success" : "error",
          lines: buffer.current.slice(-6),
          result: out.result,
        });
      } catch (err) {
        push(err instanceof Error ? err.message : "Falha na etapa.", "error");
      }
      setProgress(((i + 1) / tools.length) * 100);
    }

    setCurrent(null);
    push("Verificação completa finalizada.", "success");
    setRunning(false);
    toast.success("Verificação completa finalizada");
  };

  return (
    <Card className="surface-panel gap-4 border-primary/30 p-6 glow-ring">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/20 text-primary">
            <ShieldCheck className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Verificação Completa</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Executa em sequência SFC, DISM CheckHealth, ScanHealth, RestoreHealth, limpeza de DNS,
              reset do Winsock e verificação de disco, com uma única barra de progresso.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void start()} disabled={running} className="hover-lift">
            {running ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            {running ? "Verificando..." : "Iniciar verificação"}
          </Button>
          {lines.length > 0 && (
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(formatLog(lines));
                toast.success("Log copiado");
              }}
            >
              <Copy /> Copiar
            </Button>
          )}
        </div>
      </div>

      {(running || progress > 0) && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {current ? `Etapa atual: ${current}` : "Concluído"} — {Math.round(progress)}%
          </p>
        </div>
      )}

      {lines.length > 0 && <LogView lines={lines} className="max-h-72" />}
    </Card>
  );
}
