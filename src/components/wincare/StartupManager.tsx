import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Rocket } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmModal } from "@/components/wincare/ConfirmModal";
import { StartupAppIcon } from "@/components/wincare/StartupAppIcon";
import { StartupChangeBanner } from "@/components/wincare/StartupChangeBanner";
import { StartupDiagnosisCard } from "@/components/wincare/StartupDiagnosisCard";
import { getNative, isNative, SIMULATED_STARTUP } from "@/lib/wincare/bridge";
import { plural } from "@/lib/wincare/format";
import { IMPACT_LABEL, diagnoseStartup, enrichStartupItems } from "@/lib/wincare/startupAdvice";
import { invalidateSystemData } from "@/lib/wincare/systemData";
import type { Tone } from "@/lib/wincare/tone";
import type { StartupItem } from "@/lib/wincare/types";
import { useResource } from "@/lib/wincare/useResource";
import { PageHeader } from "./PageHeader";
import { Panel } from "./Panel";
import { EmptyState, LoadingState, ResourceView } from "./States";
import { StatusBadge } from "./StatusBadge";

const LOCATION_LABEL: Record<StartupItem["location"], string> = {
  "hkcu-run": "Usuário",
  "hklm-run": "Sistema",
  "startup-folder": "Pasta Inicializar",
};

const IMPACT_TONE: Record<NonNullable<StartupItem["impact"]>, Tone> = {
  high: "danger",
  medium: "warning",
  low: "success",
  unknown: "neutral",
};

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

async function loadStartup() {
  const native = getNative();
  if (!native?.listStartup) return enrichStartupItems(isNative() ? [] : SIMULATED_STARTUP);
  const list = await native.listStartup();
  return enrichStartupItems(Array.isArray(list) ? list : []);
}

