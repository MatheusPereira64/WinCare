/*
 * Histórico de manutenção ("antes e depois"): o que o WinCare fez e quanto ajudou.
 *
 * Fica separado dos logs (logs/wincare.log é texto para diagnóstico; isto é dado
 * estruturado para a tela Histórico) e tem tamanho limitado. Só o processo
 * principal grava: cada ação nativa (limpeza, desinstalação, reparo, rotina
 * agendada) registra aqui o resultado real, não o que a interface acha que houve.
 *
 * Arquivo: %APPDATA%\WinCare\maintenance-history.json — a mesma pasta que a
 * rotina do Agendador de Tarefas enxerga, para ela também registrar.
 */
const fs = require("fs");
const path = require("path");
const logger = require("./logger.cjs");

const FILE_NAME = "maintenance-history.json";
const LEGACY_SCHEDULE_FILE = "schedule-history.json";
const FORMAT_VERSION = 1;

/** Limites: o arquivo nunca passa de ~512 KB (≈ 1.500 eventos + 400 dias de saúde). */
const LIMITS = Object.freeze({
  maxEvents: 1500,
  maxBytes: 512 * 1024,
  maxHealthDays: 400,
  maxTitle: 120,
  maxDetail: 240,
});

/** Uma leitura de saúde a cada 5 min no máximo (o Dashboard consulta a cada 3 s). */
const HEALTH_SAMPLE_GAP_MS = 5 * 60 * 1000;
/** A média do dia vai para o disco a cada 10 min (e ao fechar o app). */
const HEALTH_FLUSH_MS = 10 * 60 * 1000;

const KINDS = new Set(["cleanup", "uninstall", "repair", "check", "optimize", "safety"]);
const SOURCES = new Set(["manual", "scheduled"]);

const clip = (value, max) => {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const pad = (n) => String(n).padStart(2, "0");

/** Dia no fuso do usuário ("2026-11-03"): a média diária segue o calendário dele. */
function localDay(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const nonNegative = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

/** Valida um evento vindo de qualquer lugar (arquivo antigo, outra versão, rotina). */
function sanitizeEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ts = Number(raw.ts);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  if (!KINDS.has(raw.kind)) return null;
  const title = clip(raw.title, LIMITS.maxTitle);
  if (!title) return null;
  const event = {
    id: clip(raw.id || `${ts}`, 60),
    ts: Math.round(ts),
    kind: raw.kind,
    action: clip(raw.action || raw.kind, 40),
    title,
    ok: raw.ok !== false,
    source: SOURCES.has(raw.source) ? raw.source : "manual",
  };
  const detail = clip(raw.detail, LIMITS.maxDetail);
  if (detail) event.detail = detail;
  // Do que se trata (nome do programa removido, do app tirado da inicialização).
  const subject = clip(raw.subject, 80);
  if (subject) event.subject = subject;
  const freedBytes = nonNegative(raw.freedBytes);
  if (freedBytes) event.freedBytes = freedBytes;
  if (freedBytes && raw.estimated === true) event.estimated = true;
  const durationMs = nonNegative(raw.durationMs);
  if (durationMs) event.durationMs = durationMs;
  return event;
}

function sanitizeHealthDay(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.day))) return null;
  const avg = Number(raw.avg);
  const n = Math.round(Number(raw.n));
  if (!Number.isFinite(avg) || !Number.isFinite(n) || n < 1) return null;
  const bound = (v, fallback) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(100, Math.max(0, Math.round(x))) : fallback;
  };
  const rounded = Math.round(Math.min(100, Math.max(0, avg)) * 10) / 10;
  return {
    day: raw.day,
    avg: rounded,
    min: bound(raw.min, Math.round(rounded)),
    max: bound(raw.max, Math.round(rounded)),
    n,
  };
}

const emptyData = () => ({ version: FORMAT_VERSION, events: [], health: [] });

