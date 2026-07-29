import { memo, useState } from "react";
import { Copy, Loader2, Play, Star, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatLog, useToolRunner } from "@/lib/wincare/runner";
import { useFavorite, useStore } from "@/lib/wincare/store";
import { getCommandPreview, RISK_LABEL } from "@/lib/wincare/tools";
import type { Tool } from "@/lib/wincare/types";
import { LogView } from "./LogView";

const riskStyle: Record<string, string> = {
  safe: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  advanced: "border-destructive/40 bg-destructive/10 text-destructive",
};

interface ToolCardProps {
  tool: Tool;
  confirmCritical?: boolean;
  onRequestConfirm?: (execute: () => void) => void;
}

function ToolCardInner({ tool, confirmCritical, onRequestConfirm }: ToolCardProps) {
  const { state, run, reset } = useToolRunner(tool);
  const { isFavorite, toggle } = useFavorite(tool.id);
  const storeConfirmCritical = useStore((s) => s.confirmCritical);
  const [target, setTarget] = useState(tool.input?.defaultValue ?? "");
  const [confirming, setConfirming] = useState(false);
  const shouldConfirm = confirmCritical ?? storeConfirmCritical;

  const execute = () => {
    void run(target || undefined);
  };

  const start = () => {
    if (tool.requiresConfirmation && shouldConfirm) {
      if (onRequestConfirm) {
        onRequestConfirm(execute);
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

  return (
    <Card className="surface-panel gap-4 border-border/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{tool.name}</h3>
            <Badge variant="outline" className={riskStyle[tool.risk]}>
              {RISK_LABEL[tool.risk]}
            </Badge>
            {tool.requiresAdmin && (
              <Badge variant="outline" className="border-border/70 text-muted-foreground">
                Administrador
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{tool.description}</p>
          <code
            className="mt-3 block truncate rounded-md bg-muted/60 px-2 py-1 font-mono text-xs text-muted-foreground"
            title={tool.command}
          >
            {getCommandPreview(tool)}
          </code>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Favoritar ferramenta"
          onClick={toggle}
          className={isFavorite ? "text-warning" : "text-muted-foreground"}
        >
          <Star className={isFavorite ? "fill-current" : ""} />
        </Button>
      </div>

      {tool.input && (
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground" htmlFor={`${tool.id}-input`}>
            {tool.input.label}
          </label>
          <Input
            id={`${tool.id}-input`}
            value={target}
            placeholder={tool.input.placeholder}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={start} disabled={state.running} className="hover-lift">
          {state.running ? <Loader2 className="animate-spin" /> : <Play />}
          {state.running ? "Executando..." : tool.launcher ? "Abrir" : "Executar"}
        </Button>
        {state.running && (
          <Button variant="ghost" onClick={reset}>
            Cancelar
          </Button>
        )}
        {state.lines.length > 0 && (
          <Button variant="secondary" onClick={copy}>
            <Copy /> Copiar log
          </Button>
        )}
      </div>

      {(state.running || state.progress > 0) && (
        <Progress value={state.progress} className="h-1.5" />
      )}

      {state.lines.length > 0 && <LogView lines={state.lines} />}

      {state.result && !state.running && (
        <p
          className={`text-sm font-medium ${state.status === "error" ? "text-destructive" : "text-success"}`}
        >
          {state.result}
        </p>
      )}

      {!onRequestConfirm && confirming && (
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <TriangleAlert className="size-5 text-warning" /> Confirmar execução
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    {tool.name} executa{" "}
                    <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs">
                      {getCommandPreview(tool)}
                    </code>
                    .
                  </p>
                  {tool.requiresAdmin && (
                    <p>
                      Será exibido o prompt UAC (Executar como administrador) se o app não estiver
                      elevado.
                    </p>
                  )}
                  <p>
                    Nível de risco: {RISK_LABEL[tool.risk]}. Feche seus trabalhos antes de continuar
                    — algumas ações exigem reiniciar o computador.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirming(false);
                  execute();
                }}
              >
                Executar mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  );
}

export const ToolCard = memo(ToolCardInner);
