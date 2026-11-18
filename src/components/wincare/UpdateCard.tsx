import { Download, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppUpdater } from "@/lib/wincare/useUpdate";
import { Panel, PanelHeader } from "./Panel";
import { PreferenceSwitches } from "./Preferences";
import { StatusBadge } from "./StatusBadge";

function phaseLabel(phase: string | undefined, percent: number) {
  switch (phase) {
    case "download":
      return `Baixando atualização… ${percent}%`;
    case "extract":
      return "Extraindo arquivos…";
    case "apply":
      return "Preparando substituição…";
    case "check":
      return "Consultando GitHub…";
    default:
      return "Atualizando…";
  }
}

export function UpdateCard() {
  const { native, version, info, checking, applying, progress, check, apply, openReleasePage } =
    useAppUpdater();

  const current = info?.currentVersion || version || "—";
  const latest = info?.latestVersion;
  const updateAvailable = !!info?.updateAvailable;

  return (
    <Panel padding="lg">
      <PanelHeader
        icon={Download}
        size="sm"
        title="Atualizações"
        badges={
          <>
            <StatusBadge tone="primary">Versão instalada: {current}</StatusBadge>
            {latest && (
              <StatusBadge tone={updateAvailable ? "warning" : "success"}>
                {updateAvailable ? `Nova versão: ${latest}` : "Você está na versão mais recente"}
              </StatusBadge>
            )}
          </>
        }
      />

      <p className="text-sm text-muted-foreground">
        O WinCare consulta as versões publicadas no GitHub e, no app instalado, baixa o ZIP e
        substitui os arquivos sozinho ao reiniciar.
      </p>

      <PreferenceSwitches keys={["autoCheckUpdates"]} />

      {(applying || progress) && (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            {phaseLabel(progress?.phase, progress?.percent ?? 0)}
          </p>
          <Progress
            value={progress?.percent ?? (applying ? 8 : 0)}
            className="h-1.5"
            aria-label="Progresso da atualização"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!native || checking || applying}
          onClick={() => void check(false)}
        >
          <RefreshCw className={checking ? "animate-spin" : undefined} />
          {checking ? "Verificando…" : "Verificar atualizações"}
        </Button>

        {updateAvailable && (
          <Button
            type="button"
            disabled={!native || applying || checking}
            onClick={() => void apply()}
          >
            <Download />
            {applying ? "Atualizando…" : `Atualizar para ${latest}`}
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          disabled={applying}
          onClick={() => void openReleasePage()}
        >
          Abrir no GitHub
        </Button>
      </div>

      {!native && (
        <p className="text-xs text-muted-foreground">
          Disponível só no app desktop. No navegador os comandos são simulados.
        </p>
      )}
      {native && info && info.packaged === false && (
        <p className="text-xs text-muted-foreground">
          Modo de desenvolvimento: a verificação funciona, mas a substituição automática só roda no
          ZIP empacotado.
        </p>
      )}
    </Panel>
  );
}
