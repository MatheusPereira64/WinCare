import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  ShieldHalf,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { openWindowsTarget } from "@/lib/wincare/bridge";
import { plural } from "@/lib/wincare/format";
import {
  browserExtensions,
  securityStatus,
  type BrowserExtension,
  type SecurityStatus,
} from "@/lib/wincare/systemTools";
import { useResource } from "@/lib/wincare/useResource";
import { ChoiceChips } from "./ChoiceChips";
import { ListPanel, Panel, PanelHeader } from "./Panel";
import { EmptyState, LoadingState, ResourceView } from "./States";
import { StatusBadge } from "./StatusBadge";

interface Check {
  id: string;
  label: string;
  ok: boolean | null;
  detail: string;
  /** Página do Windows que resolve (só abre; não muda nada sozinho). */
  open?: string;
}

/** Itens da proteção a partir da leitura do Windows (puro, fácil de testar na tela). */
function buildChecks(s: SecurityStatus): Check[] {
  const checks: Check[] = [];
  const thirdParty = s.otherAntivirus.filter((a) => a.enabled);
  if (s.defender) {
    const protectedByOther = !s.defender.realtime && thirdParty.length > 0;
    checks.push({
      id: "realtime",
      label: "Proteção em tempo real",
      ok: s.defender.realtime || protectedByOther,
      detail: s.defender.realtime
        ? "Microsoft Defender ligado"
        : protectedByOther
          ? `Feita por ${thirdParty.map((a) => a.name).join(", ")}`
          : "Desligada: arquivos novos não são verificados",
      open: "start windowsdefender://threat",
    });
    if (s.defender.realtime) {
      checks.push({
        id: "signatures",
        label: "Definições de vírus",
        ok: s.defender.signatureAgeDays <= 3,
        detail:
          s.defender.signatureAgeDays <= 0
            ? "Atualizadas hoje"
            : `Atualizadas há ${plural(s.defender.signatureAgeDays, "dia", "dias")}`,
        open: "start windowsdefender://threat",
      });
      checks.push({
        id: "tamper",
        label: "Proteção contra adulteração",
        ok: s.defender.tamper,
        detail: s.defender.tamper
          ? "Impede que programas desliguem o Defender"
          : "Desligada: outro programa pode desativar o Defender",
        open: "start windowsdefender://threatsettings",
      });
      if (s.defender.quickScanAgeDays !== null) {
        checks.push({
          id: "scan",
          label: "Última verificação",
          ok: s.defender.quickScanAgeDays <= 14,
          detail:
            s.defender.quickScanAgeDays <= 0
              ? "Hoje"
              : `Há ${plural(s.defender.quickScanAgeDays, "dia", "dias")}`,
          open: "start windowsdefender://threat",
        });
      }
    }
  } else if (thirdParty.length) {
    checks.push({
      id: "realtime",
      label: "Antivírus",
      ok: true,
      detail: thirdParty.map((a) => a.name).join(", "),
    });
  }
  for (const profile of s.firewall) {
    checks.push({
      id: `fw-${profile.id}`,
      label: `Firewall · ${profile.name}`,
      ok: profile.enabled,
      detail: profile.enabled ? "Ligado" : "Desligado: conexões de fora não são filtradas",
      open: "start windowsdefender://network",
    });
  }
  if (s.uacEnabled !== null) {
    checks.push({
      id: "uac",
      label: "Controle de Conta de Usuário (UAC)",
      ok: s.uacEnabled,
      detail: s.uacEnabled
        ? "Pede confirmação antes de mudanças de administrador"
        : "Desligado: programas viram administrador sem perguntar",
      open: "start useraccountcontrolsettings",
    });
  }
  if (s.smartScreen) {
    const on = !/^off$/i.test(s.smartScreen);
    checks.push({
      id: "smartscreen",
      label: "SmartScreen para apps e arquivos",
      ok: on,
      detail: on ? "Avisa antes de abrir programas desconhecidos" : "Desligado",
      open: "start windowsdefender://appbrowser",
    });
  }
  return checks;
}

const LEVEL: Record<
  BrowserExtension["level"],
  { label: string; tone: "danger" | "warning" | "neutral" }
> = {
  high: { label: "Acesso amplo + dados pessoais", tone: "danger" },
  medium: { label: "Acesso amplo", tone: "warning" },
  low: { label: "Acesso limitado", tone: "neutral" },
};

/**
 * Proteção: consulta as defesas do próprio Windows (Defender, firewall, UAC,
 * SmartScreen) e mostra extensões de navegador com permissões amplas. Só lê;
 * os botões abrem a tela do Windows certa para você decidir.
 */
