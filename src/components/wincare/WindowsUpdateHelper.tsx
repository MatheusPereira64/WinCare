import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, ExternalLink, History, RefreshCcwDot, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { openWindowsTarget } from "@/lib/wincare/bridge";
import { formatDecimal, plural } from "@/lib/wincare/format";
import { pageHidden } from "@/lib/wincare/pageVisibility";
import { isWindowsUpdateProcess } from "@/lib/wincare/processHints";
import { listProcesses, type ProcessInfo } from "@/lib/wincare/systemTools";
import { TONE_CALLOUT } from "@/lib/wincare/tone";
import { Panel, PanelHeader } from "./Panel";

/** A partir disso (% do processador) o Windows Update está "pesando". */
const BUSY_PCT = 10;
/** Depois disso trabalhando sem parar, vale sugerir destravar. */
const SLOW_MS = 45 * 60_000;

/**
 * Assistente do Windows Update: aparece quando o TiWorker (ou o
 * TrustedInstaller/MoUsoCoreWorker) está usando o processador, explica o que
 * é e, se demorar demais, sugere os reparos que costumam destravar.
 */
export function WindowsUpdateHelper() {
  const [procs, setProcs] = useState<ProcessInfo[]>([]);
  const [busySince, setBusySince] = useState<number | null>(null);
  const busyRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (pageHidden()) return;
      const list = await listProcesses().catch(() => []);
      if (!alive) return;
      const wu = list.filter((p) => isWindowsUpdateProcess(p.name));
      const total = wu.reduce((n, p) => n + (p.cpuPct ?? 0), 0);
      setProcs(wu);
      if (total >= BUSY_PCT) {
        busyRef.current ??= Date.now();
      } else if (total < BUSY_PCT / 2) {
        busyRef.current = null;
      }
      setBusySince(busyRef.current);
    };
    void tick();
    const id = window.setInterval(() => void tick(), 10_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const total = procs.reduce((n, p) => n + (p.cpuPct ?? 0), 0);
  if (!busySince || total < BUSY_PCT / 2) return null;

  const minutes = Math.max(1, Math.round((Date.now() - busySince) / 60_000));
  const slow = Date.now() - busySince >= SLOW_MS;
  const main = [...procs].sort((a, b) => (b.cpuPct ?? 0) - (a.cpuPct ?? 0))[0];

  return (
    <Panel className={cn(slow && "border-warning/40")} data-wincare-wu-helper>
      <PanelHeader
        icon={RefreshCcwDot}
        tone={slow ? "warning" : "primary"}
        title="O Windows Update está trabalhando"
        description={
          <>
            <strong className="text-foreground">{main?.name ?? "TiWorker"}</strong> está usando{" "}
            {formatDecimal(total, 0)}% do processador
            {minutes >= 2 && <> há {plural(minutes, "minuto", "minutos")}</>}. É o Windows
            instalando atualizações: pode deixar o PC mais lento por alguns minutos — às vezes até
            uma hora, principalmente depois de atualizações grandes. Evite desligar o PC no meio.
          </>
        }
      />

      {slow && (
        <div className={cn("space-y-2 rounded-xl border p-3 text-sm", TONE_CALLOUT.warning)}>
          <p className="flex items-center gap-2 font-medium">
            <Clock aria-hidden className="size-4" /> Está demorando mais que o normal
          </p>
          <p className="text-foreground/80">
            Quando o Windows Update trava, limpar o cache dele e reparar a imagem do Windows costuma
            resolver. Reinicie o PC antes, se ainda não reiniciou.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/reparo">
              <Wrench /> Ver reparos (cache do Windows Update e DISM)
            </Link>
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void openWindowsTarget("start ms-settings:windowsupdate")}
        >
          <ExternalLink /> Abrir Windows Update
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void openWindowsTarget("start ms-settings:windowsupdate-history")}
        >
          <History /> Histórico de atualizações
        </Button>
      </div>
    </Panel>
  );
}
