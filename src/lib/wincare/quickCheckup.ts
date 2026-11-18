import { useSyncExternalStore } from "react";

import { getNative } from "./bridge";
import { actions } from "./store";
import {
  invalidateSystemData,
  loadDisks,
  loadDiskUsageFolders,
  loadSchedules,
  loadStartupItems,
} from "./systemData";

/*
 * Checkup rápido: lê de novo tudo o que as recomendações usam, em poucos
 * segundos e SEM alterar nada no computador. O resultado aparece no card de
 * Recomendações (Dashboard e Inteligência). Pode ser disparado pelo card ou
 * pelo fim da introdução.
 */

export const CHECKUP_STEPS = [
  { id: "system", label: "Lendo o estado do sistema" },
  { id: "disks", label: "Conferindo os discos" },
  { id: "startup", label: "Verificando a inicialização" },
  { id: "folders", label: "Medindo as pastas que enchem o disco" },
  { id: "schedules", label: "Consultando as rotinas agendadas" },
] as const;

type StepId = (typeof CHECKUP_STEPS)[number]["id"];

const RUNNERS: Record<StepId, () => Promise<unknown>> = {
  system: async () => getNative()?.systemInfo(),
  disks: loadDisks,
  startup: loadStartupItems,
  folders: loadDiskUsageFolders,
  schedules: loadSchedules,
};

export interface CheckupState {
  running: boolean;
  /** Índice da etapa em andamento (0-based). */
  step: number;
  /** Fim do último checkup desta sessão (ms), para o resumo. */
  finishedAt: number | null;
  /** Etapas que não conseguiram ler (o resto do checkup continua). */
  failed: string[];
  /** Pedido para levar o foco ao resultado (ex.: ao concluir a introdução). */
  focusRequest: number;
}

let state: CheckupState = {
  running: false,
  step: 0,
  finishedAt: null,
  failed: [],
  focusRequest: 0,
};
const listeners = new Set<() => void>();

function set(next: Partial<CheckupState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function useQuickCheckup() {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => state,
    () => state,
  );
}

/**
 * Roda o checkup (ignora o pedido se já houver um em andamento).
 * `focusResults`: o card de recomendações recebe o foco para o Narrador
 * acompanhar o progresso e o resultado.
 */
export async function runQuickCheckup({ focusResults = false } = {}) {
  if (state.running) return state;
  set({
    running: true,
    step: 0,
    failed: [],
    ...(focusResults ? { focusRequest: Date.now() } : {}),
  });
  // Descarta leituras em cache: o checkup mostra o estado de agora.
  invalidateSystemData();
  const failed: string[] = [];
  for (let i = 0; i < CHECKUP_STEPS.length; i++) {
    const step = CHECKUP_STEPS[i];
    set({ step: i });
    try {
      await RUNNERS[step.id]();
    } catch {
      failed.push(step.label);
    }
  }
  const finishedAt = Date.now();
  actions.setLastCheckupAt(finishedAt);
  set({ running: false, step: CHECKUP_STEPS.length, finishedAt, failed });
  return state;
}
