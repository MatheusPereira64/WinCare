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

const initial: State = {
  runs: [],
  favorites: ["sfc", "flushdns"],
  theme: "dark",
  autoCheck: true,
  confirmCritical: true,
};

let state: State = initial;
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        runs: state.runs.slice(0, 60),
        favorites: state.favorites,
        theme: state.theme,
        autoCheck: state.autoCheck,
        confirmCritical: state.confirmCritical,
      }),
    );
  } catch {
    /* ignore */
  }
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
    if (raw) state = { ...state, ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    /* ignore */
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
    setState({ runs: [run, ...rest] });
  },
  clearRuns() {
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
