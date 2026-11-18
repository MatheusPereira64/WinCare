import { useMemo, useState } from "react";
import { Loader2, MemoryStick, Shield, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getNative, isNative, type MemoryOptimizeResult } from "@/lib/wincare/bridge";
import { useAdmin } from "@/lib/wincare/useAdmin";
import { useSystemInfo } from "@/lib/wincare/useSystem";
import { cn } from "@/lib/utils";
import { formatDecimal, formatGb } from "@/lib/wincare/format";
import { TONE_TEXT, usageTone } from "@/lib/wincare/tone";
import { Panel, PanelHeader } from "./Panel";
import { StatusBadge } from "./StatusBadge";

function formatGbFromMb(mb: number) {
  if (mb >= 1024) return `${formatDecimal(mb / 1024)} GB`;
  return `${Math.round(mb)} MB`;
}

function simulateOptimize(usedPct: number, totalGb: number): Promise<MemoryOptimizeResult> {
  const totalMb = Math.max(1024, Math.round(totalGb * 1024));
  const beforeUsed = Math.round((usedPct / 100) * totalMb);
  const freedMb = Math.min(beforeUsed - 200, 420 + Math.round(Math.random() * 980));
  const afterUsed = Math.max(200, beforeUsed - freedMb);
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve({
        ok: true,
        freedMb,
        trimmed: 48 + Math.round(Math.random() * 40),
        skipped: 12,
        standbyPurged: true,
        before: {
          totalMb,
          usedMb: beforeUsed,
          freeMb: totalMb - beforeUsed,
          usagePct: usedPct,
        },
        after: {
          totalMb,
          usedMb: afterUsed,
          freeMb: totalMb - afterUsed,
          usagePct: Math.round((afterUsed / totalMb) * 100),
        },
        message: `Liberou cerca de ${freedMb} MB de RAM.`,
      });
    }, 1100);
  });
}

export function MemoryOptimizerCard({ compact = false }: { compact?: boolean }) {
  const info = useSystemInfo(2500);
  const { elevated } = useAdmin();
  const native = isNative();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<MemoryOptimizeResult | null>(null);

  const usedPct = info.memoryUsage;
  const usedGb =
    typeof info.memoryUsedGb === "number"
      ? info.memoryUsedGb
      : (info.memoryUsage / 100) * (info.memoryTotalGb || 0);

  const tone = TONE_TEXT[usageTone(usedPct)];

  const hint = useMemo(() => {
    if (!native) return "Demonstração — no app desktop isso libera memória de verdade.";
    if (!elevated) return "Como administrador, também limpa a lista de espera do Windows.";
    return "Reduz a memória reservada pelos processos e a lista de espera. Não fecha programas.";
  }, [elevated, native]);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const api = getNative();
      const result = api?.optimizeMemory
        ? await api.optimizeMemory()
        : await simulateOptimize(info.memoryUsage, info.memoryTotalGb || 16);
      setLast(result);
      if (result.ok) {
        toast.success(result.message || "Memória otimizada.", {
          description:
            result.freedMb && result.freedMb > 0
              ? `${formatGbFromMb(result.freedMb)} a menos em uso`
              : undefined,
        });
      } else {
        toast.error(result.message || "Não foi possível otimizar a memória.");
      }
    } catch (error) {
      toast.error("Não foi possível otimizar a memória.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel padding={compact ? "sm" : "md"} className={compact ? "gap-3" : undefined}>
      <PanelHeader
        icon={MemoryStick}
        size="sm"
        title="Otimizar memória"
        badges={
          native &&
          elevated && (
            <StatusBadge tone="success">
              <Shield aria-hidden className="size-3" /> Administrador
            </StatusBadge>
          )
        }
        description={hint}
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={cn("text-3xl font-semibold tracking-tight tabular-nums", tone)}>
            {Math.round(usedPct)}
            <span className="text-lg text-muted-foreground">%</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {formatGb(usedGb)} de {info.memoryTotalGb || "—"} GB em uso
          </p>
        </div>
        <Button
          type="button"
          className="rounded-full px-5"
          disabled={busy}
          onClick={() => void run()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {busy ? "Otimizando…" : "Otimizar agora"}
        </Button>
      </div>

      {last?.ok && (
        <p className="text-xs text-muted-foreground">
          {last.freedMb && last.freedMb > 0 ? (
            <>
              Liberou{" "}
              <span className="font-medium text-foreground">{formatGbFromMb(last.freedMb)}</span>
              {typeof last.trimmed === "number" ? ` · ${last.trimmed} processos` : null}
              {last.standbyPurged ? " · lista de espera limpa" : null}
            </>
          ) : (
            last.message
          )}
        </p>
      )}
    </Panel>
  );
}
