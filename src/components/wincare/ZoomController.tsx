import { useEffect } from "react";
import { ZoomIn } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getNative, isNative } from "@/lib/wincare/bridge";
import { actions, useStore } from "@/lib/wincare/store";
import { DEFAULT_ZOOM, formatZoom } from "@/lib/wincare/zoom";

const ZOOM_TOAST_ID = "wincare-zoom";

/**
 * Recebe Ctrl +/−/0, Ctrl + roda do mouse e o menu Exibir (processo principal),
 * aplica o novo nível e o salva nas Configurações. Um único toast é atualizado
 * a cada toque, em vez de empilhar avisos.
 */
export function ZoomController() {
  useEffect(() => {
    const off = getNative()?.onZoomCommand?.((command) => {
      const zoom = actions.stepZoom(command);
      toast(`Zoom: ${formatZoom(zoom)}`, {
        id: ZOOM_TOAST_ID,
        duration: 1600,
        description: zoom === DEFAULT_ZOOM ? undefined : "Ctrl 0 volta para 100%.",
      });
    });
    return () => off?.();
  }, []);

  return null;
}

/** Indicador na barra superior quando o zoom não está em 100%; clicar restaura. */
export function ZoomIndicator() {
  const zoom = useStore((s) => s.zoom);
  if (!isNative() || zoom === DEFAULT_ZOOM) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 shrink-0 gap-1 rounded-full px-2.5 text-xs tabular-nums text-muted-foreground"
      title="Zoom da interface. Clique para voltar a 100% (Ctrl 0)."
      aria-label={`Zoom em ${formatZoom(zoom)}. Voltar para 100%`}
      onClick={() => actions.setZoom(DEFAULT_ZOOM)}
    >
      <ZoomIn className="size-3.5" />
      {formatZoom(zoom)}
    </Button>
  );
}
