import { createPortal } from "react-dom";
import { useEffect, useRef, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShellProps {
  open: boolean;
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Bloqueia fechar por Esc/fundo enquanto uma etapa está em andamento. */
  locked?: boolean;
  className?: string;
  onClose: () => void;
}

/**
 * Janela modal sem Radix Dialog — evita scroll-lock / inert que
 * no Electron costuma prender a UI (scroll ok, cliques mortos).
 * Renderiza em portal no body para não herdar transform/filter dos cards.
 */
export function ModalShell({
  open,
  title,
  icon,
  children,
  footer,
  locked,
  className,
  onClose,
}: ShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, locked]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      style={{ pointerEvents: "auto" }}
      role="presentation"
      onClick={() => {
        if (!locked) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wincare-modal-title"
        className={cn(
          "flex max-h-[85svh] w-full max-w-lg flex-col rounded-2xl border border-border/70 bg-card shadow-2xl outline-none",
          className,
        )}
        style={{ pointerEvents: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="wincare-modal-title"
          className="flex items-center gap-2.5 px-6 pt-6 text-lg font-semibold tracking-tight"
        >
          {icon}
          {title}
        </h2>
        <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto px-6 text-sm text-muted-foreground">
          {children}
        </div>
        <div className="flex flex-col-reverse gap-2 px-6 pt-5 pb-6 sm:flex-row sm:justify-end">
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel = "Executar mesmo assim",
  cancelLabel = "Cancelar",
  destructive,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <ModalShell
      open={open}
      title={title}
      icon={<TriangleAlert className="size-5 shrink-0 text-warning" />}
      onClose={onCancel}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </ModalShell>
  );
}
