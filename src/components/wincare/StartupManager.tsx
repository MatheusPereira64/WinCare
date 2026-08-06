import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, PowerOff, RefreshCw, Rocket } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { getNative, isNative, SIMULATED_STARTUP } from "@/lib/wincare/bridge";
import type { StartupItem } from "@/lib/wincare/types";

const LOCATION_LABEL: Record<StartupItem["location"], string> = {
  "hkcu-run": "Usuário",
  "hklm-run": "Sistema",
  "startup-folder": "Pasta Inicializar",
};

export function StartupManager() {
  const [items, setItems] = useState<StartupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const nativeMode = isNative();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const native = getNative();
      if (native?.listStartup) {
        const list = await native.listStartup();
        setItems(Array.isArray(list) ? list : []);
      } else {
        setItems(SIMULATED_STARTUP);
      }
    } catch {
      toast.error("Não foi possível listar a inicialização.");
      setItems(nativeMode ? [] : SIMULATED_STARTUP);
    } finally {
      setLoading(false);
    }
  }, [nativeMode]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const native = getNative();
        if (native?.listStartup) {
          const list = await native.listStartup();
          if (!cancelled) setItems(Array.isArray(list) ? list : []);
        } else if (!cancelled) {
          setItems(SIMULATED_STARTUP);
        }
      } catch {
        if (!cancelled) {
          toast.error("Não foi possível listar a inicialização.");
          setItems(nativeMode ? [] : SIMULATED_STARTUP);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [nativeMode]);

  const toggle = async (item: StartupItem, enabled: boolean) => {
    if (item.location === "hklm-run" || item.requiresAdmin) {
      toast.info("Item do sistema", {
        description: "Reinicie o WinCare como administrador para alterar entradas HKLM.",
      });
      return;
    }

    const native = getNative();
    if (!native?.setStartupEnabled) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, enabled } : i)));
      toast.success(enabled ? "Ativado (demonstração)" : "Desativado (demonstração)");
      return;
    }

    setBusyId(item.id);
    try {
      const out = await native.setStartupEnabled(item.id, enabled);
      if (!out.ok) {
        toast.error(out.reason || "Falha ao alterar item.");
        return;
      }
      toast.success(
        enabled ? `${item.name} reativado na inicialização` : `${item.name} desativado`,
      );
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar item.");
    } finally {
      setBusyId(null);
    }
  };

  const active = items.filter((i) => i.enabled).length;

  return (
    <div className="space-y-6" data-wincare-startup>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Rocket className="size-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Inicialização</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Programas que abrem junto com o Windows — principal causa de PC lento na inicialização.
            {!nativeMode && " Modo demonstração."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {active} ativos / {items.length} total
          </Badge>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Atualizar
          </Button>
        </div>
      </header>

      {loading && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Lendo registro e pasta Inicializar…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum item de inicialização encontrado.</p>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => {
            const systemItem = item.location === "hklm-run" || !!item.requiresAdmin;
            return (
              <Card key={item.id} className="surface-panel gap-3 border-border/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{item.name}</h3>
                      <Badge variant="outline" className="text-muted-foreground">
                        {LOCATION_LABEL[item.location]}
                      </Badge>
                      {systemItem && (
                        <Badge variant="outline" className="border-warning/40 text-warning">
                          Admin
                        </Badge>
                      )}
                      {item.enabled ? (
                        <Badge
                          variant="outline"
                          className="border-success/40 bg-success/10 text-success"
                        >
                          <Play className="size-3" /> Ativo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          <PowerOff className="size-3" /> Desativado
                        </Badge>
                      )}
                    </div>
                    <code className="mt-2 block truncate rounded-md bg-muted/60 px-2 py-1 font-mono text-xs text-muted-foreground">
                      {item.command}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    {busyId === item.id && (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    )}
                    <Switch
                      checked={item.enabled}
                      disabled={busyId === item.id || systemItem}
                      onCheckedChange={(v) => void toggle(item, v)}
                      aria-label={`Alternar ${item.name}`}
                    />
                  </div>
                </div>
                {systemItem && (
                  <p className="text-xs text-muted-foreground">
                    Entrada do sistema — altere apenas com o WinCare em modo administrador.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