export function SecurityOverview() {
  const security = useResource(securityStatus, {
    errorMessage: "Não foi possível ler a proteção do Windows.",
  });
  const extensions = useResource(browserExtensions, {
    errorMessage: "Não foi possível ler as extensões dos navegadores.",
    delayMs: 300,
  });
  const [extFilter, setExtFilter] = useState<"review" | "all">("review");

  const checks = useMemo(
    () => (security.data?.ok ? buildChecks(security.data) : []),
    [security.data],
  );
  const problems = checks.filter((c) => c.ok === false).length;

  const extList = useMemo(() => {
    const all = extensions.data ?? [];
    return extFilter === "review" ? all.filter((e) => e.level !== "low") : all;
  }, [extensions.data, extFilter]);

  return (
    <div className="grid gap-4 @5xl/main:grid-cols-2">
      <Panel>
        <PanelHeader
          icon={problems ? ShieldHalf : ShieldCheck}
          tone={problems ? "warning" : "success"}
          title="Proteção do Windows"
          badges={
            security.status === "ready" && (
              <StatusBadge tone={problems ? "warning" : "success"}>
                {problems
                  ? plural(problems, "ponto de atenção", "pontos de atenção")
                  : "Tudo ligado"}
              </StatusBadge>
            )
          }
          description="Consulta as defesas do próprio Windows. Nada é alterado daqui."
          actions={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full"
              disabled={security.refreshing}
              onClick={() => void security.reload()}
            >
              <RefreshCw className={security.refreshing ? "animate-spin" : undefined} /> Verificar
            </Button>
          }
        />
        <ResourceView
          resource={security}
          errorTitle="Não foi possível ler a proteção"
          loading={<LoadingState label="Consultando Defender, firewall e UAC…" rows={4} />}
        >
          {(data) =>
            !data.ok ? (
              <EmptyState icon={ShieldHalf} title="Indisponível" description={data.reason} />
            ) : (
              <ul className="space-y-2" aria-label="Itens de proteção">
                {checks.map((check) => (
                  <li
                    key={check.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                      check.ok === false
                        ? "border-warning/40 bg-warning/5"
                        : "border-border/50 bg-card/50",
                    )}
                  >
                    {check.ok === false ? (
                      <CircleAlert aria-hidden className="size-5 shrink-0 text-warning" />
                    ) : (
                      <CheckCircle2 aria-hidden className="size-5 shrink-0 text-success" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{check.label}</p>
                      <p className="text-xs text-muted-foreground">{check.detail}</p>
                    </div>
                    {check.open && check.ok === false && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0 rounded-full"
                        onClick={() => void openWindowsTarget(check.open!)}
                      >
                        <ExternalLink /> Abrir
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </ResourceView>
      </Panel>

      <Panel>
        <PanelHeader
          icon={Puzzle}
          title="Extensões de navegador"
          description="Extensões que leem todos os sites ou dados pessoais. Vale revisar as que você não reconhece."
        />
        <ChoiceChips
          label="Quais extensões mostrar"
          value={extFilter}
          options={[
            { value: "review", label: "Para revisar" },
            { value: "all", label: "Todas" },
          ]}
          onChange={setExtFilter}
        />
        <ResourceView
          resource={extensions}
          errorTitle="Não foi possível ler as extensões"
          loading={<LoadingState label="Lendo Chrome, Edge, Brave e Firefox…" rows={3} />}
        >
          {() =>
            extList.length === 0 ? (
              <EmptyState
                icon={Puzzle}
                title={extFilter === "review" ? "Nada para revisar" : "Nenhuma extensão encontrada"}
                description="Nenhuma extensão instalada pede acesso amplo."
              />
            ) : (
              <ListPanel label="Extensões" className="max-h-[420px] overflow-y-auto">
                {extList.map((ext) => (
                  <li key={ext.id} className="space-y-1 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium" title={ext.name}>
                        {ext.name}
                      </p>
                      <StatusBadge tone={LEVEL[ext.level].tone}>
                        {LEVEL[ext.level].label}
                      </StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {ext.browser}
                      {ext.profile !== "Padrão" && ` · perfil ${ext.profile}`} · v{ext.version}
                      {ext.enabled === false && " · desativada"}
                    </p>
                    {ext.reasons.length > 0 && (
                      <p className="text-xs">
                        <span className="text-muted-foreground">Pode: </span>
                        {ext.reasons.join(", ")}.
                      </p>
                    )}
                  </li>
                ))}
              </ListPanel>
            )
          }
        </ResourceView>
        <p className="text-xs text-muted-foreground">
          Para remover, abra a página de extensões do navegador (chrome://extensions,
          edge://extensions ou about:addons).
        </p>
      </Panel>
    </div>
  );
}
