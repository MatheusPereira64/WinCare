import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmação sem Radix AlertDialog — evita scroll-lock / inert que
 * no Electron costuma prender a UI (scroll ok, cliques mortos).
 * Renderiza em portal no body para não herdar transform/filter dos cards.
 */
export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel = "Executar mesmo assim",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
}: Props) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
      style={{ pointerEvents: "auto" }}
      role="presentation"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wincare-confirm-title"
        className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg"
        style={{ pointerEvents: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wincare-confirm-title" className="flex items-center gap-2 text-lg font-semibold">
          <TriangleAlert className="size-5 text-warning" />
          {title}
        </h2>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
