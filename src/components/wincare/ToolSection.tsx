import { useMemo, useState } from "react";
import { Search, TriangleAlert } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TOOLS, getCommandPreview, RISK_LABEL } from "@/lib/wincare/tools";
import { useStore } from "@/lib/wincare/store";
import type { Tool, ToolCategory } from "@/lib/wincare/types";
import { ToolCard } from "./ToolCard";

interface Props {
  title: string;
  subtitle: string;
  categories: ToolCategory[];
  developmentBadge?: string;
}

export function ToolSection({ title, subtitle, categories, developmentBadge }: Props) {
  const [query, setQuery] = useState("");
  const [pendingExecute, setPendingExecute] = useState<(() => void) | null>(null);
  const [pendingTool, setPendingTool] = useState<Tool | null>(null);
  const confirmCritical = useStore((s) => s.confirmCritical);

  const tools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOOLS.filter((t) => categories.includes(t.category)).filter(
      (t) =>
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        getCommandPreview(t).toLowerCase().includes(q) ||
        t.command.toLowerCase().includes(q),
    );
  }, [categories, query]);

  const requestConfirm = (tool: Tool, execute: () => void) => {
    setPendingTool(tool);
    setPendingExecute(() => execute);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {developmentBadge && (
              <Badge
                variant="outline"
                className="border-warning/40 bg-warning/10 text-warning"
                title="Funcionalidade instável — correções em andamento"
              >
                {developmentBadge}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar ferramenta (Ctrl + K)"
            className="pl-9"
            data-wincare-search
          />
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        {tools.map((tool) => (
          <ToolCard
            key={tool.id}
            tool={tool}
            confirmCritical={confirmCritical}
            onRequestConfirm={(execute) => requestConfirm(tool, execute)}
          />
        ))}
      </div>

      {tools.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma ferramenta encontrada.</p>
      )}

      {pendingTool && pendingExecute && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setPendingTool(null);
              setPendingExecute(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <TriangleAlert className="size-5 text-warning" /> Confirmar execução
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    {pendingTool.name} executa{" "}
                    <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs">
                      {getCommandPreview(pendingTool)}
                    </code>
                    .
                  </p>
                  {pendingTool.requiresAdmin && (
                    <p>
                      Será exibido o prompt UAC (Executar como administrador) se o app não estiver
                      elevado.
                    </p>
                  )}
                  <p>
                    Nível de risco: {RISK_LABEL[pendingTool.risk]}. Feche seus trabalhos antes de
                    continuar — algumas ações exigem reiniciar o computador.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  pendingExecute();
                  setPendingTool(null);
                  setPendingExecute(null);
                }}
              >
                Executar mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
