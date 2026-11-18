import { useCallback, useSyncExternalStore } from "react";
import type { RecommendationDismissal } from "./recommendations";
import type { RunRecord } from "./types";
import { getNative } from "./bridge";
import { DEFAULT_ZOOM, sanitizeZoom, stepZoom, type ZoomCommand } from "./zoom";

interface State {
  runs: RunRecord[];
  favorites: string[];
  theme: "dark" | "light";
  autoCheck: boolean;
  autoCheckUpdates: boolean;
  confirmCritical: boolean;
  autoRestorePoint: boolean;
  /** Fator de zoom da interface (1 = 100%). */
  zoom: number;
  /** Preferência de barra lateral expandida em janelas largas. */
  sidebarOpen: boolean;
  /** Recomendações adiadas (until = data) ou ignoradas (until = null), por id. */
  dismissedRecommendations: Record<string, RecommendationDismissal>;
  /** Introdução (primeira execução) concluída ou pulada. */
  onboardingDone: boolean;
  /** Último checkup rápido (ms). */
  lastCheckupAt: number | null;
}

const STORAGE_KEY = "wincare-state";
const MAX_STORAGE_BYTES = 512_000;
const MAX_RUNS = 30;
const MAX_LINES_PER_RUN = 30;

const initial: State = {
  runs: [],
  favorites: ["sfc", "temp"],
  theme: "dark",
  autoCheck: true,
  autoCheckUpdates: true,
  confirmCritical: true,
  autoRestorePoint: true,
  zoom: DEFAULT_ZOOM,
  sidebarOpen: true,
  dismissedRecommendations: {},
  // Só quem nunca abriu o app (sem estado salvo) vê a introdução; ver hydrateStore.
  onboardingDone: false,
  lastCheckupAt: null,
};

const MAX_DISMISSED = 100;
const DAY_MS = 86_400_000;

/** Descarta adiamentos vencidos e entradas inválidas (mantém as ignoradas). */
function cleanDismissed(value: unknown, now = Date.now()): Record<string, RecommendationDismissal> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, RecommendationDismissal] => {
      const d = entry[1] as RecommendationDismissal | null;
      return (
        !!d &&
        typeof d === "object" &&
        typeof d.at === "number" &&
        (d.until === null || (typeof d.until === "number" && d.until > now))
      );
    })
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_DISMISSED);
  return Object.fromEntries(entries);
}

let state: State = initial;
const listeners = new Set<() => void>();

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function sanitizePartial(data: Partial<State>): Partial<State> {
  const next = { ...data };
  if (Array.isArray(next.runs)) {
    next.runs = next.runs
      .filter((r) => r && r.status !== "running")
      .slice(0, MAX_RUNS)
      .map((run) => ({
        ...run,
        lines: Array.isArray(run.lines) ? run.lines.slice(-MAX_LINES_PER_RUN) : [],
        command: typeof run.command === "string" ? run.command.slice(0, 500) : "",
      }));
  }
  if (!Array.isArray(next.favorites)) next.favorites = initial.favorites;
  next.zoom = sanitizeZoom(next.zoom ?? DEFAULT_ZOOM);
  if (typeof next.sidebarOpen !== "boolean") next.sidebarOpen = initial.sidebarOpen;
  next.dismissedRecommendations = cleanDismissed(next.dismissedRecommendations);
  // Estado salvo de uma versão anterior (sem o campo) = usuário que já conhece o app.
  if (typeof next.onboardingDone !== "boolean") next.onboardingDone = true;
  if (typeof next.lastCheckupAt !== "number") next.lastCheckupAt = null;
  return next;
}

function persist() {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          runs: state.runs.slice(0, MAX_RUNS).map((run) => ({
            ...run,
            lines: run.lines.slice(-MAX_LINES_PER_RUN),
          })),
          favorites: state.favorites,
          theme: state.theme,
          autoCheck: state.autoCheck,
          autoCheckUpdates: state.autoCheckUpdates,
          confirmCritical: state.confirmCritical,
          autoRestorePoint: state.autoRestorePoint,
          zoom: state.zoom,
          sidebarOpen: state.sidebarOpen,
          dismissedRecommendations: state.dismissedRecommendations,
          onboardingDone: state.onboardingDone,
          lastCheckupAt: state.lastCheckupAt,
        }),
      );
    } catch {
      /* ignore */
    }
  }, 0);
}

