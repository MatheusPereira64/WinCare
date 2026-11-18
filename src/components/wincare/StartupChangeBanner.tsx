import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { intelActions, useIntel } from "@/lib/wincare/intelligenceStore";
import { TONE_CALLOUT } from "@/lib/wincare/tone";

/** Aviso de programas novos na inicialização (some ao confirmar). */
export function StartupChangeBanner() {
  const known = useIntel((s) => s.startupKnown);
  const newIds = useIntel((s) => s.startupNewIds);
  const added = known.filter((k) => newIds.includes(k.id));

  if (added.length === 0) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4",
        TONE_CALLOUT.warning,
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Bell aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Novos programas na inicialização</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {added.map((a) => a.name).join(", ")} — apareceram desde a última vez que o WinCare
            conferiu a inicialização.
          </p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => intelActions.dismissStartupNews()}
      >
        Entendi
      </Button>
    </div>
  );
}
