import { getNative } from "./bridge";

export interface ProgramUpdate {
  /** Id do winget ("Git.Git"); é tudo o que o renderer manda de volta. */
  id: string;
  name: string;
  version: string | null;
  available: string;
  source: string | null;
}

export interface ProgramUpdateList {
  ok: boolean;
  reason?: string;
  items: ProgramUpdate[];
  at?: number;
}

export interface ProgramUpdateResult {
  ok: boolean;
  id?: string;
  name?: string;
  version?: string;
  reason?: string;
  message?: string;
}

interface UpdatesBridge {
  programUpdates?: () => Promise<ProgramUpdateList>;
  updateProgram?: (id: string) => Promise<ProgramUpdateResult>;
}

const native = () => getNative() as (ReturnType<typeof getNative> & UpdatesBridge) | null;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let demo: ProgramUpdate[] = [
  { id: "Git.Git", name: "Git", version: "2.56.0", available: "2.56.1", source: "winget" },
  {
    id: "Mozilla.Firefox",
    name: "Mozilla Firefox",
    version: "144.0",
    available: "145.0.1",
    source: "winget",
  },
  {
    id: "Zoom.Zoom",
    name: "Zoom Workplace",
    version: "7.1.9",
    available: "7.2.5",
    source: "winget",
  },
  {
    id: "VideoLAN.VLC",
    name: "VLC media player",
    version: "3.0.20",
    available: "3.0.22",
    source: "winget",
  },
];

/** A lista do winget demora (10–30 s): guarda por 30 min entre as telas. */
const CACHE_MS = 30 * 60 * 1000;
let cache: ProgramUpdateList | null = null;

export function cachedProgramUpdates() {
  return cache && cache.at && Date.now() - cache.at < CACHE_MS ? cache : null;
}

export async function listProgramUpdates(force = false): Promise<ProgramUpdateList> {
  const hit = !force && cachedProgramUpdates();
  if (hit) return hit;
  const bridge = native();
  let out: ProgramUpdateList;
  if (bridge?.programUpdates) {
    out = await bridge.programUpdates();
  } else if (bridge) {
    out = { ok: false, reason: "unsupported", items: [] };
  } else {
    await wait(600);
    out = { ok: true, items: [...demo], at: Date.now() };
  }
  if (out.ok) cache = { ...out, at: out.at ?? Date.now() };
  return out;
}

export async function updateProgram(id: string): Promise<ProgramUpdateResult> {
  const bridge = native();
  let out: ProgramUpdateResult;
  if (bridge?.updateProgram) {
    out = await bridge.updateProgram(id);
  } else {
    await wait(1500);
    const item = demo.find((p) => p.id === id);
    demo = demo.filter((p) => p.id !== id);
    out = { ok: true, id, name: item?.name, version: item?.available };
  }
  if (out.ok && cache) cache = { ...cache, items: cache.items.filter((p) => p.id !== id) };
  return out;
}
