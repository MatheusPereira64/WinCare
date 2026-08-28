import { Download, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { actions, useStore } from "@/lib/wincare/store";
import { useAppUpdater } from "@/lib/wincare/useUpdate";

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
  const autoCheckUpdates = useStore((s) => s.autoCheckUpdates);
  const { native, version, info, checking, applying, progress, check, apply, openReleasePage } =
    useAppUpdater();

  const current = info?.currentVersion || version || "—";
  const latest = info?.latestVersion;
  const updateAvailable = !!info?.updateAvailable;

  return (
    <Card className="surface-panel gap-4 border-border/60 p-6">
      <div className="flex items-center gap-2">
        <Download className="size-5 text-primary" />
        <h2 className="font-semibold">Atualizações</h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="w-fit border-primary/40 text-primary">
          Versão instalada: {current}
        </Badge>
        {latest && (
          <Badge
            variant="outline"
            className={
              updateAvailable
                ? "w-fit border-warning/40 bg-warning/10 text-warning"
                : "w-fit border-success/40 bg-success/10 text-success"
            }
          >
            {updateAvailable ? `Nova: ${latest}` : `Atual: ${latest}`}
          </Badge>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        O WinCare consulta o GitHub Releases e, no app portátil instalado, baixa o ZIP e substitui
        os arquivos automaticamente ao reiniciar.
      </p>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="auto-updates">Verificar ao iniciar</Label>
          <p className="text-sm text-muted-foreground">
            Ao abrir o app, consulta as tags de release no GitHub e mostra um popup se houver
            versão mais nova.
          </p>
        </div>
        <Switch
          id="auto-updates"
          checked={autoCheckUpdates}
          onCheckedChange={actions.setAutoCheckUpdates}
        />
      </div>

      {(applying || progress) && (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            {phaseLabel(progress?.phase, progress?.percent ?? 0)}
          </p>
          <Progress value={progress?.percent ?? (applying ? 8 : 0)} className="h-1.5" />
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

        <Button type="button" variant="ghost" disabled={applying} onClick={() => void openReleasePage()}>
          Abrir no GitHub
        </Button>
      </div>

      {!native && (
        <p className="text-xs text-muted-foreground">
          Disponível apenas no aplicativo desktop. No navegador os comandos são simulados.
        </p>
      )}
      {native && info && info.packaged === false && (
        <p className="text-xs text-muted-foreground">
          Modo desenvolvimento: a verificação funciona, mas a substituição automática só roda no
          ZIP empacotado.
        </p>
      )}
    </Card>
  );
}