function normalizeData(raw) {
  const data = emptyData();
  if (!raw || typeof raw !== "object") return data;
  const seen = new Set();
  for (const item of Array.isArray(raw.events) ? raw.events : []) {
    const event = sanitizeEvent(item);
    if (!event || seen.has(event.id)) continue;
    seen.add(event.id);
    data.events.push(event);
  }
  data.events.sort((a, b) => b.ts - a.ts);
  const days = new Map();
  for (const item of Array.isArray(raw.health) ? raw.health : []) {
    const day = sanitizeHealthDay(item);
    if (day) days.set(day.day, day);
  }
  data.health = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  return data;
}

/** Corta o mais antigo até caber nos limites (quantidade e tamanho em bytes). */
function enforceLimits(data) {
  data.events = data.events.slice(0, LIMITS.maxEvents);
  data.health = data.health.slice(-LIMITS.maxHealthDays);
  let text = JSON.stringify(data);
  while (Buffer.byteLength(text, "utf8") > LIMITS.maxBytes && data.events.length > 0) {
    const drop = Math.max(1, Math.ceil(data.events.length * 0.05));
    data.events = data.events.slice(0, data.events.length - drop);
    text = JSON.stringify(data);
  }
  return text;
}

/** Rotinas que já rodaram antes desta versão (schedule-history.json) entram no histórico. */
function eventsFromScheduleHistory(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const ts = Date.parse(row?.startedAt);
      if (!Number.isFinite(ts)) return null;
      const finished = Date.parse(row?.finishedAt);
      const cleanup = row.job === "cleanup";
      return sanitizeEvent({
        id: `sched-${row.id || ts}`,
        ts,
        kind: cleanup ? "cleanup" : "repair",
        action: cleanup ? "scheduled-cleanup" : "scheduled-full-check",
        title: cleanup ? "Limpeza agendada" : "Verificação completa agendada",
        detail: row.summary,
        ok: row.ok !== false,
        source: "scheduled",
        freedBytes: row.freedBytes,
        durationMs: Number.isFinite(finished) ? finished - ts : undefined,
      });
    })
    .filter(Boolean);
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return undefined;
    return null;
  }
}

/** Grava em arquivo temporário e troca: um app fechado no meio não deixa JSON pela metade. */
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  try {
    fs.renameSync(tmp, file);
  } catch {
    // Antivírus/indexador segurando o arquivo no Windows: grava direto.
    fs.writeFileSync(file, text, "utf8");
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Armazém do histórico. Cada mudança lê o arquivo, altera e grava de novo
 * (o app aberto e a rotina agendada são processos diferentes e escrevem no
 * mesmo arquivo; nada fica só na memória de um deles).
 */
function createHistoryStore({ file, legacyFile, now = Date.now, onChange } = {}) {
  let pendingHealth = null;
  let lastSampleAt = 0;
  let flushTimer = null;
  let counter = 0;

  function load() {
    const raw = readJsonFile(file);
    if (raw === undefined) {
      // Primeira vez: traz as rotinas agendadas que já rodaram.
      const legacy = legacyFile ? readJsonFile(legacyFile) : undefined;
      const data = emptyData();
      data.events = eventsFromScheduleHistory(legacy).sort((a, b) => b.ts - a.ts);
      return data;
    }
    return normalizeData(raw);
  }

  function save(data) {
    writeAtomic(file, enforceLimits(data));
  }

  function notify() {
    if (!onChange) return;
    try {
      onChange();
    } catch {
      /* a janela pode ter fechado */
    }
  }

  function mutate(change) {
    const data = load();
    change(data);
    save(data);
    notify();
  }

  function mergeHealth(list, sample) {
    const index = list.findIndex((d) => d.day === sample.day);
    if (index < 0) {
      list.push({
        day: sample.day,
        avg: Math.round((sample.sum / sample.n) * 10) / 10,
        min: sample.min,
        max: sample.max,
        n: sample.n,
      });
      list.sort((a, b) => a.day.localeCompare(b.day));
      return;
    }
    const current = list[index];
    const n = current.n + sample.n;
    list[index] = {
      day: current.day,
      avg: Math.round(((current.avg * current.n + sample.sum) / n) * 10) / 10,
      min: Math.min(current.min, sample.min),
      max: Math.max(current.max, sample.max),
      n,
    };
  }

  function flushHealth() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!pendingHealth) return;
    const sample = pendingHealth;
    pendingHealth = null;
    mutate((data) => mergeHealth(data.health, sample));
  }

  function record(input) {
    const ts = now();
    counter = (counter + 1) % 1000;
    const event = sanitizeEvent({
      ...input,
      ts,
      id: `${ts.toString(36)}-${process.pid.toString(36)}-${counter}`,
    });
    if (!event) return null;
    mutate((data) => {
      data.events.unshift(event);
    });
    return event;
  }

  /** Nota de saúde (0–100) da leitura do sistema; vira média, mínimo e máximo por dia. */
  function recordHealth(score) {
    const value = Number(score);
    if (!Number.isFinite(value) || value < 0 || value > 100) return false;
    const ts = now();
    if (lastSampleAt && ts - lastSampleAt < HEALTH_SAMPLE_GAP_MS) return false;
    const first = lastSampleAt === 0;
    lastSampleAt = ts;
    const day = localDay(ts);
    if (pendingHealth && pendingHealth.day !== day) flushHealth();
    const rounded = Math.round(value);
    if (!pendingHealth) {
      pendingHealth = { day, sum: 0, n: 0, min: rounded, max: rounded };
    }
    pendingHealth.sum += value;
    pendingHealth.n += 1;
    pendingHealth.min = Math.min(pendingHealth.min, rounded);
    pendingHealth.max = Math.max(pendingHealth.max, rounded);
    // A primeira leitura da sessão já vai para o disco: a tela mostra a saúde de hoje.
    if (first) flushHealth();
    else if (!flushTimer) {
      flushTimer = setTimeout(flushHealth, HEALTH_FLUSH_MS);
      if (typeof flushTimer.unref === "function") flushTimer.unref();
    }
    return true;
  }

  function read() {
    const data = load();
    if (pendingHealth) mergeHealth(data.health, pendingHealth);
    return data;
  }

  function clear() {
    pendingHealth = null;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    save(emptyData());
    notify();
  }

  return { record, recordHealth, read, clear, flush: flushHealth };
}

