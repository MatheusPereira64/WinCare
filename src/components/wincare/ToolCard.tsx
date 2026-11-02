import { memo, useState } from "react";
import {
  Brush,
  Code2,
  Copy,
  ExternalLink,
  Gauge,
  HardDrive,
  Loader2,
  Network,
  Play,
  ShieldCheck,
  Star,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatLog, useToolRunner, type RunOptions } from "@/lib/wincare/runner";
import { useFavorite, useStore } from "@/lib/wincare/store";
import { getCommandPreview, resolveCommand, RISK_LABEL } from "@/lib/wincare/tools";
import type { RunRecord, Tool, ToolCategory } from "@/lib/wincare/types";
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

/** Ciclo comum de execução: confirmação, ponto de restauração e avisos. */
function useToolAction(tool: Tool) {
  const runner = useToolRunner(tool);
  const shouldConfirm = useStore((s) => s.confirmCritical);
  const autoRestorePoint = useStore((s) => s.autoRestorePoint);
  const [confirming, setConfirming] = useState(false);

  const report = (finished: RunRecord | undefined) => {
    if (!finished) return;
    if (finished.restorePointFailed) {
      toast.error("Ponto de restauração não criado", {
        description: "Por segurança, a ação não foi executada.",
        action: {
          label: "Executar sem ponto",
          onClick: () => execute({ skipRestorePoint: true }),
        },
      });
    } else if (finished.status === "error") {
      toast.error(finished.result || "Falha na execução");
    } else {
      toast.success(finished.result || "Concluído");
    }
  };

  const execute = (options?: RunOptions) => {
    void runner.run(options).then(report);
  };

  const start = () => {
    if (tool.requiresConfirmation && shouldConfirm) {
      setConfirming(true);
      return;
    }
    execute();
  };

  return { ...runner, confirming, setConfirming, execute, start, autoRestorePoint };
}

interface ConfirmProps {
  tool: Tool;
  open: boolean;
  defaultRestorePoint: boolean;
  onCancel: () => void;
  onConfirm: (options: RunOptions) => void;
}

function ToolConfirmModal({ tool, open, defaultRestorePoint, onCancel, onConfirm }: ConfirmProps) {
  const [restorePoint, setRestorePoint] = useState(defaultRestorePoint);
  const offerRestorePoint = !!tool.restorePoint && defaultRestorePoint;

  return (
    <ConfirmModal
      open={open}
      title={tool.launcher ? `Abrir ${tool.name}?` : `Executar ${tool.name}?`}
      confirmLabel={tool.launcher ? "Abrir" : "Executar"}
      destructive={tool.risk === "advanced"}
      onCancel={onCancel}
      onConfirm={() => onConfirm({ skipRestorePoint: offerRestorePoint && !restorePoint })}
    >
      <p>{tool.description}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn("rounded-full", riskStyle[tool.risk])}>
          Risco: {RISK_LABEL[tool.risk]}
        </Badge>
        {tool.requiresAdmin && (
          <Badge variant="outline" className="rounded-full text-muted-foreground">
            O Windows pode pedir permissão (UAC)
          </Badge>
        )}
      </div>
      {offerRestorePoint && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
          <Checkbox
            checked={restorePoint}
            onCheckedChange={(v) => setRestorePoint(v === true)}
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
      )}
      <details className="text-xs">
        <summary className="cursor-pointer select-none hover:text-foreground">
          Ver comando técnico
        </summary>
        <code className="mt-2 block rounded-lg bg-muted/60 px-2.5 py-2 font-mono break-all">
          {tool.commandPreview ?? resolveCommand(tool)}
        </code>
      </details>
    </ConfirmModal>
  );
}

