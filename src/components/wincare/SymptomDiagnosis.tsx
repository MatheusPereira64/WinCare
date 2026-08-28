import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { diagnoseSymptom, SYMPTOMS, type Finding } from "@/lib/wincare/intelligence";
import type { DiskUsageFolder, StartupItem, SystemInfo, TopProcess } from "@/lib/wincare/types";

const findingTone = {
  ok: "border-success/30 bg-success/10 text-success",
  warn: "border-warning/30 bg-warning/10 text-warning",
  bad: "border-destructive/30 bg-destructive/10 text-destructive",
};

const findingLabel = { ok: "Ok", warn: "Atenção", bad: "Problema" };

export function SymptomDiagnosis({
  info,
  startup,
  folders,
  processes,
}: {
  info: SystemInfo;
  startup: StartupItem[];
  folders: DiskUsageFolder[];
  processes: TopProcess[];
}) {
  const [symptom, setSymptom] = useState<string | null>(null);
  const findings = useMemo<Finding[]>(
    () => (symptom ? diagnoseSymptom(symptom, { info, startup, folders, processes }) : []),
    [symptom, info, startup, folders, processes],
  );

  return (
    <Card className="surface-panel gap-4 border-border/60 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Stethoscope className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">O que está acontecendo?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha o sintoma. O WinCare cruza CPU, RAM, disco, boot e processos reais — não um
            checklist genérico.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SYMPTOMS.map((s) => (
          <Button
            key={s.id}
            type="button"
            size="sm"
            variant={symptom === s.id ? "default" : "outline"}
            className="h-auto rounded-full px-3 py-1.5 text-left text-xs"
            onClick={() => setSymptom(s.id)}
          >
            <span>
              <span className="block font-medium">{s.title}</span>
              <span className="block font-normal text-[10px] opacity-80">{s.hint}</span>
            </span>
          </Button>
        ))}
      </div>

      {findings.length > 0 && (
        <ul className="space-y-2">
          {findings.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/50 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${findingTone[f.tone]}`}>
                    {findingLabel[f.tone]}
                  </span>
                  <p className="text-sm font-medium">{f.title}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
              </div>
              {f.href && (
                <Link to={f.href} className="text-xs font-medium text-primary hover:underline">
                  {f.action || "Abrir"}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