/* ----------------------- Comandos da interface ----------------------- */

/**
 * O que cada comando do WinCare significa no histórico. Reconhecido pelo texto
 * que o processo principal de fato executou; comandos de diagnóstico e de
 * consulta (ping, ipconfig /all…) não entram.
 */
const COMMAND_RULES = [
  {
    test: /^sfc(\.exe)?\s+\/scannow\b/i,
    kind: "repair",
    action: "sfc",
    title: "Arquivos do sistema verificados e reparados (SFC)",
  },
  {
    test: /\/Cleanup-Image\s+\/RestoreHealth\b/i,
    kind: "repair",
    action: "dism-restore",
    title: "Imagem do Windows restaurada (DISM)",
  },
  {
    test: /\/Cleanup-Image\s+\/ScanHealth\b/i,
    kind: "check",
    action: "dism-scan",
    title: "Imagem do Windows verificada (DISM ScanHealth)",
  },
  {
    test: /\/Cleanup-Image\s+\/CheckHealth\b/i,
    kind: "check",
    action: "dism-check",
    title: "Verificação rápida da imagem do Windows (DISM)",
  },
  {
    test: /^chkdsk(\.exe)?\s+[a-z]:.*\/f\b/i,
    kind: "repair",
    action: "chkdsk-fix",
    title: "Correção do disco agendada (CHKDSK)",
  },
  {
    test: /^chkdsk(\.exe)?\s+[a-z]:\s*$/i,
    kind: "check",
    action: "chkdsk",
    title: "Disco verificado (CHKDSK)",
  },
  {
    test: /net stop wuauserv/i,
    kind: "repair",
    action: "wu-cache",
    title: "Cache do Windows Update limpo",
  },
  {
    test: /Temporarios limpos/i,
    kind: "cleanup",
    action: "temp",
    title: "Arquivos temporários limpos",
    freedFromResult: true,
  },
  {
    test: /Prefetch limpo/i,
    kind: "cleanup",
    action: "prefetch",
    title: "Prefetch limpo",
  },
  {
    test: /Cache de icones recriado/i,
    kind: "repair",
    action: "icon-cache",
    title: "Cache de ícones e miniaturas recriado",
  },
  {
    test: /^defrag(\.exe)?\s+\/C\b.*\/O\b/i,
    kind: "optimize",
    action: "optimize-drives",
    title: "Unidades otimizadas (TRIM/desfragmentação)",
  },
  {
    test: /^ipconfig(\.exe)?\s+\/flushdns\s*$/i,
    kind: "repair",
    action: "flushdns",
    title: "Cache de DNS limpo",
  },
  {
    test: /^ipconfig(\.exe)?\s+\/release\b.*\/renew/i,
    kind: "repair",
    action: "renew-ip",
    title: "Endereço IP renovado",
  },
  {
    test: /^netsh(\.exe)?\s+winsock\s+reset\s*$/i,
    kind: "repair",
    action: "winsock",
    title: "Winsock redefinido",
  },
  {
    test: /^netsh(\.exe)?\s+int(erface)?\s+ip\s+reset\s*$/i,
    kind: "repair",
    action: "tcpip",
    title: "Protocolo TCP/IP redefinido",
  },
];

