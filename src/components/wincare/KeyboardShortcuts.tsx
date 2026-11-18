import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getNative, isNative } from "@/lib/wincare/bridge";
import { SHORTCUT_PAGES } from "@/lib/wincare/navigation";
import {
  onOpenShortcutsHelp,
  openShortcutsHelp,
  shortcutSections,
  type Shortcut,
} from "@/lib/wincare/shortcuts";
import { ModalShell } from "./ConfirmModal";

export function KeyCombo({ combos }: { combos: string[][] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {combos.map((combo, i) => (
        <Fragment key={combo.join("+")}>
          {i > 0 && <span className="text-xs text-muted-foreground">ou</span>}
          <span className="inline-flex items-center gap-1">
            {combo.map((key, j) => (
              <Fragment key={key}>
                {j > 0 && (
                  <span className="text-xs text-muted-foreground" aria-hidden>
                    +
                  </span>
                )}
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  {key}
                </kbd>
              </Fragment>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

/** Tabela de atalhos (uma por seção) — leitor de tela anuncia "Atalho" / "Ação". */
export function ShortcutTable({ title, items }: { title: string; items: Shortcut[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="pb-1.5 text-left text-xs font-semibold tracking-wide text-foreground uppercase">
        {title}
      </caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Atalho</th>
          <th scope="col">Ação</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.action} className="border-t border-border/50">
            <td className="py-1.5 pr-3 align-top whitespace-nowrap">
              <KeyCombo combos={item.keys} />
            </td>
            <td className="py-1.5 text-muted-foreground">{item.action}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const isEditable = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    (el.tagName === "INPUT" &&
      !["checkbox", "radio", "button", "submit", "range"].includes((el as HTMLInputElement).type))
  );
};

const dialogOpen = () => !!document.querySelector("[role=dialog][aria-modal=true]");

/**
 * Atalhos globais: Alt+1…9 / Alt+0 (páginas) e ? / F1 (ajuda).
 * No app desktop o Alt+número chega do processo principal (antes do menu do
 * Windows); no navegador, pelo teclado da página.
 */
export function KeyboardShortcuts() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => onOpenShortcutsHelp(() => setOpen(true)), []);

  useEffect(() => {
    const goTo = (digit: string) => {
      const page = SHORTCUT_PAGES.find((p) => p.shortcut === digit);
      if (!page || dialogOpen()) return;
      void navigate({ to: page.url });
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const plainAlt = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
      const digit = /^Digit([0-9])$/.exec(event.code)?.[1];
      if (plainAlt && digit && !isNative()) {
        event.preventDefault();
        goTo(digit);
        return;
      }
      const help =
        (event.key === "?" && !event.ctrlKey && !event.altKey && !event.metaKey) ||
        (event.key === "F1" &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey &&
          !event.shiftKey);
      if (help && !isEditable(event.target) && !dialogOpen()) {
        event.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener("keydown", onKey);
    const native = getNative();
    const offPage = native?.onPageShortcut?.(goTo);
    const offHelp = native?.onShowShortcuts?.(() => {
      if (!dialogOpen()) setOpen(true);
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      offPage?.();
      offHelp?.();
    };
  }, [navigate]);

  return <ShortcutsDialog open={open} onClose={() => setOpen(false)} />;
}

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sections = shortcutSections().filter((s) => s.title !== "Zoom" || isNative());
  return (
    <ModalShell
      open={open}
      title="Atalhos de teclado"
      icon={<Keyboard className="size-5 shrink-0 text-primary" />}
      className="max-w-2xl"
      describeBody={false}
      onClose={onClose}
      footer={
        <Button type="button" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="grid gap-x-8 gap-y-4 pb-1 sm:grid-cols-2">
        {sections.map((section) => (
          <ShortcutTable key={section.title} title={section.title} items={section.items} />
        ))}
      </div>
    </ModalShell>
  );
}

/** Botão da barra superior que abre a lista de atalhos. */
export function ShortcutsButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="shrink-0 rounded-full"
      aria-label="Atalhos de teclado"
      aria-keyshortcuts="? F1"
      title="Atalhos de teclado (?)"
      onClick={openShortcutsHelp}
    >
      <Keyboard />
    </Button>
  );
}
