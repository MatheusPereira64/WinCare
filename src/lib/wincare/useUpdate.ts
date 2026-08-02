import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  getNative,
  isNative,
  type ApplyUpdateResult,
  type UpdateInfo,
  type UpdateProgress,
} from "./bridge";

export function useAppUpdater(options?: { autoCheck?: boolean }) {
  const native = getNative();
  const [version, setVersion] = useState<string>("");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const autoChecked = useRef(false);

  useEffect(() => {
    if (!native?.getAppVersion) return;
    void native.getAppVersion().then(setVersion).catch(() => setVersion(""));
  }, [native]);

  useEffect(() => {
    if (!native?.onUpdateProgress) return;
    return native.onUpdateProgress((payload) => setProgress(payload));
  }, [native]);

  useEffect(() => {
    if (!native?.onUpdateAvailable) return;
    return native.onUpdateAvailable((payload) => {
      setInfo(payload);
      if (payload.updateAvailable) {
        toast.message(`Nova versão ${payload.latestVersion} disponível`, {
          description: "Abra Configurações para atualizar o WinCare.",
          duration: 8000,
        });
      }
    });
  }, [native]);

  const check = useCallback(
    async (silent = false) => {
      if (!native?.checkForUpdate) {
        if (!silent) {
          toast.info("Atualizações só estão disponíveis no aplicativo desktop.");
        }
        return null;
      }
      setChecking(true);
      try {
        const next = await native.checkForUpdate();
        setInfo(next);
        if (!silent) {
          if (!next.ok) {
            toast.error("Não foi possível verificar atualizações", {
              description: next.message,
            });
          } else if (next.updateAvailable) {
            toast.message(`Nova versão ${next.latestVersion}`, {
              description: next.canAutoUpdate
                ? "Clique em Atualizar agora para baixar e instalar."
                : "Baixe o ZIP na página de releases.",
            });
          } else {
            toast.success("Você já está na versão mais recente", {
              description: `WinCare ${next.currentVersion}`,
            });
          }
        }
        return next;
      } catch (error) {
        if (!silent) {
          toast.error("Falha ao consultar o GitHub", {
            description: error instanceof Error ? error.message : undefined,
          });
        }
        return null;
      } finally {
        setChecking(false);
      }
    },
    [native],
  );

  const apply = useCallback(async (): Promise<ApplyUpdateResult | null> => {
    if (!native?.applyUpdate) {
      toast.info("Atualizações só estão disponíveis no aplicativo desktop.");
      return null;
    }
    setApplying(true);
    setProgress({ phase: "check", percent: 0 });
    try {
      const result = await native.applyUpdate();
      if (result.ok) {
        toast.success(result.message || "Atualizando...", {
          description: "O WinCare vai fechar e reabrir na nova versão.",
        });
      } else if (result.reason === "auto-update-unavailable") {
        toast.info(result.message || "Atualização automática indisponível neste modo.");
        await native.openReleasePage?.();
      } else if (result.reason === "up-to-date") {
        toast.success(result.message || "Já atualizado.");
        if (result.info) setInfo(result.info);
      } else {
        toast.error("Não foi possível atualizar", { description: result.message });
      }
      return result;
    } catch (error) {
      toast.error("Falha ao aplicar a atualização", {
        description: error instanceof Error ? error.message : undefined,
      });
      return null;
    } finally {
      setApplying(false);
    }
  }, [native]);

  const openReleasePage = useCallback(async () => {
    if (!native?.openReleasePage) {
      window.open("https://github.com/MatheusPereira64/WinCare/releases/latest", "_blank");
      return;
    }
    await native.openReleasePage();
  }, [native]);

  useEffect(() => {
    if (!options?.autoCheck || !isNative() || autoChecked.current) return;
    const t = window.setTimeout(() => {
      if (autoChecked.current) return;
      autoChecked.current = true;
      void check(true).then((next) => {
        if (next?.ok && next.updateAvailable) {
          toast.message(`Nova versão ${next.latestVersion} disponível`, {
            description: "Abra Configurações → Atualizações para instalar.",
            duration: 10000,
            action: {
              label: "Atualizar",
              onClick: () => {
                void apply();
              },
            },
          });
        }
      });
    }, 2800);
    return () => window.clearTimeout(t);
  }, [options?.autoCheck, check, apply]);

  return {
    native: !!native,
    version,
    info,
    checking,
    applying,
    progress,
    check,
    apply,
    openReleasePage,
  };
}
