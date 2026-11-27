import { useCallback, useEffect, useRef, useState } from "react";
import { HeartPulse, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getNative } from "@/lib/wincare/bridge";
import { formatBytes } from "@/lib/wincare/report";
import type { Tone } from "@/lib/wincare/tone";
import { Panel, PanelHeader } from "./Panel";
import { StatusBadge } from "./StatusBadge";

type Level = "good" | "warn" | "bad" | "unknown";

type PhysicalDisk = {
  id: string;
  model: string;
  media: "SSD" | "HDD" | null;
  bus: string | null;
  health: string;
  sizeBytes: number;
  letters: string[];
  smart?: {
    temperature: number | null;
    temperatureMax: number | null;
    wear: number | null;
    powerOnHours: number | null;
    readErrors: number | null;
    writeErrors: number | null;
  };
  assessment: { level: Level; notes: { level: Level; text: string }[] };
};

type DiskHealth = {
  ok: boolean;
  reason?: string;
  hasDetails?: boolean;
  cancelled?: boolean;
  disks: PhysicalDisk[];
};

type HealthBridge = { diskHealth?: (details?: boolean) => Promise<DiskHealth> };
const bridge = () => getNative() as (ReturnType<typeof getNative> & HealthBridge) | null;

const LEVEL: Record<Level, { label: string; tone: Tone }> = {
  good: { label: "Saudável", tone: "success" },
  warn: { label: "Atenção", tone: "warning" },
  bad: { label: "Risco de falha", tone: "danger" },
  unknown: { label: "Sem informação", tone: "neutral" },
};

function demoHealth(details: boolean): DiskHealth {
  const smart = (s: NonNullable<PhysicalDisk["smart"]>) => (details ? { smart: s } : {});
  return {
    ok: true,
    hasDetails: details,
    disks: [
      {
        id: "0",
        model: "Samsung SSD 980 PRO 1TB",
        media: "SSD",
        bus: "NVMe",
        health: "Healthy",
        sizeBytes: 1_000_204_886_016,
        letters: ["C:"],
        ...smart({
          temperature: 41,
          temperatureMax: 70,
          wear: 6,
          powerOnHours: 5210,
          readErrors: 0,
          writeErrors: 0,
        }),
        assessment: { level: "good", notes: [] },
      },
      {
        id: "1",
        model: "Seagate BarraCuda 2TB",
        media: "HDD",
        bus: "SATA",
        health: "Healthy",
        sizeBytes: 2_000_398_934_016,
        letters: ["D:"],
        ...smart({
          temperature: 38,
          temperatureMax: null,
          wear: null,
          powerOnHours: 41_870,
          readErrors: 0,
          writeErrors: 0,
        }),
        assessment: details
          ? {
              level: "warn",
              notes: [
                {
                  level: "warn",
                  text: "HD com mais de 40 mil horas ligado: já é um disco antigo.",
                },
              ],
            }
          : { level: "good", notes: [] },
      },
    ],
  };
}

const hours = (h: number) =>
  h >= 24 * 365
    ? `${(h / (24 * 365)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos ligado`
    : `${h.toLocaleString("pt-BR")} h ligado`;

/**
 * Saúde dos discos físicos: status do Windows na hora e, com permissão de
 * administrador, os contadores SMART (temperatura, desgaste, horas, erros).
 */
export function DiskHealthPanel() {
  const [data, setData] = useState<DiskHealth | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async (details: boolean) => {
    const api = bridge();
    if (api && !api.diskHealth) return null;
    const out = api?.diskHealth
      ? await api.diskHealth(details).catch(() => null)
      : await new Promise<DiskHealth>((r) => setTimeout(() => r(demoHealth(details)), 300));
    if (alive.current && out?.ok) setData(out);
    return out;
  }, []);

  useEffect(() => {
    alive.current = true;
    void load(false);
    return () => {
      alive.current = false;
    };
  }, [load]);

  if (!data?.ok || data.disks.length === 0) return null;

  const showDetails = async () => {
    setLoadingDetails(true);
    const out = await load(true);
    if (!alive.current) return;
    setLoadingDetails(false);
    if (out?.cancelled) toast("Sem permissão de administrador, os detalhes não foram lidos.");
  };

  const worst = data.disks.reduce<Level>((acc, d) => {
    const rank = { good: 0, unknown: 1, warn: 2, bad: 3 };
    return rank[d.assessment.level] > rank[acc] ? d.assessment.level : acc;
  }, "good");

  return (
    <Panel data-wincare-disk-health>
      <PanelHeader
        icon={HeartPulse}
        tone={LEVEL[worst].tone === "neutral" ? "primary" : LEVEL[worst].tone}
        size="sm"
        title="Saúde dos discos"
        description={
          worst === "bad"
            ? "Um disco pode estar perto de falhar. Copie seus arquivos importantes para outro lugar agora."
            : worst === "warn"
              ? "Um disco merece atenção. Veja os detalhes abaixo."
              : "Autodiagnóstico dos discos instalados (SMART), lido do Windows."
        }
        actions={
          !data.hasDetails && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={loadingDetails}
              onClick={() => void showDetails()}
              title="Temperatura, desgaste e erros precisam de permissão de administrador"
            >
              {loadingDetails ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              Ver detalhes
            </Button>
          )
        }
      />
      <ul className="grid gap-3 @3xl/main:grid-cols-2" aria-label="Discos físicos">
        {data.disks.map((disk) => {
          const level = LEVEL[disk.assessment.level];
          const s = disk.smart;
          const facts = [
            s?.temperature ? `${s.temperature} °C` : null,
            s?.wear !== null && s?.wear !== undefined ? `${s.wear}% da vida útil usada` : null,
            s?.powerOnHours ? hours(s.powerOnHours) : null,
            s && (s.readErrors ?? 0) + (s.writeErrors ?? 0) === 0 ? "sem erros" : null,
          ].filter(Boolean);
          return (
            <li
              key={disk.id}
              className={cn(
                "space-y-2 rounded-2xl border border-border/60 bg-card/60 p-4",
                disk.assessment.level === "bad" && "border-destructive/40",
                disk.assessment.level === "warn" && "border-warning/40",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium" title={disk.model}>
                    {disk.model}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      disk.media,
                      disk.bus,
                      formatBytes(disk.sizeBytes),
                      disk.letters.length ? disk.letters.join(" ") : "sem letra",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <StatusBadge tone={level.tone} className="shrink-0">
                  {level.label}
                </StatusBadge>
              </div>
              {facts.length > 0 && (
                <p className="text-sm text-muted-foreground tabular-nums">{facts.join(" · ")}</p>
              )}
              {disk.assessment.notes.map((n) => (
                <p
                  key={n.text}
                  className={cn("text-sm", n.level === "bad" ? "text-destructive" : "text-warning")}
                >
                  {n.text}
                </p>
              ))}
            </li>
          );
        })}
      </ul>
      {!data.hasDetails && (
        <p className="text-xs text-muted-foreground">
          Temperatura, desgaste do SSD, horas ligado e erros pedem permissão de administrador uma
          vez.
        </p>
      )}
    </Panel>
  );
}