function setState(next: Partial<State>) {
  state = { ...state, ...next };
  persist();
  listeners.forEach((l) => l());
}

export function hydrateStore() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      applyTheme(state.theme);
      applyZoom(state.zoom);
      return;
    }
    if (raw.length > MAX_STORAGE_BYTES) {
      window.localStorage.removeItem(STORAGE_KEY);
      state = { ...initial };
    } else {
      state = { ...state, ...sanitizePartial(JSON.parse(raw) as Partial<State>) };
      persist();
    }
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    state = { ...initial };
  }
  applyTheme(state.theme);
  applyZoom(state.zoom);
  listeners.forEach((l) => l());
}

function applyTheme(theme: "dark" | "light") {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("light", theme === "light");
  void (
    window as unknown as { wincare?: { setNativeTheme?: (t: string) => Promise<void> } }
  ).wincare?.setNativeTheme?.(theme);
}

/**
 * Só o app desktop aplica o zoom: no navegador (modo demonstração) o próprio
 * navegador já tem Ctrl +/− e um zoom CSS não faria os breakpoints reagirem.
 */
function applyZoom(zoom: number) {
  if (typeof window === "undefined") return;
  try {
    getNative()?.setZoomFactor?.(zoom);
  } catch {
    /* ignore */
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const getSnapshot = () => state;

export const getStoreState = () => state;
const getServerSnapshot = () => initial;

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    () => selector(getServerSnapshot()),
  );
}

export const actions = {
  upsertRun(run: RunRecord) {
    const rest = state.runs.filter((r) => r.id !== run.id);
    setState({ runs: [{ ...run, lines: run.lines.slice(-120) }, ...rest] });
  },
  clearRuns() {
    setState({ runs: [] });
  },
  clearPersistedState() {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    setState({ runs: [] });
  },
  toggleFavorite(id: string) {
    const has = state.favorites.includes(id);
    setState({
      favorites: has ? state.favorites.filter((f) => f !== id) : [...state.favorites, id],
    });
  },
  setTheme(theme: "dark" | "light") {
    applyTheme(theme);
    setState({ theme });
  },
  setAutoCheck(autoCheck: boolean) {
    setState({ autoCheck });
  },
  setAutoCheckUpdates(autoCheckUpdates: boolean) {
    setState({ autoCheckUpdates });
  },
  setConfirmCritical(confirmCritical: boolean) {
    setState({ confirmCritical });
  },
  setAutoRestorePoint(autoRestorePoint: boolean) {
    setState({ autoRestorePoint });
  },
  setZoom(value: number) {
    const zoom = sanitizeZoom(value);
    applyZoom(zoom);
    if (zoom !== state.zoom) setState({ zoom });
    return zoom;
  },
  stepZoom(command: ZoomCommand) {
    return actions.setZoom(stepZoom(state.zoom, command));
  },
  setSidebarOpen(sidebarOpen: boolean) {
    if (sidebarOpen !== state.sidebarOpen) setState({ sidebarOpen });
  },
  /** Esconde a recomendação por `days` dias (1 ou 7 na interface). */
  snoozeRecommendation(id: string, days: number) {
    const now = Date.now();
    setState({
      dismissedRecommendations: {
        ...cleanDismissed(state.dismissedRecommendations, now),
        [id]: { until: now + days * DAY_MS, at: now },
      },
    });
  },
  /** Esconde até o usuário restaurar (Inteligência → Adiadas e ignoradas). */
  ignoreRecommendation(id: string) {
    const now = Date.now();
    setState({
      dismissedRecommendations: {
        ...cleanDismissed(state.dismissedRecommendations, now),
        [id]: { until: null, at: now },
      },
    });
  },
  setOnboardingDone(onboardingDone: boolean) {
    if (onboardingDone !== state.onboardingDone) setState({ onboardingDone });
  },
  setLastCheckupAt(lastCheckupAt: number) {
    setState({ lastCheckupAt });
  },
  restoreRecommendation(id: string) {
    if (!(id in state.dismissedRecommendations)) return;
    const { [id]: _removed, ...rest } = state.dismissedRecommendations;
    setState({ dismissedRecommendations: rest });
  },
};

export function useFavorite(id: string) {
  const isFavorite = useStore((s) => s.favorites.includes(id));
  const toggle = useCallback(() => actions.toggleFavorite(id), [id]);
  return { isFavorite, toggle };
}
