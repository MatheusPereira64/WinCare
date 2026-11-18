import { useState, useSyncExternalStore } from "react";
import { Copy, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { createRestorePoint, getNative, simulateRun } from "@/lib/wincare/bridge";
import { actions, useStore } from "@/lib/wincare/store";
import { FULL_CHECK_IDS, getTool } from "@/lib/wincare/tools";
import { formatLog, setExternalRunActive } from "@/lib/wincare/runner";
import { normalizeCmdText } from "@/lib/wincare/commandFeed";
import type { LogLine, Tool } from "@/lib/wincare/types";
import { CommandFeed } from "./CommandFeed";
import { Panel, PanelHeader } from "./Panel";
import { CheckboxCard } from "./CheckboxCard";
import { ConfirmModal } from "./ConfirmModal";

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
    const clean = normalizeCmdText(text) || text;
    updateCheck({ lines: [...checkState.lines, { time: now(), text: clean, kind }] });
  };

  const start = async () => {
    updateCheck({ running: true, progress: 0, lines: [], current: null });
    setExternalRunActive(FULL_CHECK_TOOL, true);
    push("Iniciando a verificação completa do sistema…", "info");

    if (withRestorePoint) {
      updateCheck({ current: "Ponto de restauração" });
      push("Criando ponto de restauração…", "info");
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
      push(point.message ?? "Ponto de restauração criado.", "success");
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
            push("Pedindo permissão de administrador (UAC)…", "warn");
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
        push(err instanceof Error ? err.message : "Etapa não concluída.", "error");
      }
      updateCheck({ progress: ((i + 1) / tools.length) * 100 });
    }

    push("Verificação completa finalizada.", "success");
    updateCheck({ current: null, running: false });
    setExternalRunActive(FULL_CHECK_TOOL, false);
    toast.success("Verificação completa finalizada");
  };

  return (
    <Panel padding="lg">
      <PanelHeader
        icon={ShieldCheck}
        title="Verificação completa"
        description="Executa em sequência SFC, DISM CheckHealth, ScanHealth, RestoreHealth e a verificação de disco, com uma única barra de progresso."
        actions={
          <>
            <Button onClick={() => setConfirming(true)} disabled={running} className="rounded-full">
              {running ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              {running ? "Verificando…" : "Iniciar verificação"}
            </Button>
            {lines.length > 0 && (
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={async () => {
                  await navigator.clipboard.writeText(formatLog(lines));
                  toast.success("Log copiado para a área de transferência");
                }}
              >
                <Copy /> Copiar log
              </Button>
            )}
          </>
        }
      />

      {(running || progress > 0) && (
        <div className="space-y-2">
          <Progress
            value={progress}
            className="h-2"
            aria-label="Progresso da verificação completa"
            aria-valuetext={`${Math.round(progress)}%${current ? `, etapa: ${current}` : ""}`}
          />
          <p className="text-xs text-muted-foreground">
            {current ? `Etapa atual: ${current}` : "Concluído"} — {Math.round(progress)}%
          </p>
        </div>
      )}

      {lines.length > 0 && (
        <CommandFeed lines={lines} running={running} toolName={current || "Verificação completa"} />
      )}

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
        <CheckboxCard
          checked={withRestorePoint}
          onCheckedChange={setWithRestorePoint}
          icon={ShieldCheck}
          title="Criar ponto de restauração antes"
          description="Permite desfazer pelo Restaurar Sistema caso algo dê errado."
        />
      </ConfirmModal>
    </Panel>
  );
}
