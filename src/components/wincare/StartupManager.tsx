import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Rocket } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ConfirmModal } from "@/components/wincare/ConfirmModal";
import { StartupAppIcon } from "@/components/wincare/StartupAppIcon";
import { StartupChangeBanner } from "@/components/wincare/StartupChangeBanner";
import { StartupDiagnosisCard } from "@/components/wincare/StartupDiagnosisCard";
import { getNative, isNative, SIMULATED_STARTUP } from "@/lib/wincare/bridge";
import { IMPACT_LABEL, diagnoseStartup, enrichStartupItems } from "@/lib/wincare/startupAdvice";
import type { StartupItem } from "@/lib/wincare/types";

const LOCATION_LABEL: Record<StartupItem["location"], string> = {
  "hkcu-run": "Usuário",
  "hklm-run": "Sistema",
  "startup-folder": "Pasta Inicializar",
};

function impactTone(impact: StartupItem["impact"]) {
  if (impact === "high") return "border-destructive/40 text-destructive";
  if (impact === "medium") return "border-warning/40 text-warning";
  if (impact === "low") return "border-success/40 text-success";
  return "text-muted-foreground";
}

function sortStartup(items: StartupItem[]) {
  const adviceRank: Record<string, number> = { disable: 0, consider: 1, keep: 2 };
  const impactRank: Record<string, number> = { high: 0, medium: 1, low: 2, unknown: 3 };
  return [...items].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    const ar = adviceRank[a.recommendation ?? "keep"] ?? 2;
    const br = adviceRank[b.recommendation ?? "keep"] ?? 2;
    if (ar !== br) return ar - br;
    const ai = impactRank[a.impact ?? "unknown"] ?? 3;
    const bi = impactRank[b.impact ?? "unknown"] ?? 3;
    if (ai !== bi) return ai - bi;
    return (b.memMb ?? 0) - (a.memMb ?? 0);
  });
}

export function StartupManager() {
  const [items, setItems] = useState<StartupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const nativeMode = isNative();

  const applyList = useCallback((list: StartupItem[]) => {
    setItems(enrichStartupItems(Array.isArray(list) ? list : []));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const native = getNative();
      if (native?.listStartup) {
        const list = await native.listStartup();
        applyList(list);
      } else {
        applyList(SIMULATED_STARTUP);
      }
    } catch {
      toast.error("Não foi possível listar a inicialização.");
      applyList(nativeMode ? [] : SIMULATED_STARTUP);
    } finally {
      setLoading(false);
    }
  }, [applyList, nativeMode]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const native = getNative();
        if (native?.listStartup) {
          const list = await native.listStartup();
          if (!cancelled) applyList(list);
        } else if (!cancelled) {
          applyList(SIMULATED_STARTUP);
        }
      } catch {
        if (!cancelled) {
          toast.error("Não foi possível listar a inicialização.");
          applyList(nativeMode ? [] : SIMULATED_STARTUP);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [applyList, nativeMode]);

  const diagnosis = useMemo(() => diagnoseStartup(items), [items]);
  const sorted = useMemo(() => sortStartup(items), [items]);
  const suggestedIds = useMemo(
    () =>
      diagnosis.recommendations
        .filter((r) => r.advice === "disable" && !r.requiresAdmin)
        .map((r) => r.id),
    [diagnosis.recommendations],
  );

  const toggle = async (item: StartupItem, enabled: boolean) => {
    if (item.location === "hklm-run" || item.requiresAdmin) {
      toast.info("Item do sistema", {
        description: "Reinicie o WinCare como administrador para alterar entradas HKLM.",
      });
      return;
    }

    const native = getNative();
    if (!native?.setStartupEnabled) {
      applyList(items.map((i) => (i.id === item.id ? { ...i, enabled } : i)));
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

  const disableById = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item || !item.enabled) return;
    await toggle(item, false);
  };

  const disableSuggested = async () => {
    setConfirmBulk(false);
    const targets = items.filter((i) => suggestedIds.includes(i.id) && i.enabled);
    if (targets.length === 0) return;

    const native = getNative();
    if (!native?.setStartupEnabled) {
      const ids = new Set(targets.map((t) => t.id));
      applyList(items.map((i) => (ids.has(i.id) ? { ...i, enabled: false } : i)));
      toast.success(`${targets.length} programa(s) desativado(s) (demonstração)`);
      return;
    }

    setBusyId(targets[0]!.id);
    let ok = 0;
    try {
      for (const item of targets) {
        setBusyId(item.id);
        const out = await native.setStartupEnabled(item.id, false);
        if (out.ok) ok += 1;
      }
      toast.success(
        ok === targets.length
          ? `${ok} programa(s) desativado(s) na inicialização`
          : `${ok} de ${targets.length} desativado(s)`,
      );
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao desativar programas.");
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
            Programas que abrem com o Windows e o que vale desativar no boot.
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

      <StartupChangeBanner />

      {!loading && items.length > 0 && (
        <StartupDiagnosisCard
          diagnosis={diagnosis}
          busyId={busyId}
          onDisable={(id) => void disableById(id)}
          onDisableSuggested={() => setConfirmBulk(true)}
        />
      )}

      {loading && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Lendo registro, pasta Inicializar e uso de memória…
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum item de inicialização encontrado.</p>
      ) : (
        <div className="grid gap-3">
          {sorted.map((item) => {
            const systemItem = item.location === "hklm-run" || !!item.requiresAdmin;
            return (
              <Card key={item.id} className="surface-panel gap-0 border-border/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <StartupAppIcon src={item.iconDataUrl} name={item.name || "Programa"} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold">
                          {item.name || "Programa sem nome"}
                        </h3>
                        {item.impact && item.impact !== "unknown" && (
                          <Badge variant="outline" className={impactTone(item.impact)}>
                            {IMPACT_LABEL[item.impact]}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.running && (item.memMb ?? 0) > 0
                          ? `${item.memMb} MB`
                          : item.enabled
                            ? "Não está na memória agora"
                            : LOCATION_LABEL[item.location]}
                        {item.enabled && item.running && (item.memMb ?? 0) > 0
                          ? ` · ${LOCATION_LABEL[item.location]}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {busyId === item.id && (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    )}
                    {item.enabled && item.recommendation && item.recommendation !== "keep" && (
                      <span
                        className={`hidden text-xs sm:inline ${
                          item.recommendation === "disable" ? "text-destructive" : "text-warning"
                        }`}
                        title={item.recommendationReason}
                      >
                        {item.recommendation === "disable" ? "Desativar" : "Avaliar"}
                      </span>
                    )}
                    {systemItem && !item.enabled && (
                      <span className="text-xs text-warning">Admin</span>
                    )}
                    <Switch
                      checked={item.enabled}
                      disabled={busyId === item.id || systemItem}
                      onCheckedChange={(v) => void toggle(item, v)}
                      aria-label={`Alternar ${item.name}`}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={confirmBulk}
        title="Desativar programas pesados?"
        confirmLabel="Desativar na inicialização"
        cancelLabel="Cancelar"
        onConfirm={() => void disableSuggested()}
        onCancel={() => setConfirmBulk(false)}
      >
        <p>
          Vamos desativar {suggestedIds.length} programa(s) que atrasam o boot. Eles deixam de abrir
          com o Windows — você ainda pode iniciá-los manualmente.
        </p>
      </ConfirmModal>
    </div>
  );
}
