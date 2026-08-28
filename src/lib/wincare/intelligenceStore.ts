import { useCallback, useRef, useSyncExternalStore } from "react";

import {
  seedHealthHistory,
  type GamingSession,
  type HealthSample,
  type ProfileId,
  type StartupWatchItem,
  type StorageScan,
  type SystemSnapshot,
} from "./intelligence";

interface IntelState {
  samples: HealthSample[];
  snapshots: SystemSnapshot[];
  startupKnown: StartupWatchItem[];
  startupNewIds: string[];
  sessions: GamingSession[];
  activeSession: GamingSession | null;
  profile: ProfileId;
  lastStorageScan: StorageScan | null;
  lastFolderBytes: Record<string, number>;
}

const KEY = "wincare-intelligence";
const MAX_SAMPLES = 96;
const SAMPLE_GAP_MS = 10 * 60 * 1000;
const MAX_SNAPSHOTS = 12;
const MAX_SESSIONS = 20;

const initial: IntelState = {
  samples: seedHealthHistory(),
  snapshots: [],
  startupKnown: [],
  startupNewIds: [],
  sessions: [],
  activeSession: null,
  profile: "balanced",
  lastStorageScan: null,
  lastFolderBytes: {},
};

let state: IntelState = { ...initial };
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let hydrated = false;

function emit() {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      window.localStorage.setItem(
        KEY,
        JSON.stringify({
          samples: state.samples.slice(-MAX_SAMPLES),
          snapshots: state.snapshots.slice(0, MAX_SNAPSHOTS),
          startupKnown: state.startupKnown.slice(-80),
          startupNewIds: state.startupNewIds.slice(0, 20),
          sessions: state.sessions.slice(0, MAX_SESSIONS),
          activeSession: state.activeSession,
          profile: state.profile,
          lastStorageScan: state.lastStorageScan
            ? {
                ...state.lastStorageScan,
                largeFiles: state.lastStorageScan.largeFiles.slice(0, 25),
                duplicates: state.lastStorageScan.duplicates.slice(0, 12),
              }
            : null,
          lastFolderBytes: state.lastFolderBytes,
        }),
      );
    } catch {
      /* ignore quota */
    }
  }, 80);
  listeners.forEach((l) => l());
}

function setState(patch: Partial<IntelState>) {
  state = { ...state, ...patch };
  emit();
}

export function hydrateIntelligence() {
  if (typeof window === "undefined" || hydrated) return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      state = { ...initial, samples: seedHealthHistory() };
      emit();
      return;
    }
    const parsed = JSON.parse(raw) as Partial<IntelState>;
    state = {
      ...initial,
      ...parsed,
      samples: Array.isArray(parsed.samples) ? parsed.samples.slice(-MAX_SAMPLES) : seedHealthHistory(),
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots.slice(0, MAX_SNAPSHOTS) : [],
      startupKnown: Array.isArray(parsed.startupKnown) ? parsed.startupKnown : [],
      startupNewIds: Array.isArray(parsed.startupNewIds) ? parsed.startupNewIds : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions.slice(0, MAX_SESSIONS) : [],
      lastFolderBytes: parsed.lastFolderBytes && typeof parsed.lastFolderBytes === "object" ? parsed.lastFolderBytes : {},
    };
    if (state.samples.length === 0) state.samples = seedHealthHistory();
  } catch {
    state = { ...initial, samples: seedHealthHistory() };
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const getSnapshot = () => state;

export function getIntelState() {
  return state;
}

export function useIntel<T>(selector: (s: IntelState) => T): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const cacheRef = useRef<T>();
  const hasCache = useRef(false);

  const take = (store: IntelState) => {
    const next = selectorRef.current(store);
    if (hasCache.current && Object.is(cacheRef.current, next)) {
      return cacheRef.current as T;
    }
    hasCache.current = true;
    cacheRef.current = next;
    return next;
  };

  return useSyncExternalStore(
    subscribe,
    () => take(getSnapshot()),
    () => take(getSnapshot()),
  );
}

export const intelActions = {
  recordSample(sample: HealthSample, force = false) {
    const last = state.samples[state.samples.length - 1];
    if (!force && last && sample.ts - last.ts < SAMPLE_GAP_MS) return;
    const next = [...state.samples, sample].slice(-MAX_SAMPLES);
    setState({ samples: next });
  },
  addSnapshot(snap: SystemSnapshot) {
    setState({ snapshots: [snap, ...state.snapshots].slice(0, MAX_SNAPSHOTS) });
  },
  removeSnapshot(id: string) {
    setState({ snapshots: state.snapshots.filter((s) => s.id !== id) });
  },
  setStartupWatch(known: StartupWatchItem[], newIds: string[]) {
    setState({ startupKnown: known, startupNewIds: newIds });
  },
  dismissStartupNews() {
    setState({ startupNewIds: [] });
  },
  setProfile(profile: ProfileId) {
    setState({ profile });
  },
  setStorageScan(scan: StorageScan, folderBytes?: Record<string, number>) {
    setState({
      lastStorageScan: scan,
      lastFolderBytes: folderBytes ?? state.lastFolderBytes,
    });
  },
  startSession(game: string, cpu: number, ram: number, gpu: number | null) {
    if (state.activeSession && state.activeSession.game === game) return;
    if (state.activeSession) intelActions.endSession();
    const session: GamingSession = {
      id: `gs-${Date.now()}`,
      game,
      startedAt: Date.now(),
      samples: 1,
      avgCpu: cpu,
      avgRam: ram,
      avgGpu: gpu,
      maxCpu: cpu,
      maxGpu: gpu,
    };
    setState({ activeSession: session });
  },
  tickSession(cpu: number, ram: number, gpu: number | null) {
    const cur = state.activeSession;
    if (!cur) return;
    const n = cur.samples + 1;
    const avgGpu =
      gpu == null && cur.avgGpu == null
        ? null
        : Math.round((((cur.avgGpu ?? 0) * cur.samples + (gpu ?? 0)) / n) * 10) / 10;
    setState({
      activeSession: {
        ...cur,
        samples: n,
        avgCpu: Math.round(((cur.avgCpu * cur.samples + cpu) / n) * 10) / 10,
        avgRam: Math.round(((cur.avgRam * cur.samples + ram) / n) * 10) / 10,
        avgGpu,
        maxCpu: Math.max(cur.maxCpu, cpu),
        maxGpu: gpu == null ? cur.maxGpu : Math.max(cur.maxGpu ?? 0, gpu),
      },
    });
  },
  endSession() {
    const cur = state.activeSession;
    if (!cur) return;
    const finished = { ...cur, endedAt: Date.now() };
    setState({
      activeSession: null,
      sessions: [finished, ...state.sessions].slice(0, MAX_SESSIONS),
    });
  },
};

export function useIntelActions() {
  return {
    recordSample: useCallback(intelActions.recordSample, []),
    addSnapshot: useCallback(intelActions.addSnapshot, []),
  };
}
