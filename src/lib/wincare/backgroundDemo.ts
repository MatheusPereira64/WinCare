/*
 * Bandeja e alertas no modo demonstração (navegador): sem processo principal,
 * as opções ficam só nesta sessão e as leituras vêm dos dados simulados.
 * Textos dos alertas iguais aos de electron/alerts.cjs.
 */
import type { ActiveAlert, AlertType, BackgroundSettingsPatch, BackgroundState } from "./types";

const DAY = 86_400_000;
const UPDATE_STALE_DAYS = 45;

const demo = {
  closeToTray: false,
  openAtLogin: false,
  monitorEnabled: true,
  types: { disk: true, temperature: true, defender: true, windowsUpdate: true } as Record<
    AlertType,
    boolean
  >,
  snoozeUntil: 0,
  lastCheckAt: 0,
};

const listeners = new Set<(state: BackgroundState) => void>();

function parseBrDate(value: string) {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime() : null;
}

export function demoBackgroundState(lastUpdate: string, now = Date.now()): BackgroundState {
  const at = demo.lastCheckAt || now;
  const last = parseBrDate(lastUpdate);
  const days = last ? Math.floor((now - last) / DAY) : null;
  const active: ActiveAlert[] = [];
  if (
    demo.monitorEnabled &&
    demo.types.windowsUpdate &&
    days !== null &&
    days >= UPDATE_STALE_DAYS
  ) {
    active.push({
      type: "windowsUpdate",
      title: `Windows sem atualizar há ${days} dias`,
      body: "Atualizações corrigem falhas de segurança. Abra o Windows Update para ficar em dia.",
      short: `Windows sem atualizar há ${days} dias`,
      since: at,
      route: "/",
    });
  }
  const check = (summary: string) => ({ at, summary, ok: true });
  return {
    ok: true,
    supported: { tray: false, notifications: false, openAtLogin: false },
    closeToTray: demo.closeToTray,
    openAtLogin: { supported: false, enabled: demo.openAtLogin },
    launchedHidden: false,
    monitor: {
      enabled: demo.monitorEnabled,
      types: { ...demo.types },
      snoozeUntil: demo.snoozeUntil > now ? demo.snoozeUntil : 0,
      lastCheckAt: at,
      checks: {
        disk: check("C: 133 GB livres (72% usado)"),
        temperature: check("CPU 48 °C · GPU 52 °C"),
        defender: check("Proteção em tempo real ligada"),
        windowsUpdate: check(
          days === null
            ? "Não foi possível ler o Windows Update"
            : `Última atualização há ${days} ${days === 1 ? "dia" : "dias"}`,
        ),
      },
      active,
    },
  };
}

export function demoUpdateBackground(patch: BackgroundSettingsPatch, lastUpdate: string) {
  if (typeof patch.closeToTray === "boolean") demo.closeToTray = patch.closeToTray;
  if (typeof patch.openAtLogin === "boolean") demo.openAtLogin = patch.openAtLogin;
  if (typeof patch.monitorEnabled === "boolean") demo.monitorEnabled = patch.monitorEnabled;
  for (const [type, value] of Object.entries(patch.types ?? {})) {
    if (typeof value === "boolean") demo.types[type as AlertType] = value;
  }
  return emit(lastUpdate);
}

export function demoCheckNow(lastUpdate: string) {
  demo.lastCheckAt = Date.now();
  return emit(lastUpdate);
}

export function demoSnooze(hours: number, lastUpdate: string) {
  demo.snoozeUntil = hours > 0 ? Date.now() + hours * 3_600_000 : 0;
  return emit(lastUpdate);
}

function emit(lastUpdate: string) {
  const state = demoBackgroundState(lastUpdate);
  listeners.forEach((listener) => listener(state));
  return state;
}

export function onDemoBackgroundChanged(listener: (state: BackgroundState) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
