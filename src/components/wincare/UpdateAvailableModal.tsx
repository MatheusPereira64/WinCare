import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UpdateProgress } from "@/lib/wincare/bridge";
import { useFocusTrap } from "@/lib/wincare/useFocusTrap";

interface Props {
  open: boolean;
  currentVersion: string;
  latestVersion: string;
  canAutoUpdate?: boolean;
  applying?: boolean;
  progress?: UpdateProgress | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Texto da fase, sem a porcentagem (que mudaria a cada instante no leitor de tela). */
function phaseLabel(phase: string | undefined) {
  switch (phase) {
    case "download":
      return "Baixando atualização…";
    case "extract":
      return "Extraindo arquivos…";
    case "apply":
      return "Preparando substituição…";
    case "check":
      return "Consultando GitHub…";
    default:
      return "Atualizando…";
  }
}

/**
 * Popup de atualização sem Radix Dialog — mesmo padrão do ConfirmModal
 * para não travar cliques no Electron.
 */
export function UpdateAvailableModal({
  open,
  currentVersion,
  latestVersion,
  canAutoUpdate = true,
  applying = false,
  progress,
  onConfirm,
  onCancel,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  });

  // Foco preso no popup; o resto do app fica inerte para o Narrador.
  useFocusTrap(panelRef, open, { inertApp: true });

  useEffect(() => {
    if (!open || applying) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, applying]);

  if (!open || typeof document === "undefined") return null;

  const current = currentVersion || "—";
  const latest = latestVersion || "—";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-3 sm:p-4"
      style={{ pointerEvents: "auto" }}
      role="presentation"
      onClick={() => {
        if (!applying) onCancel();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="max-h-[calc(100svh-1.5rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-lg border bg-background p-5 shadow-lg outline-none sm:p-6"
        style={{ pointerEvents: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="flex items-center gap-2 text-lg font-semibold">
          <Download className="size-5 text-primary" />
          {applying ? "Baixando atualização" : "Atualização disponível"}
        </h2>

        {applying ? (
          <div id={bodyId} className="mt-4 grid gap-3">
            <p className="text-sm text-muted-foreground">
              Baixando a versão {latest}. O WinCare vai fechar e reabrir quando terminar.
            </p>
            {/* Só a fase é anunciada (não cada porcentagem). */}
            <p className="text-sm text-muted-foreground" role="status">
              {phaseLabel(progress?.phase)}
              <span aria-hidden>
                {progress?.phase === "download" ? ` ${progress?.percent ?? 0}%` : ""}
              </span>
            </p>
            <Progress
              value={progress?.percent ?? 8}
              className="h-1.5"
              aria-label="Progresso da atualização"
            />
          </div>
        ) : (
          <div id={bodyId} className="mt-3 space-y-3 text-sm text-muted-foreground">
            <p>
              Seu aplicativo está na versão{" "}
              <span className="font-medium text-foreground">{current}</span>. Deseja baixar a versão{" "}
              <span className="font-medium text-foreground">{latest}</span> mais atual?
            </p>
            {!canAutoUpdate && (
              <p>
                Neste modo o download automático não substitui os arquivos. Vamos abrir a página de
                releases para você baixar o ZIP.
              </p>
            )}
          </div>
        )}

        {!applying && (
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end short:mt-4 short:flex-row short:flex-wrap short:justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              Agora não
            </Button>
            <Button type="button" onClick={onConfirm}>
              <Download />
              {canAutoUpdate ? "Baixar agora" : "Abrir download"}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
