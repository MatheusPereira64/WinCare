import { createPortal } from "react-dom";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UpdateProgress } from "@/lib/wincare/bridge";

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

function phaseLabel(phase: string | undefined, percent: number) {
  switch (phase) {
    case "download":
      return `Baixando atualização… ${percent}%`;
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
  if (!open || typeof document === "undefined") return null;

  const current = currentVersion || "—";
  const latest = latestVersion || "—";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
      style={{ pointerEvents: "auto" }}
      role="presentation"
      onClick={() => {
        if (!applying) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !applying) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wincare-update-title"
        className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg"
        style={{ pointerEvents: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wincare-update-title" className="flex items-center gap-2 text-lg font-semibold">
          <Download className="size-5 text-primary" />
          {applying ? "Baixando atualização" : "Atualização disponível"}
        </h2>

        {applying ? (
          <div className="mt-4 grid gap-3">
            <p className="text-sm text-muted-foreground">
              Baixando a versão {latest}. O WinCare vai fechar e reabrir quando terminar.
            </p>
            <p className="text-sm text-muted-foreground">
              {phaseLabel(progress?.phase, progress?.percent ?? 0)}
            </p>
            <Progress value={progress?.percent ?? 8} className="h-1.5" />
          </div>
        ) : (
          <div className="mt-3 space-y-3 text-sm text-muted-foreground">
            <p>
              Seu aplicativo está na versão <span className="font-medium text-foreground">{current}</span>.
              Deseja baixar a versão <span className="font-medium text-foreground">{latest}</span> mais
              atual?
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
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
