import { useEffect, useRef } from "react";
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
    <div
      ref={ref}
      className={`max-h-56 overflow-y-auto rounded-lg border border-border/60 bg-background/70 p-3 font-mono text-xs leading-relaxed ${className}`}
    >
      {lines.map((line, i) => (
        <div key={i} className="animate-fade-in flex gap-2">
          <span className="shrink-0 text-muted-foreground/60">{line.time}</span>
          <span className={kindStyle[line.kind]}>{line.text}</span>
        </div>
      ))}
    </div>
  );
}
