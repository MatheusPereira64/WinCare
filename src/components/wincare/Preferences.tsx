import { useId, type ComponentType, type ReactNode } from "react";
import { Download, History, Moon, ShieldAlert, Sun, Zap } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { actions, useStore } from "@/lib/wincare/store";
import { TONE_TEXT, type Tone } from "@/lib/wincare/tone";

/** Linha de preferência: ícone, rótulo, explicação e interruptor (nome + descrição acessíveis). */
export function SettingSwitch({
  icon: Icon,
  tone = "primary",
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  icon: ComponentType<{ className?: string }>;
  tone?: Tone;
  label: string;
  /** Texto corrido (fica dentro de um <p>). */
  description: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    // A linha toda alterna (não só a bolinha): o título já faz isso pelo
    // htmlFor; o clique no switch ou no título não passa aqui de novo.
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-lg",
        !disabled && "cursor-pointer",
      )}
      onClick={(event) => {
        if (disabled) return;
        if ((event.target as HTMLElement).closest("label, [role=switch], a, button")) return;
        onCheckedChange(!checked);
      }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", TONE_TEXT[tone])} />
        <div className="min-w-0">
          <Label htmlFor={id}>{label}</Label>
          <p id={`${id}-desc`} className="text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-desc`}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}

export type PreferenceKey =
  "theme" | "confirmCritical" | "autoRestorePoint" | "autoCheck" | "autoCheckUpdates";

/**
 * As preferências principais, com o mesmo texto nas Configurações e na
 * introdução. Mudam na hora (e ficam salvas neste computador).
 */
export function PreferenceSwitches({ keys }: { keys: PreferenceKey[] }) {
  const theme = useStore((s) => s.theme);
  const confirmCritical = useStore((s) => s.confirmCritical);
  const autoRestorePoint = useStore((s) => s.autoRestorePoint);
  const autoCheck = useStore((s) => s.autoCheck);
  const autoCheckUpdates = useStore((s) => s.autoCheckUpdates);

  const rows: Record<PreferenceKey, Parameters<typeof SettingSwitch>[0]> = {
    theme: {
      icon: theme === "dark" ? Moon : Sun,
      label: "Tema claro",
      description: "Alterna entre o tema escuro padrão e o tema claro.",
      checked: theme === "light",
      onCheckedChange: (v) => actions.setTheme(v ? "light" : "dark"),
    },
    confirmCritical: {
      icon: ShieldAlert,
      tone: "warning",
      label: "Confirmar comandos críticos",
      description: "Mostra um aviso de risco antes de executar ações de nível Atenção ou Avançado.",
      checked: confirmCritical,
      onCheckedChange: actions.setConfirmCritical,
    },
    autoRestorePoint: {
      icon: History,
      tone: "success",
      label: "Ponto de restauração antes de ações avançadas",
      description:
        "Cria um ponto antes de DISM RestoreHealth, chkdsk /f e resets de rede. Se falhar, a ação não é executada sem você confirmar.",
      checked: autoRestorePoint,
      onCheckedChange: actions.setAutoRestorePoint,
    },
    autoCheck: {
      icon: Zap,
      label: "Avisar sobre problemas ao abrir",
      description:
        "Ao abrir o WinCare, mostra um aviso se algo medido precisar de atenção. Rotinas em horário fixo ficam na página Agendamento.",
      checked: autoCheck,
      onCheckedChange: actions.setAutoCheck,
    },
    autoCheckUpdates: {
      icon: Download,
      label: "Verificar atualizações ao abrir",
      description:
        "Ao abrir o WinCare (e a cada 6 horas com ele aberto, inclusive na bandeja), confere no GitHub se há uma versão mais nova e avisa. É a única consulta automática à internet.",
      checked: autoCheckUpdates,
      onCheckedChange: actions.setAutoCheckUpdates,
    },
  };

  return (
    <div className="space-y-5">
      {keys.map((key) => (
        <SettingSwitch key={key} {...rows[key]} />
      ))}
    </div>
  );
}