/** "Temporarios limpos: 1234.5 MB liberados." → bytes (aceita vírgula decimal). */
function parseFreedMb(text) {
  const match = String(text || "").match(/(-?[\d.,]+)\s*MB\s+liberados/i);
  if (!match) return undefined;
  let raw = match[1];
  if (raw.includes(",") && !raw.includes(".")) raw = raw.replace(",", ".");
  else raw = raw.replace(/,/g, "");
  const mb = Number(raw);
  return Number.isFinite(mb) && mb > 0 ? Math.round(mb * 1024 * 1024) : undefined;
}

const CANCELLED = /negada ou cancelada|cancelad[oa] pelo usu/i;

/** Evento do histórico para um comando executado, ou null se não for manutenção. */
function eventForCommand(command, outcome = {}, durationMs) {
  const text = String(command || "").trim();
  const rule = COMMAND_RULES.find((r) => r.test.test(text));
  if (!rule) return null;
  const result = String(outcome.result || "");
  // UAC recusado: nada foi feito, não é uma manutenção que falhou.
  if (outcome.code !== 0 && CANCELLED.test(result)) return null;
  const ok = outcome.code === 0;
  return {
    kind: rule.kind,
    action: rule.action,
    title: rule.title,
    ok,
    detail: ok ? undefined : result,
    freedBytes: ok && rule.freedFromResult ? parseFreedMb(result) : undefined,
    durationMs,
    source: "manual",
  };
}

/* ----------------------------- Instância ----------------------------- */

let store = null;

/** Abre o histórico na pasta compartilhada do WinCare (%APPDATA%\WinCare). */
function initHistory(dir, options = {}) {
  store = createHistoryStore({
    file: path.join(dir, FILE_NAME),
    legacyFile: path.join(dir, LEGACY_SCHEDULE_FILE),
    onChange: options.onChange,
  });
  return store;
}

/** Registrar nunca derruba a ação: falha de disco só vai para o log. */
function safely(label, fn, fallback) {
  if (!store) return fallback;
  try {
    return fn(store);
  } catch (error) {
    logger.warn("history", `${label} falhou`, error instanceof Error ? error.message : error);
    return fallback;
  }
}

const recordEvent = (event) => safely("registrar", (s) => s.record(event), null);
const recordHealth = (score) => safely("saúde", (s) => s.recordHealth(score), false);
const readHistory = () => safely("ler", (s) => s.read(), emptyData());
const clearHistory = () => safely("apagar", (s) => (s.clear(), true), false);
const flushHistory = () => safely("gravar", (s) => s.flush(), undefined);

function recordCommand(command, outcome, durationMs) {
  const event = eventForCommand(command, outcome, durationMs);
  return event ? recordEvent(event) : null;
}

module.exports = {
  FILE_NAME,
  HEALTH_SAMPLE_GAP_MS,
  LIMITS,
  clearHistory,
  createHistoryStore,
  enforceLimits,
  eventForCommand,
  eventsFromScheduleHistory,
  flushHistory,
  initHistory,
  localDay,
  normalizeData,
  parseFreedMb,
  readHistory,
  recordCommand,
  recordEvent,
  recordHealth,
  sanitizeEvent,
};
