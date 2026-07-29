import { useState } from "react";
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
import { RISK_LABEL } from "@/lib/wincare/tools";
import type { Tool } from "@/lib/wincare/types";
import { LogView } from "./LogView";

const riskStyle: Record<string, string> = {
  safe: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  advanced: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function ToolCard({ tool }: { tool: Tool }) {
  const { state, run } = useToolRunner(tool);
  const { isFavorite, toggle } = useFavorite(tool.id);
  const confirmCritical = useStore((s) => s.confirmCritical);
  const [target, setTarget] = useState(tool.input?.defaultValue ?? "");
  const [confirming, setConfirming] = useState(false);

  const start = () => {
    if (tool.requiresConfirmation && confirmCritical) {
      setConfirming(true);
      return;
    }
    void run(target || undefined);
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
          <code className="mt-3 block truncate rounded-md bg-muted/60 px-2 py-1 font-mono text-xs text-muted-foreground">
            {tool.command}
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

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-warning" /> Confirmar execução
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tool.name} executa <span className="font-mono">{tool.command}</span> com privilégios
              elevados. Nível de risco: {RISK_LABEL[tool.risk]}. Feche seus trabalhos antes de
              continuar — algumas ações exigem reiniciar o computador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void run(target || undefined)}>
              Executar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
