import { useCallback, useSyncExternalStore } from "react";
import { createRestorePoint, getNative, simulateRun } from "./bridge";
import { normalizeCmdText } from "./commandFeed";
import { actions, getStoreState } from "./store";
import { resolveCommand } from "./tools";
import type { LogLine, RunRecord, Tool } from "./types";

const now = () =>
  new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export interface RunState {
  running: boolean;
  progress: number;
  lines: LogLine[];
  result?: string;
  status: "idle" | "running" | "success" | "error";
  /** Quando a execução começou (para mostrar o tempo decorrido). */
  startedAt?: number;
}

export interface RunOptions {
  /** O usuário escolheu seguir sem ponto de restauração nesta execução. */
  skipRestorePoint?: boolean;
}

const idle: RunState = { running: false, progress: 0, lines: [], status: "idle" };
const MAX_LOG_LINES = 400;

/**
 * Estado por ferramenta fora dos componentes: o comando continua rodando ao trocar de
 * página, então o progresso precisa continuar visível quando o usuário volta.
 */
const runStates = new Map<string, RunState>();
const runTokens = new Map<string, number>();
const listeners = new Set<() => void>();
let activeRuns: { tool: Tool; state: RunState }[] = [];
const activeTools = new Map<string, Tool>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function setRunState(tool: Tool, update: RunState | ((prev: RunState) => RunState)) {
  const prev = runStates.get(tool.id) ?? idle;
  const next = typeof update === "function" ? update(prev) : update;
  runStates.set(tool.id, next);
  if (next.running) activeTools.set(tool.id, tool);
  else activeTools.delete(tool.id);
  activeRuns = [...activeTools.values()].map((t) => ({
    tool: t,
    state: runStates.get(t.id) ?? idle,
  }));
  listeners.forEach((l) => l());
}

const getActiveRuns = () => activeRuns;
const emptyRuns: { tool: Tool; state: RunState }[] = [];

/** Ferramentas em execução em qualquer página. */
export function useActiveRuns() {
  return useSyncExternalStore(subscribe, getActiveRuns, () => emptyRuns);
}

/** Mostra no indicador global uma tarefa que não passa por `useToolRunner`. */
export function setExternalRunActive(tool: Tool, active: boolean) {
  setRunState(tool, active ? { ...idle, running: true, status: "running" } : idle);
}