/** Sem campo de texto no card — inputs livres travam a UI no Electron. */
function ToolCardInner({ tool }: { tool: Tool }) {
  const { state, reset, start, execute, confirming, setConfirming, autoRestorePoint } =
    useToolAction(tool);
  const { isFavorite, toggle } = useFavorite(tool.id);
  const [showCommand, setShowCommand] = useState(false);

  const finished = !state.running && state.status !== "idle";

  const copy = async () => {
    await navigator.clipboard.writeText(formatLog(state.lines));
    toast.success("Log copiado para a área de transferência");
  };

  const CategoryIcon = categoryIcon[tool.category] ?? Wrench;

  return (
    <Card
      className={cn(
        "surface-panel hover-lift flex flex-col gap-3.5 border-border/50 p-5",
        state.running && "border-primary/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl",
              riskChip[tool.risk],
            )}
          >
            <CategoryIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="mr-1 text-[15px] font-semibold tracking-tight">{tool.name}</h3>
              <Badge variant="outline" className={cn("rounded-full", riskStyle[tool.risk])}>
                {RISK_LABEL[tool.risk]}
              </Badge>
              {tool.requiresAdmin && (
                <Badge
                  variant="outline"
                  className="rounded-full border-border/70 text-muted-foreground"
                >
                  Admin
                </Badge>
              )}
              {tool.restorePoint && autoRestorePoint && (
                <Badge
                  variant="outline"
                  className="rounded-full border-border/70 text-muted-foreground"
                  title="Cria um ponto de restauração antes de executar"
                >
                  <ShieldCheck className="size-3" /> Com ponto
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={isFavorite ? "Remover dos favoritos" : "Favoritar ferramenta"}
          aria-pressed={isFavorite}
          onClick={toggle}
          className={cn(
            "-mt-1 -mr-1 rounded-full",
            isFavorite ? "text-warning" : "text-muted-foreground",
          )}
        >
          <Star className={isFavorite ? "fill-current" : ""} />
        </Button>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          onClick={start}
          disabled={state.running}
          className="rounded-full px-4"
        >
          {state.running ? (
            <Loader2 className="animate-spin" />
          ) : tool.launcher ? (
            <ExternalLink />
          ) : (
            <Play />
          )}
          {state.running ? "Executando…" : tool.launcher ? "Abrir" : "Executar"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-expanded={showCommand}
          onClick={() => setShowCommand((v) => !v)}
          className="rounded-full text-muted-foreground"
        >
          <Code2 /> Comando
        </Button>
        {finished && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={copy}
            className="rounded-full text-muted-foreground"
          >
            <Copy /> Copiar
          </Button>
        )}
        {finished && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={reset}
            className="rounded-full text-muted-foreground"
          >
            <X /> Limpar
          </Button>
        )}
      </div>

      {showCommand && (
        <code
          className="animate-fade-in block rounded-lg border border-border/40 bg-background/50 px-2.5 py-1.5 font-mono text-xs break-all text-muted-foreground"
          title={getCommandPreview(tool)}
        >
          {getCommandPreview(tool)}
        </code>
      )}

      {state.lines.length > 0 && (
        <CommandFeed
          lines={state.lines}
          running={state.running}
          status={state.status}
          result={state.result}
          toolName={tool.name}
        />
      )}

      {state.running && (
        <div className="animate-fade-in">
          <p className="text-xs text-muted-foreground">
            Pode trocar de página: a execução continua em segundo plano.
          </p>
        </div>
      )}

      <ToolConfirmModal
        key={String(confirming)}
        tool={tool}
        open={confirming}
        defaultRestorePoint={autoRestorePoint}
        onCancel={() => setConfirming(false)}
        onConfirm={(options) => {
          setConfirming(false);
          execute(options);
        }}
      />
    </Card>
  );
}

export const ToolCard = memo(ToolCardInner);

/** Versão compacta para atalhos e ações de um clique (consoles, energia). */
function ToolTileInner({ tool }: { tool: Tool }) {
  const { state, start, execute, confirming, setConfirming, autoRestorePoint } =
    useToolAction(tool);
  const CategoryIcon = tool.launcher ? ExternalLink : categoryIcon[tool.category];

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={state.running}
        title={tool.description}
        className={cn(
          "surface-panel hover-lift group flex w-full items-center gap-3 rounded-2xl border border-border/50 bg-card p-3.5 text-left",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-70",
        )}
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            riskChip[tool.risk],
          )}
        >
          {state.running ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CategoryIcon className="size-4" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{tool.name}</span>
          <span className="line-clamp-2 text-xs text-muted-foreground">{tool.description}</span>
        </span>
      </button>
      <ToolConfirmModal
        key={String(confirming)}
        tool={tool}
        open={confirming}
        defaultRestorePoint={autoRestorePoint}
        onCancel={() => setConfirming(false)}
        onConfirm={(options) => {
          setConfirming(false);
          execute(options);
        }}
      />
    </>
  );
}

export const ToolTile = memo(ToolTileInner);