export function StartupManager() {
  const resource = useResource(loadStartup, {
    errorMessage: "Não foi possível ler a inicialização do Windows.",
  });
  const { reload, setData, refreshing, status } = resource;
  const items = useMemo(() => resource.data ?? [], [resource.data]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const diagnosis = useMemo(() => diagnoseStartup(items), [items]);
  const sorted = useMemo(() => sortStartup(items), [items]);
  const suggestedIds = useMemo(
    () =>
      diagnosis.recommendations
        .filter((r) => r.advice === "disable" && !r.requiresAdmin)
        .map((r) => r.id),
    [diagnosis.recommendations],
  );

  /** Recarrega e avisa o cache do Dashboard/Inteligência. */
  const refresh = async () => {
    invalidateSystemData("startup");
    await reload();
  };

  const setLocal = (ids: Set<string>, enabled: boolean) =>
    setData((prev) =>
      enrichStartupItems((prev ?? []).map((i) => (ids.has(i.id) ? { ...i, enabled } : i))),
    );

  const toggle = async (item: StartupItem, enabled: boolean) => {
    if (item.location === "hklm-run" || item.requiresAdmin) {
      toast.info("Este item vale para todos os usuários", {
        description: "Reinicie o WinCare como administrador para alterá-lo.",
      });
      return;
    }

    const native = getNative();
    if (!native?.setStartupEnabled) {
      setLocal(new Set([item.id]), enabled);
      toast.success(enabled ? "Ativado (demonstração)" : "Desativado (demonstração)");
      return;
    }

    setBusyId(item.id);
    try {
      const out = await native.setStartupEnabled(item.id, enabled);
      if (!out.ok) {
        toast.error(`Não foi possível alterar ${item.name}.`, { description: out.reason });
        return;
      }
      toast.success(
        enabled
          ? `${item.name} volta a abrir com o Windows`
          : `${item.name} não abre mais com o Windows`,
      );
      await refresh();
    } catch (err) {
      toast.error(`Não foi possível alterar ${item.name}.`, {
        description: err instanceof Error ? err.message : undefined,
      });
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
      setLocal(new Set(targets.map((t) => t.id)), false);
      toast.success(
        `${plural(targets.length, "programa desativado", "programas desativados")} (demonstração)`,
      );
      return;
    }

    let ok = 0;
    try {
      for (const item of targets) {
        setBusyId(item.id);
        const out = await native.setStartupEnabled(item.id, false);
        if (out.ok) ok += 1;
      }
      toast.success(
        ok === targets.length
          ? `${plural(ok, "programa desativado", "programas desativados")} na inicialização`
          : `${ok} de ${targets.length} desativados`,
      );
      await refresh();
    } catch (err) {
      toast.error("Não foi possível desativar os programas.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusyId(null);
    }
  };

  const active = items.filter((i) => i.enabled).length;
  const ready = status === "ready";

  return (
    <div className="space-y-6" data-wincare-startup>
      <PageHeader
        icon={Rocket}
        title="Inicialização"
        subtitle="Programas que abrem junto com o Windows: a principal causa de PC lento ao ligar."
        badges={
          ready && (
            <StatusBadge>
              {active} de {items.length} ativos
            </StatusBadge>
          )
        }
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="rounded-full"
            onClick={() => void refresh()}
            disabled={status === "loading" || refreshing}
          >
            {status === "loading" || refreshing ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Atualizar
          </Button>
        }
      />

      <StartupChangeBanner />

      {ready && items.length > 0 && (
        <StartupDiagnosisCard
          diagnosis={diagnosis}
          busyId={busyId}
          onDisable={(id) => void disableById(id)}
          onDisableSuggested={() => setConfirmBulk(true)}
        />
      )}

      <ResourceView
        resource={resource}
        errorTitle="Não foi possível ler a inicialização"
        loading={
          <LoadingState
            label="Lendo o registro, a pasta Inicializar e o uso de memória…"
            rows={5}
          />
        }
        isEmpty={(list) => list.length === 0}
        empty={
          <EmptyState
            icon={Rocket}
            title="Nenhum programa abre com o Windows"
            description="Não encontramos itens no registro nem na pasta Inicializar."
          />
        }
      >
        {() => (
          <ul className="grid gap-3" aria-label="Programas na inicialização">
            {sorted.map((item) => {
              const systemItem = item.location === "hklm-run" || !!item.requiresAdmin;
              return (
                <li key={item.id}>
                  <Panel padding="sm" className="gap-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <StartupAppIcon src={item.iconDataUrl} name={item.name || "Programa"} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate font-semibold">
                              {item.name || "Programa sem nome"}
                            </h3>
                            {item.impact && item.impact !== "unknown" && (
                              <StatusBadge tone={IMPACT_TONE[item.impact]}>
                                Impacto {IMPACT_LABEL[item.impact].toLowerCase()}
                              </StatusBadge>
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
                          <Loader2
                            aria-hidden
                            className="size-4 animate-spin text-muted-foreground"
                          />
                        )}
                        {item.enabled && item.recommendation && item.recommendation !== "keep" && (
                          <span
                            className={`hidden text-xs @md/main:inline ${
                              item.recommendation === "disable"
                                ? "text-destructive"
                                : "text-warning"
                            }`}
                            title={item.recommendationReason}
                          >
                            {item.recommendation === "disable"
                              ? "Sugestão: desativar"
                              : "Vale avaliar"}
                          </span>
                        )}
                        {systemItem && !item.enabled && (
                          <span className="text-xs text-warning">Requer administrador</span>
                        )}
                        <Switch
                          checked={item.enabled}
                          disabled={busyId === item.id || systemItem}
                          onCheckedChange={(v) => void toggle(item, v)}
                          aria-label={`${item.name} abre com o Windows`}
                        />
                      </div>
                    </div>
                  </Panel>
                </li>
              );
            })}
          </ul>
        )}
      </ResourceView>

      <ConfirmModal
        open={confirmBulk}
        title="Desativar os programas pesados?"
        confirmLabel="Desativar na inicialização"
        onConfirm={() => void disableSuggested()}
        onCancel={() => setConfirmBulk(false)}
      >
        <p>
          Vamos desativar{" "}
          {plural(suggestedIds.length, "programa que atrasa", "programas que atrasam")} a
          inicialização. Eles deixam de abrir com o Windows — você ainda pode abri-los quando
          quiser.
        </p>
      </ConfirmModal>
    </div>
  );
}
