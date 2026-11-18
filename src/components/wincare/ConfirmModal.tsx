import { createPortal } from "react-dom";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/lib/wincare/useFocusTrap";

interface ShellProps {
  open: boolean;
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Bloqueia fechar por Esc/fundo enquanto uma etapa está em andamento. */
  locked?: boolean;
  className?: string;
  /** Lê o conteúdo como descrição ao abrir (desligue em listas longas). */
  describeBody?: boolean;
  /** Clicar fora fecha (desligue em fluxos longos, como a introdução). */
  dismissOnBackdrop?: boolean;
  onClose: () => void;
}

/**
 * Janela modal sem Radix Dialog — evita scroll-lock / inert que
 * no Electron costuma prender a UI (scroll ok, cliques mortos).
 * Renderiza em portal no body para não herdar transform/filter dos cards.
 *
 * Acessibilidade: foco preso no diálogo (Tab circula), resto do app inerte
 * para o Narrador, Esc fecha e o foco volta ao botão que abriu.
 */
export function ModalShell({
  open,
  title,
  icon,
  children,
  footer,
  locked,
  className,
  describeBody = true,
  dismissOnBackdrop = true,
  onClose,
}: ShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || locked) return;
      // Só o diálogo de cima fecha (o foco está nele).
      if (panelRef.current && !panelRef.current.contains(document.activeElement)) return;
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, locked]);

  // O painel recebe o foco: o Narrador lê o título e a descrição do diálogo.
  useFocusTrap(panelRef, open, { inertApp: true });

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-3 backdrop-blur-[2px] sm:p-4"
      style={{ pointerEvents: "auto" }}
      role="presentation"
      onClick={() => {
        if (!locked && dismissOnBackdrop) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describeBody ? bodyId : undefined}
        className={cn(
          // Em janelas baixas usa quase toda a altura: só o miolo rola, título e botões ficam visíveis.
          "flex max-h-[85svh] w-full max-w-lg flex-col rounded-2xl border border-border/70 bg-card shadow-2xl outline-none short:max-h-[calc(100svh-1.5rem)]",
          className,
        )}
        style={{ pointerEvents: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={titleId}
          className="flex min-w-0 shrink-0 items-center gap-2.5 px-5 pt-5 text-lg font-semibold tracking-tight sm:px-6 sm:pt-6 short:pt-4"
        >
          {icon}
          {title}
        </h2>
        <div
          id={bodyId}
          className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 text-sm text-muted-foreground sm:px-6"
        >
          {children}
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-2 px-5 pt-4 pb-5 sm:flex-row sm:flex-wrap sm:justify-end sm:px-6 sm:pt-5 sm:pb-6 short:flex-row short:flex-wrap short:justify-end short:pt-3 short:pb-4">
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
