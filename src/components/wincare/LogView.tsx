import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LogLine } from "@/lib/wincare/types";

const kindStyle: Record<LogLine["kind"], string> = {
  info: "text-primary-glow",
  output: "text-muted-foreground",
  success: "text-success",
  error: "text-destructive",
  warn: "text-warning",
};

export function LogView({ lines, className = "" }: { lines: LogLine[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines.length]);

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-background/70">
      <div className="flex items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-1.5">
        <Terminal className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
          Saída do comando
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/60">
          {lines.length} {lines.length === 1 ? "linha" : "linhas"}
        </span>
      </div>
      <div
        ref={ref}
        className={cn("max-h-56 overflow-y-auto p-3 font-mono text-xs leading-relaxed", className)}
      >
        {lines.map((line, i) => (
          <div key={i} className="animate-fade-in flex gap-2">
            <span className="shrink-0 text-muted-foreground/50">{line.time}</span>
            <span className={kindStyle[line.kind]}>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
