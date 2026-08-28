import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { intelActions, useIntel } from "@/lib/wincare/intelligenceStore";

export function StartupChangeBanner() {
  const known = useIntel((s) => s.startupKnown);
  const newIds = useIntel((s) => s.startupNewIds);
  const added = known.filter((k) => newIds.includes(k.id));

  if (added.length === 0) return null;

  return (
    <Card className="gap-3 border-warning/40 bg-warning/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Bell className="mt-0.5 size-4 text-warning" />
          <div>
            <p className="text-sm font-medium">Novos programas na inicialização</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {added.map((a) => a.name).join(", ")} — apareceram desde a última vez que o WinCare
              conferiu o boot.
            </p>
          </div>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => intelActions.dismissStartupNews()}>
          Entendi
        </Button>
      </div>
    </Card>
  );
}
