import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import { getNative } from "@/lib/wincare/bridge";
import { NAV_GROUPS } from "@/lib/wincare/navigation";
import { runQuickCheckup } from "@/lib/wincare/quickCheckup";
import type { TrayCommand } from "@/lib/wincare/types";

const ROUTES = new Set(NAV_GROUPS.flatMap((group) => group.items.map((item) => item.url)));

/**
 * Pedidos da bandeja e das notificações (app desktop): abrir uma página ou
 * fazer o checkup rápido. O pedido feito com o app só na bandeja chega antes
 * da janela existir — ela busca ao montar (takeTrayCommand).
 */
export function TrayBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const native = getNative();
    if (!native) return;
    const handle = (command: TrayCommand | null) => {
      if (!command) return;
      if (command.type === "navigate" && ROUTES.has(command.to)) {
        void navigate({ to: command.to as "/" });
      } else if (command.type === "quick-checkup") {
        void navigate({ to: "/" });
        void runQuickCheckup({ focusResults: true });
      }
    };
    void native.takeTrayCommand?.().then(handle);
    return native.onTrayCommand?.(handle);
  }, [navigate]);

  return null;
}
