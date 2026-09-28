import { useMemo, useState } from "react";
import { Loader2, MemoryStick, Shield, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNative, isNative, type MemoryOptimizeResult } from "@/lib/wincare/bridge";
import { useAdmin } from "@/lib/wincare/useAdmin";
import { useSystemInfo } from "@/lib/wincare/useSystem";
import { cn } from "@/lib/utils";

function formatGbFromMb(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
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

  const tone = usedPct >= 85 ? "text-destructive" : usedPct >= 70 ? "text-warning" : "text-primary";

  const hint = useMemo(() => {
    if (!native) return "Demonstração — no app desktop isso libera RAM de verdade.";
    if (!elevated) return "Como administrador, também limpa a lista de espera do Windows.";
    return "Reduz o working set dos processos e a lista de espera. Não fecha programas.";
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
      toast.error(error instanceof Error ? error.message : "Falha ao otimizar a memória.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={cn("surface-panel border-border/60", compact ? "gap-3 p-4" : "gap-4 p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <MemoryStick className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">Otimizar memória</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
          </div>
        </div>
        {native && elevated && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
            <Shield className="size-3" />
            Admin
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={cn("text-3xl font-semibold tracking-tight tabular-nums", tone)}>
            {Math.round(usedPct)}
            <span className="text-lg text-muted-foreground">%</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {usedGb.toFixed(1)} / {info.memoryTotalGb || "—"} GB em uso
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
    </Card>
  );
}
