import { useCallback, useEffect, useRef, useState } from "react";
import { getNative, simulateRun } from "./bridge";
import { actions } from "./store";
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

export function useToolRunner(tool: Tool) {
  const [state, setState] = useState<RunState>(idle);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const run = useCallback(
    async (target?: string) => {
      const command = target ? tool.command.replace(/[^ ]+$/, target) : tool.command;
      const id = `${tool.id}-${Date.now()}`;
      const started = Date.now();
      const lines: LogLine[] = [
        { time: now(), text: `Executando: ${command}`, kind: "info" },
        ...(tool.requiresAdmin
          ? [{ time: now(), text: "Elevando privilégios de Administrador...", kind: "warn" as const }]
          : []),
      ];

      setState({ running: true, progress: 4, lines, status: "running" });

      const record: RunRecord = {
        id,
        toolId: tool.id,
        toolName: tool.name,
        command,
        startedAt: started,
        status: "running",
        lines,
        result: undefined,
      };
      actions.upsertRun(record);

      const estimate = tool.estimate ?? 6000;
      timer.current = setInterval(() => {
        setState((s) => ({ ...s, progress: Math.min(94, s.progress + 100 / (estimate / 260)) }));
      }, 260);

      const push = (text: string, kind: LogLine["kind"] = "output") => {
        const line = { time: now(), text, kind };
        lines.push(line);
        setState((s) => ({ ...s, lines: [...lines] }));
      };

      let code = 0;
      let result = "";
      try {
        const native = getNative();
        const out = native
          ? await native.run(command, (chunk) =>
              chunk
                .split(/\r?\n/)
                .filter(Boolean)
                .forEach((l) => push(l)),
            )
          : await simulateRun({ ...tool, command }, (l) => push(l));
        code = out.code;
        result = out.result;
      } catch (err) {
        code = 1;
        result = err instanceof Error ? err.message : "Falha ao executar o comando.";
      }

      if (timer.current) clearInterval(timer.current);

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

  return { state, run, reset: () => setState(idle) };
}

export function formatLog(lines: LogLine[]) {
  return lines.map((l) => `[${l.time}] ${l.text}`).join("\n");
}
