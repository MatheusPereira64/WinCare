import { useCallback, useSyncExternalStore } from "react";
import type { RunRecord } from "./types";

interface State {
  runs: RunRecord[];
  favorites: string[];
  theme: "dark" | "light";
  autoCheck: boolean;
  confirmCritical: boolean;
}

const STORAGE_KEY = "wincare-state";
const MAX_STORAGE_BYTES = 512_000;
const MAX_RUNS = 30;
const MAX_LINES_PER_RUN = 30;

const initial: State = {
  runs: [],
  favorites: ["sfc", "flushdns"],
  theme: "dark",
  autoCheck: true,
  confirmCritical: true,
};

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
          confirmCritical: state.confirmCritical,
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
  listeners.forEach((l) => l());
}

export function applyTheme(theme: "dark" | "light") {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("light", theme === "light");
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const getSnapshot = () => state;
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
  setConfirmCritical(confirmCritical: boolean) {
    setState({ confirmCritical });
  },
};

export function useFavorite(id: string) {
  const isFavorite = useStore((s) => s.favorites.includes(id));
  const toggle = useCallback(() => actions.toggleFavorite(id), [id]);
  return { isFavorite, toggle };
}
