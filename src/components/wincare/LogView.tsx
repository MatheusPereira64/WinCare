import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeCmdText } from "@/lib/wincare/commandFeed";
import type { LogLine } from "@/lib/wincare/types";
import { AppScrollArea } from "./AppScrollArea";

const kindStyle: Record<LogLine["kind"], string> = {
  info: "text-primary-glow",
  output: "text-muted-foreground",
  success: "text-success",
  error: "text-destructive",
  warn: "text-warning",
};

export function LogView({
  lines,
  className = "",
  plain = false,
}: {
  lines: LogLine[];
  className?: string;
  plain?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vp = viewportRef.current;
    if (vp) vp.scrollTop = vp.scrollHeight;
  }, [lines.length]);

  return (
    <div
      className={cn(
        "overflow-hidden bg-background/70",
        plain ? "" : "rounded-xl border border-border/60",
      )}
    >
      {!plain && (
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5">
          <Terminal className="size-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
            Saída do comando
          </span>
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {lines.length} {lines.length === 1 ? "linha" : "linhas"}
          </span>
        </div>
      )}
      <AppScrollArea
        className={cn("h-56", className)}
        viewportClassName="p-3 font-mono text-[11px] leading-relaxed"
        viewportRef={viewportRef}
        viewportLabel="Saída do comando"
      >
        {lines.map((line, i) => {
          const text = normalizeCmdText(line.text);
          if (!text) return null;
          return (
            <div key={i} className="animate-fade-in flex gap-2">
              <span className="shrink-0 text-muted-foreground">{line.time}</span>
              {/* Caminhos e URLs longos quebram em vez de forçar rolagem lateral. */}
              <span className={cn("min-w-0 [overflow-wrap:anywhere]", kindStyle[line.kind])}>
                {text}
              </span>
            </div>
          );
        })}
      </AppScrollArea>
    </div>
  );
}
