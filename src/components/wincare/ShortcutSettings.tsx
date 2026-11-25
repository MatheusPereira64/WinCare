import { useEffect, useState } from "react";
import { AppWindow, Link2, Monitor } from "lucide-react";
import { toast } from "sonner";

import { getNative } from "@/lib/wincare/bridge";
import { Panel, PanelHeader } from "./Panel";
import { SettingSwitch } from "./Preferences";

interface ShortcutState {
  ok: boolean;
  supported: boolean;
  startMenu: boolean;
  desktop: boolean;
  reason?: string;
}

interface ShortcutBridge {
  shortcuts?: () => Promise<ShortcutState>;
  setShortcuts?: (patch: { startMenu?: boolean; desktop?: boolean }) => Promise<ShortcutState>;
}

const bridge = () => getNative() as (ReturnType<typeof getNative> & ShortcutBridge) | null;

/**
 * Atalhos do WinCare no Menu Iniciar e na Área de Trabalho. Só no app baixado
 * da release (em desenvolvimento o .exe é uma cópia do Electron).
 */
export function ShortcutSettings() {
  const [state, setState] = useState<ShortcutState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void bridge()?.shortcuts?.().then(setState);
  }, []);

  if (!state?.supported) return null;

  const change = async (patch: { startMenu?: boolean; desktop?: boolean }) => {
    setBusy(true);
    try {
      const next = await bridge()?.setShortcuts?.(patch);
      if (next) setState(next);
      if (next && !next.ok)
        toast.error("Não foi possível alterar o atalho.", { description: next.reason });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel padding="lg" className="gap-5">
      <PanelHeader
        icon={Link2}
        size="sm"
        title="Atalhos"
        description="Abra o WinCare pelo Menu Iniciar ou pela Área de Trabalho. Se você mover a pasta do app, os atalhos se corrigem sozinhos."
      />
      <div className="space-y-5">
        <SettingSwitch
          icon={AppWindow}
          label="Menu Iniciar"
          description="Aparece na lista de apps e na busca do Windows."
          checked={state.startMenu}
          disabled={busy}
          onCheckedChange={(startMenu) => void change({ startMenu })}
        />
        <SettingSwitch
          icon={Monitor}
          label="Área de Trabalho"
          description="Um atalho do WinCare na Área de Trabalho."
          checked={state.desktop}
          disabled={busy}
          onCheckedChange={(desktop) => void change({ desktop })}
        />
      </div>
    </Panel>
  );
}
