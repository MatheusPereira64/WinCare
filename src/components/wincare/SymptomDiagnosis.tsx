import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { diagnoseSymptom, SYMPTOMS, type Finding } from "@/lib/wincare/intelligence";
import { handleRovingKeyDown } from "@/lib/wincare/roving";
import type { Tone } from "@/lib/wincare/tone";
import { Panel, PanelHeader } from "./Panel";
import { StatusBadge } from "./StatusBadge";
import type { DiskUsageFolder, StartupItem, SystemInfo, TopProcess } from "@/lib/wincare/types";

const findingTone: Record<Finding["tone"], Tone> = {
  ok: "success",
  warn: "warning",
  bad: "danger",
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
    <Panel>
      <PanelHeader
        icon={Stethoscope}
        title="O que está acontecendo?"
        description="Escolha o sintoma. O WinCare cruza CPU, memória, disco, inicialização e os processos reais — não é uma lista genérica."
      />

      <div
        role="radiogroup"
        aria-label="Sintoma"
        className="flex flex-wrap gap-2"
        onKeyDown={(e) => handleRovingKeyDown(e)}
      >
        {SYMPTOMS.map((s, index) => (
          <Button
            key={s.id}
            type="button"
            size="sm"
            role="radio"
            aria-checked={symptom === s.id}
            tabIndex={symptom === s.id || (!symptom && index === 0) ? 0 : -1}
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

      {/* Região sempre montada: o Narrador anuncia o resultado ao escolher um sintoma. */}
      <div aria-live="polite">
        {findings.length > 0 && (
          <ul className="space-y-2" aria-label="Resultado do diagnóstico">
            {findings.map((f) => (
              <li
                key={f.id}
                className="surface-inset flex flex-wrap items-start justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={findingTone[f.tone]}>{findingLabel[f.tone]}</StatusBadge>
                    <p className="text-sm font-medium">{f.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
                </div>
                {f.href && (
                  <Link
                    to={f.href}
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                  >
                    {f.action || "Abrir"}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