export function useToolRunner(tool: Tool) {
  const state = useSyncExternalStore(
    subscribe,
    () => runStates.get(tool.id) ?? idle,
    () => idle,
  );

  const reset = useCallback(() => {
    if ((runStates.get(tool.id) ?? idle).running) return;
    setRunState(tool, idle);
  }, [tool]);

  const run = useCallback(
    async (options: RunOptions = {}) => {
      if ((runStates.get(tool.id) ?? idle).running) return undefined;
      const token = (runTokens.get(tool.id) ?? 0) + 1;
      runTokens.set(tool.id, token);
      const command = resolveCommand(tool);
      const id = `${tool.id}-${Date.now()}`;
      const started = Date.now();
      const lines: LogLine[] = [
        {
          time: now(),
          text: `Executando: ${tool.commandPreview ?? command}`,
          kind: "info",
        },
      ];

      setRunState(tool, {
        running: true,
        progress: 4,
        lines,
        status: "running",
        startedAt: started,
      });

      const record: RunRecord = {
        id,
        toolId: tool.id,
        toolName: tool.name,
        command: tool.commandPreview ?? command,
        startedAt: started,
        status: "running",
        lines: [...lines],
        result: undefined,
      };

      const estimate = tool.estimate ?? 6000;
      const timer = setInterval(() => {
        setRunState(tool, (s) => ({
          ...s,
          progress: Math.min(94, s.progress + 100 / (estimate / 260)),
        }));
      }, 260);

      // Deixa a UI renderizar "Executando..." antes do IPC.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 30));

      const pendingChunkLines: string[] = [];
      let chunkFrame: number | null = null;

      const flushChunkLines = () => {
        chunkFrame = null;
        if (!pendingChunkLines.length || lines.length >= MAX_LOG_LINES) return;
        const batch = pendingChunkLines.splice(0, MAX_LOG_LINES - lines.length);
        for (const text of batch) {
          const clean = normalizeCmdText(text);
          if (!clean) continue;
          lines.push({ time: now(), text: clean, kind: "output" });
        }
        setRunState(tool, (s) => ({ ...s, lines: [...lines] }));
      };

      const push = (text: string, kind: LogLine["kind"] = "output") => {
        if (lines.length >= MAX_LOG_LINES) return;
        const clean = normalizeCmdText(text) || text;
        lines.push({ time: now(), text: clean, kind });
        setRunState(tool, (s) => ({ ...s, lines: [...lines] }));
      };

      const pushChunk = (chunk: string) => {
        if (lines.length >= MAX_LOG_LINES) return;
        pendingChunkLines.push(
          ...chunk
            .split(/\r?\n/)
            .filter(Boolean)
            .slice(0, MAX_LOG_LINES - lines.length - pendingChunkLines.length),
        );
        if (!pendingChunkLines.length || chunkFrame !== null) return;
        chunkFrame = requestAnimationFrame(flushChunkLines);
      };

      let code: number;
      let result: string;
      let restorePointFailed = false;
      try {
        const native = getNative();

        if (tool.restorePoint && getStoreState().autoRestorePoint && !options.skipRestorePoint) {
          push("Criando ponto de restauração antes de continuar...", "info");
          const point = await createRestorePoint(tool.name);
          if (!point.ok) {
            restorePointFailed = true;
            throw new Error(
              `Ação não executada: o ponto de restauração falhou. ${point.message ?? ""}`.trim(),
            );
          }
          push(point.message ?? "Ponto de restauração pronto.", "success");
        }

        if (tool.nativeAction === "restore-point") {
          const point = await createRestorePoint("ponto manual");
          code = point.ok ? 0 : 1;
          result = point.message ?? (point.ok ? "Ponto de restauração criado." : "Falha.");
        } else if (native) {
          let elevated = false;
          if (tool.requiresAdmin) {
            const isAdmin = await native.isElevated();
            elevated = !isAdmin;
            if (elevated) {
              push("Solicitando elevação via UAC (Executar como administrador)...", "warn");
            }
          }
          const out = await native.run(command, (chunk) => pushChunk(chunk), {
            elevated,
            timeoutMs: tool.timeoutMs,
          });
          code = out.code;
          result = out.result;
        } else {
          const out = await simulateRun({ ...tool, command }, (l) => push(l));
          code = out.code;
          result = out.result;
        }
      } catch (err) {
        code = 1;
        result = err instanceof Error ? err.message : "Falha ao executar o comando.";
        console.error("[WinCare] falha ao executar", tool.id, err);
      } finally {
        clearInterval(timer);
        if (chunkFrame !== null) cancelAnimationFrame(chunkFrame);
        flushChunkLines();
      }

      const ok = code === 0;
      push(`Resultado: ${result}`, ok ? "success" : "error");
      const finished: RunRecord = {
        ...record,
        finishedAt: Date.now(),
        status: ok ? "success" : "error",
        lines: [...lines],
        result,
        restorePointFailed,
      };
      actions.upsertRun(finished);
      if (token !== runTokens.get(tool.id)) return finished;
      setRunState(tool, {
        running: false,
        progress: 100,
        lines: [...lines],
        result,
        status: ok ? "success" : "error",
        startedAt: started,
      });
      return finished;
    },
    [tool],
  );

  return { state, run, reset };
}

export function formatLog(lines: LogLine[]) {
  return lines.map((l) => `[${l.time}] ${l.text}`).join("\n");
}
