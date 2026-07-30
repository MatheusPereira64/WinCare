import { useCallback, useEffect, useRef, useState } from "react";
import { getNative, simulateRun } from "./bridge";
import { actions } from "./store";
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
}

const idle: RunState = { running: false, progress: 0, lines: [], status: "idle" };
const MAX_LOG_LINES = 400;

export function useToolRunner(tool: Tool) {
  const [state, setState] = useState<RunState>(idle);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const runToken = useRef(0);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const reset = useCallback(() => {
    runToken.current += 1;
    if (timer.current) clearInterval(timer.current);
    setState(idle);
  }, []);

  const run = useCallback(
    async (rawTarget?: string) => {
      const token = ++runToken.current;
      const target = rawTarget?.trim();
      const command = resolveCommand(tool, target);
      const id = `${tool.id}-${Date.now()}`;
      const started = Date.now();
      const lines: LogLine[] = [{ time: now(), text: `Executando: ${command}`, kind: "info" }];

      setState({ running: true, progress: 4, lines, status: "running" });

      const record: RunRecord = {
        id,
        toolId: tool.id,
        toolName: tool.name,
        command,
        startedAt: started,
        status: "running",
        lines: [...lines],
        result: undefined,
      };

      const estimate = tool.estimate ?? 6000;
      timer.current = setInterval(() => {
        setState((s) => ({ ...s, progress: Math.min(94, s.progress + 100 / (estimate / 260)) }));
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
          lines.push({ time: now(), text, kind: "output" });
        }
        setState((s) => ({ ...s, lines: [...lines] }));
      };

      const push = (text: string, kind: LogLine["kind"] = "output") => {
        if (lines.length >= MAX_LOG_LINES) return;
        lines.push({ time: now(), text, kind });
        setState((s) => ({ ...s, lines: [...lines] }));
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

      let code = 0;
      let result = "";
      try {
        const native = getNative();
        let elevated = false;
        if (native && tool.requiresAdmin) {
          const isAdmin = await native.isElevated();
          elevated = !isAdmin;
          if (elevated) {
            push("Solicitando elevação via UAC (Executar como administrador)...", "warn");
          }
        }
        if (native) {
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
        if (timer.current) clearInterval(timer.current);
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
      };
      actions.upsertRun(finished);
      if (token !== runToken.current) return finished;
      setState({
        running: false,
        progress: 100,
        lines: [...lines],
        result,
        status: ok ? "success" : "error",
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
