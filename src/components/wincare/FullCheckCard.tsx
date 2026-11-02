import { useState, useSyncExternalStore } from "react";
import { Copy, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { createRestorePoint, getNative, simulateRun } from "@/lib/wincare/bridge";
import { actions, useStore } from "@/lib/wincare/store";
import { FULL_CHECK_IDS, getTool } from "@/lib/wincare/tools";
import { formatLog, setExternalRunActive } from "@/lib/wincare/runner";
import type { LogLine, Tool } from "@/lib/wincare/types";
import { ConfirmModal } from "./ConfirmModal";
import { LogView } from "./LogView";

const now = () =>
  new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const FULL_CHECK_TOOL: Tool = {
  id: "full-check",
  name: "Verificação completa",
  description: "SFC, DISM e verificação de disco em sequência.",
  command: "",
  category: "repair",
  risk: "warning",
};

interface CheckState {
  running: boolean;
  progress: number;
  lines: LogLine[];
  current: string | null;
}

/* Fora do componente: a verificação leva até 1 hora e continua ao trocar de página. */
let checkState: CheckState = { running: false, progress: 0, lines: [], current: null };
const checkListeners = new Set<() => void>();

const subscribeCheck = (listener: () => void) => {
  checkListeners.add(listener);
  return () => checkListeners.delete(listener);
};

function updateCheck(next: Partial<CheckState>) {
  checkState = { ...checkState, ...next };
  checkListeners.forEach((l) => l());
}

export function FullCheckCard() {
  const { running, progress, lines, current } = useSyncExternalStore(
    subscribeCheck,
    () => checkState,
    () => checkState,
  );
  const [confirming, setConfirming] = useState(false);
  const autoRestorePoint = useStore((s) => s.autoRestorePoint);
  const [withRestorePoint, setWithRestorePoint] = useState(autoRestorePoint);

  const push = (text: string, kind: LogLine["kind"] = "output") => {
    updateCheck({ lines: [...checkState.lines, { time: now(), text, kind }] });
  };

  const start = async () => {
    updateCheck({ running: true, progress: 0, lines: [], current: null });
    setExternalRunActive(FULL_CHECK_TOOL, true);
    push("Iniciando verificação completa do sistema...", "info");

    if (withRestorePoint) {
      updateCheck({ current: "Ponto de restauração" });
      push("Criando ponto de restauração...", "info");
      const point = await createRestorePoint("verificação completa");
      if (!point.ok) {
        push(`Verificação não iniciada: ${point.message ?? "falha no ponto."}`, "error");
        toast.error("Ponto de restauração não criado", {
          description: "Por segurança, nada foi executado. Desmarque a opção para seguir sem ele.",
        });
        updateCheck({ current: null, running: false });
        setExternalRunActive(FULL_CHECK_TOOL, false);
        return;
      }
      push(point.message ?? "Ponto de restauração pronto.", "success");
    }

    const tools = FULL_CHECK_IDS.map(getTool).filter(Boolean);
    const native = getNative();

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i]!;
      updateCheck({ current: tool.name });
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
              { elevated, timeoutMs: tool.timeoutMs },
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
          lines: checkState.lines.slice(-6),
          result: out.result,
        });
      } catch (err) {
        push(err instanceof Error ? err.message : "Falha na etapa.", "error");
      }
      updateCheck({ progress: ((i + 1) / tools.length) * 100 });
    }

    push("Verificação completa finalizada.", "success");
    updateCheck({ current: null, running: false });
    setExternalRunActive(FULL_CHECK_TOOL, false);
    toast.success("Verificação completa finalizada");
  };

  return (
    <Card className="hero-panel gap-4 border-primary/25 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/20 text-primary glow-ring">
            <ShieldCheck className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Verificação Completa</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Executa em sequência SFC, DISM CheckHealth, ScanHealth, RestoreHealth e verificação de
              disco, com uma única barra de progresso.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setConfirming(true)} disabled={running} className="rounded-full">
            {running ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            {running ? "Verificando..." : "Iniciar verificação"}
          </Button>
          {lines.length > 0 && (
            <Button
              variant="secondary"
              className="rounded-full"
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

      {lines.length > 0 && <LogView lines={lines} className="h-72" />}

      <ConfirmModal
        open={confirming}
        title="Iniciar verificação completa?"
        confirmLabel="Iniciar"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void start();
        }}
      >
        <p>
          Roda SFC, DISM (incluindo o reparo da imagem) e verificação de disco, em sequência. Pode
          levar de 30 minutos a mais de 1 hora; dá para continuar usando o PC.
        </p>
        <p>O Windows pode pedir permissão de administrador em cada etapa.</p>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
          <Checkbox
            checked={withRestorePoint}
            onCheckedChange={(v) => setWithRestorePoint(v === true)}
            className="mt-0.5"
          />
          <span>
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <ShieldCheck className="size-4 text-success" /> Criar ponto de restauração antes
            </span>
            <span className="mt-0.5 block text-xs">
              Permite desfazer pelo Restaurar Sistema caso algo dê errado.
            </span>
          </span>
        </label>
      </ConfirmModal>
    </Card>
  );
}
