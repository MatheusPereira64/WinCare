import { memo, useState } from "react";
import { Brush, Copy, Gauge, HardDrive, Loader2, Network, Play, Star, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatLog, useToolRunner } from "@/lib/wincare/runner";
import { useFavorite, useStore } from "@/lib/wincare/store";
import { getCommandPreview, resolveCommand, RISK_LABEL } from "@/lib/wincare/tools";
import type { Tool, ToolCategory } from "@/lib/wincare/types";
import { ConfirmModal } from "./ConfirmModal";
import { CommandFeed } from "./CommandFeed";

const riskStyle: Record<string, string> = {
  safe: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  advanced: "border-destructive/30 bg-destructive/10 text-destructive",
};

const riskChip: Record<string, string> = {
  safe: "bg-primary/15 text-primary",
  warning: "bg-warning/15 text-warning",
  advanced: "bg-destructive/15 text-destructive",
};

const categoryIcon: Record<ToolCategory, typeof Wrench> = {
  repair: Wrench,
  cleanup: Brush,
  disk: HardDrive,
  network: Network,
  system: Gauge,
};

interface ToolCardProps {
  tool: Tool;
  confirmCritical?: boolean;
  onRequestConfirm?: (execute: () => void, command: string) => void;
}

/** Sem campo de texto no card — inputs livres travam a UI no Electron. */
function ToolCardInner({ tool, confirmCritical, onRequestConfirm }: ToolCardProps) {
  const { state, run, reset } = useToolRunner(tool);
  const { isFavorite, toggle } = useFavorite(tool.id);
  const storeConfirmCritical = useStore((s) => s.confirmCritical);
  const [confirming, setConfirming] = useState(false);
  const shouldConfirm = confirmCritical ?? storeConfirmCritical;

  const resolvedCommand = () => resolveCommand(tool);

  const execute = () => {
    void run().then((finished) => {
      if (!finished) return;
      if (finished.status === "error") {
        toast.error(finished.result || "Falha na execução");
      } else {
        toast.success(finished.result || "Concluído");
      }
    });
  };

  const start = () => {
    if (tool.requiresConfirmation && shouldConfirm) {
      if (onRequestConfirm) {
        onRequestConfirm(execute, resolvedCommand());
        return;
      }
      setConfirming(true);
      return;
    }
    execute();
  };

  const copy = async () => {
    await navigator.clipboard.writeText(formatLog(state.lines));
    toast.success("Log copiado para a área de transferência");
  };

  const CategoryIcon = categoryIcon[tool.category] ?? Wrench;

  return (
    <Card className="surface-panel hover-lift flex flex-col gap-4 border-border/50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ${riskChip[tool.risk]}`}
          >
            <CategoryIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight">{tool.name}</h3>
              <Badge variant="outline" className={`rounded-full ${riskStyle[tool.risk]}`}>
                {RISK_LABEL[tool.risk]}
              </Badge>
              {tool.requiresAdmin && (
                <Badge
                  variant="outline"
                  className="rounded-full border-border/70 text-muted-foreground"
                >
                  Administrador
                </Badge>
              )}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">{tool.description}</p>
            <code
              className="mt-3 block truncate rounded-lg border border-border/40 bg-background/50 px-2.5 py-1.5 font-mono text-xs text-muted-foreground"
              title={getCommandPreview(tool)}
            >
              {getCommandPreview(tool)}
            </code>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Favoritar ferramenta"
          onClick={toggle}
          className={`rounded-full ${isFavorite ? "text-warning" : "text-muted-foreground"}`}
        >
          <Star className={isFavorite ? "fill-current" : ""} />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={start} disabled={state.running} className="rounded-full">
          {state.running ? <Loader2 className="animate-spin" /> : <Play />}
          {state.running ? "Executando..." : tool.launcher ? "Abrir" : "Executar"}
        </Button>
        {state.running && (
          <Button type="button" variant="ghost" onClick={reset}>
            Cancelar
          </Button>
        )}
        {state.lines.length > 0 && !state.running && (
          <Button type="button" variant="secondary" onClick={copy}>
            <Copy /> Copiar log
          </Button>
        )}
      </div>

      {state.lines.length > 0 && (
        <CommandFeed
          lines={state.lines}
          running={state.running}
          status={state.status}
          result={state.result}
          toolName={tool.name}
        />
      )}

      {!onRequestConfirm && (
        <ConfirmModal
          open={confirming}
          title="Confirmar execução"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            execute();
          }}
        >
          <p>
            {tool.name} executa{" "}
            <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs">
              {resolvedCommand()}
            </code>
            .
          </p>
          {tool.requiresAdmin && <p>Pode aparecer o prompt UAC se o app não estiver elevado.</p>}
          <p>Nível de risco: {RISK_LABEL[tool.risk]}.</p>
        </ConfirmModal>
      )}
    </Card>
  );
}

export const ToolCard = memo(ToolCardInner);
