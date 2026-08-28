import { useState } from "react";
import { Loader2, Globe, Radar, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNative, isNative } from "@/lib/wincare/bridge";
import { NETWORK_PRESETS } from "@/lib/wincare/network";
import { CommandFeed } from "@/components/wincare/CommandFeed";
import { normalizeCmdText } from "@/lib/wincare/commandFeed";
import type { LogLine } from "@/lib/wincare/types";

type ProbeKind = "ping" | "dns" | "tracert";

function buildCommand(kind: ProbeKind, host: string): string {
  switch (kind) {
    case "ping":
      return `ping -n 4 -w 2000 ${host}`;
    case "dns":
      return `nslookup ${host}`;
    case "tracert":
      return `tracert -h 12 -w 1500 -d ${host}`;
  }
}

function now() {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Probe só com presets (sem &lt;input&gt;).
 * Qualquer campo de texto nesta página reativava o freeze do Electron ao abrir a aba.
 */
export function NetworkProbeCard() {
  const [host, setHost] = useState<string>(NETWORK_PRESETS[0].host);
  const [busy, setBusy] = useState<ProbeKind | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [result, setResult] = useState<string>("");

  const run = async (kind: ProbeKind) => {
    const command = buildCommand(kind, host);
    const next: LogLine[] = [{ time: now(), text: `Executando: ${command}`, kind: "info" }];
    setLines(next);
    setResult("");
    setBusy(kind);

    try {
      const native = getNative();
      if (!native) {
        next.push({ time: now(), text: "Modo demonstração — resultado simulado.", kind: "warn" });
        next.push({
          time: now(),
          text:
            kind === "ping"
              ? `Resposta de ${host}: tempo=12ms TTL=117`
              : kind === "dns"
                ? `Nome: ${host}\nAddress: 93.184.216.34`
                : "1  10.0.0.1  1 ms",
          kind: "output",
        });
        setLines([...next]);
        setResult("Simulação concluída.");
        toast.success("Simulação concluída.");
        return;
      }

      const timeoutMs = kind === "tracert" ? 90000 : kind === "ping" ? 20000 : 12000;
      const out = await native.run(
        command,
        (chunk) => {
          const parts = chunk.split(/\r?\n/).filter(Boolean);
          for (const text of parts) {
            const clean = normalizeCmdText(text);
            if (!clean) continue;
            next.push({ time: now(), text: clean, kind: "output" });
          }
          setLines([...next]);
        },
        { timeoutMs },
      );

      const ok = out.code === 0;
      next.push({
        time: now(),
        text: `Resultado: ${out.result}`,
        kind: ok ? "success" : "error",
      });
      setLines([...next]);
      setResult(out.result);
      if (ok) toast.success(out.result || "Concluído");
      else toast.error(out.result || "Falha no teste");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Falha ao executar.";
      next.push({ time: now(), text: msg, kind: "error" });
      setLines([...next]);
      setResult(msg);
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="surface-panel flex flex-col gap-4 border-border/60 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Radar className="size-5 text-primary" />
        <h3 className="text-base font-semibold">Teste rápido</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Escolha o destino e execute Ping, DNS ou Tracert. (Sem campo de texto — evita travar o app
        no Electron.)
      </p>

      <div className="flex flex-wrap gap-1.5">
        {NETWORK_PRESETS.map((preset) => (
          <Button
            key={preset.host}
            type="button"
            size="sm"
            variant={host === preset.host ? "default" : "outline"}
            className="h-8 px-2.5 text-xs"
            disabled={!!busy}
            onClick={() => setHost(preset.host)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <p className="font-mono text-xs text-muted-foreground">Destino: {host}</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!!busy} onClick={() => void run("ping")}>
          {busy === "ping" ? <Loader2 className="animate-spin" /> : <Globe />}
          Ping
        </Button>
        <Button type="button" variant="secondary" disabled={!!busy} onClick={() => void run("dns")}>
          {busy === "dns" ? <Loader2 className="animate-spin" /> : <Search />}
          DNS
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!!busy}
          onClick={() => void run("tracert")}
        >
          {busy === "tracert" ? <Loader2 className="animate-spin" /> : <Radar />}
          Tracert
        </Button>
      </div>

      {!isNative() && (
        <p className="text-xs text-muted-foreground">
          No navegador os testes são simulados. No app desktop os comandos são reais.
        </p>
      )}

      {lines.length > 0 && <CommandFeed lines={lines} running={!!busy} result={result} />}
    </Card>
  );
}
