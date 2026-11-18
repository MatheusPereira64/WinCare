import { useEffect, useId, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, CircleAlert, Loader2, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { interpretCommandFeed } from "@/lib/wincare/commandFeed";
import type { LogLine } from "@/lib/wincare/types";
import { TONE_SOFT, type Tone } from "@/lib/wincare/tone";
import { LogView } from "./LogView";

interface Props {
  lines: LogLine[];
  running?: boolean;
  status?: string;
  result?: string;
  toolName?: string;
  className?: string;
}

const toneIcon = {
  running: Loader2,
  success: CheckCircle2,
  error: CircleAlert,
  info: Radio,
};

const FEED_TONE: Record<keyof typeof toneIcon, Tone> = {
  running: "primary",
  success: "success",
  error: "danger",
  info: "neutral",
};
const toneChip = {
  running: TONE_SOFT[FEED_TONE.running],
  success: TONE_SOFT[FEED_TONE.success],
  error: TONE_SOFT[FEED_TONE.error],
  info: TONE_SOFT[FEED_TONE.info],
};

export function CommandFeed({ lines, running, status, result, toolName, className }: Props) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const insight = useMemo(
    () => interpretCommandFeed(lines, { running, status, result, toolName }),
    [lines, running, status, result, toolName],
  );
  const Icon = toneIcon[insight.tone];

  useEffect(() => {
    if (running) setOpen(false);
  }, [running]);

  return (
    <div
      className={`overflow-hidden rounded-xl border border-border/60 bg-background/70 ${className ?? ""}`}
    >
      {/* Anuncia só a mudança de estado (início, conclusão, falha), não cada %. */}
      <p role="status" className="sr-only">
        {toolName ? `${toolName}: ` : ""}
        {insight.label}
      </p>
      <div className="flex items-start gap-3 p-4">
        <span
          aria-hidden
          className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${toneChip[insight.tone]}`}
        >
          <Icon className={`size-4 ${insight.tone === "running" ? "animate-spin" : ""}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Status da operação
              </p>
              <p className="mt-0.5 font-medium tracking-tight">{insight.title}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${toneChip[insight.tone]}`}
              >
                {insight.label}
              </span>
              {typeof insight.progress === "number" && (
                <span className="text-sm tabular-nums text-muted-foreground">
                  {insight.progress}%
                </span>
              )}
            </div>
          </div>
          {insight.phase && (
            <p className="mt-1 text-xs font-medium text-primary-glow">{insight.phase}</p>
          )}
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{insight.message}</p>
          {typeof insight.progress === "number" && running && (
            <Progress
              value={insight.progress}
              className="mt-3 h-1.5"
              aria-label={`Progresso: ${toolName ?? insight.title}`}
            />
          )}
        </div>
      </div>

      <div className="border-t border-border/60 px-3 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-between px-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
        >
          Detalhes técnicos
          <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </div>

      {open && (
        <div id={detailsId} className="border-t border-border/60">
          <LogView lines={lines} className="h-44 rounded-none border-0" plain />
        </div>
      )}
    </div>
  );
}
