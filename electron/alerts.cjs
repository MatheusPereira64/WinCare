/*
 * Alertas em segundo plano — regras puras (sem Electron), testadas em
 * electron/tests/alerts.test.cjs. Quem lê o sistema, mostra a notificação e
 * monta a bandeja é electron/background.cjs.
 *
 * "Sem ser chato":
 * - limites mais altos que os das recomendações (a notificação interrompe; a
 *   recomendação só aparece quando você abre o app);
 * - histerese: um valor oscilando perto do limite não liga e desliga o alerta;
 * - um aviso por problema; lembrete só depois de um bom tempo (REMIND_MS);
 * - no máximo uma notificação a cada 10 minutos (várias viram uma só);
 * - nada nos primeiros minutos depois de ligar o PC, nem com alertas silenciados,
 *   nem com a janela do WinCare em foco (o painel de recomendações já mostra).
 */

const GB = 1024 ** 3;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const ALERT_TYPES = ["disk", "temperature", "defender", "windowsUpdate"];

const THRESHOLDS = Object.freeze({
  /** Disco do sistema: liga com menos de 10 GB livres ou 95% usados… */
  diskFreeBytes: 10 * GB,
  diskUsedPct: 95,
  /** …e só desliga com folga (12 GB e abaixo de 93%). */
  diskClearFreeBytes: 12 * GB,
  diskClearUsedPct: 93,
  /** CPU ou GPU a 90 °C em duas leituras seguidas (alguns minutos). */
  tempHotC: 90,
  tempHotReadings: 2,
  tempClearC: 80,
  /** Última atualização instalada há 45 dias ou mais (mesmo limite da recomendação). */
  updateStaleDays: 45,
});

/** De quanto em quanto tempo cada verificação roda (leve: quase tudo é raro). */
const CHECK_EVERY_MS = Object.freeze({
  disk: 5 * MINUTE,
  temperature: 3 * MINUTE,
  defender: 30 * MINUTE,
  windowsUpdate: 6 * HOUR,
});

/** Com o problema ainda ativo, lembra depois de… */
const REMIND_MS = Object.freeze({
  disk: DAY,
  temperature: 2 * HOUR,
  defender: DAY,
  windowsUpdate: 7 * DAY,
});

/** Problema que some e volta: novo aviso só depois de… (evita pisca-pisca). */
const REARM_MS = Object.freeze({
  disk: 6 * HOUR,
  temperature: HOUR,
  defender: HOUR,
  windowsUpdate: 7 * DAY,
});

const MIN_GAP_MS = 10 * MINUTE;
const STARTUP_GRACE_MS = 2 * MINUTE;
const LOGIN_GRACE_MS = 5 * MINUTE;

/** Página do WinCare que resolve cada alerta (clique na notificação / no menu). */
const ALERT_ROUTE = Object.freeze({
  disk: "/limpeza",
  temperature: "/monitoramento",
  defender: "/",
  windowsUpdate: "/",
});

const pct = (n) => `${Math.round(n)}%`;
const gbText = (bytes) =>
  `${(Math.round((bytes / GB) * 10) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;

/* ------------------------------ Avaliação ------------------------------ */

/**
 * Cada regra recebe a leitura e o estado anterior do alerta e devolve
 * { active, detail } — `null` quando não dá para saber (leitura falhou):
 * aí o estado anterior continua valendo.
 */
function evaluateDisk(reading, wasActive) {
  if (!reading || !(reading.totalBytes > 0) || !(reading.freeBytes >= 0)) return null;
  const usedPct = ((reading.totalBytes - reading.freeBytes) / reading.totalBytes) * 100;
  const trigger = reading.freeBytes < THRESHOLDS.diskFreeBytes || usedPct >= THRESHOLDS.diskUsedPct;
  const clear =
    reading.freeBytes >= THRESHOLDS.diskClearFreeBytes && usedPct < THRESHOLDS.diskClearUsedPct;
  const active = wasActive ? !clear : trigger;
  return {
    active,
    detail: { drive: reading.drive || "C:", freeBytes: reading.freeBytes, usedPct },
  };
}

function evaluateTemperature(reading, prev = {}) {
  if (!reading) return null;
  const values = [reading.cpu, reading.gpu].filter((v) => typeof v === "number" && v > 0);
  if (!values.length) return null;
  const max = Math.max(...values);
  const source = reading.gpu === max && reading.cpu !== max ? "GPU" : "CPU";
  const hot = max >= THRESHOLDS.tempHotC;
  const streak = hot ? (prev.streak || 0) + 1 : 0;
  let active = !!prev.active;
  if (!active && streak >= THRESHOLDS.tempHotReadings) active = true;
  if (active && max < THRESHOLDS.tempClearC) active = false;
  return { active, streak, detail: { max, source } };
}

/** Defender desligado só é problema se nenhum outro antivírus estiver ligado. */
function evaluateDefender(reading) {
  if (!reading || typeof reading.realtime !== "boolean") return null;
  const others = Array.isArray(reading.otherAntivirus) ? reading.otherAntivirus : [];
  return { active: reading.realtime === false && others.length === 0, detail: {} };
}

function evaluateWindowsUpdate(reading, now) {
  const last = reading && Date.parse(reading.lastInstalled);
  if (!Number.isFinite(last)) return null;
  const days = Math.floor((now - last) / DAY);
  return { active: days >= THRESHOLDS.updateStaleDays, detail: { days, lastInstalled: last } };
}

/**
 * Estado do alerta depois de uma leitura. Um problema que aparece abre um
 * "episódio" novo (ainda não avisado); leitura que falhou (null) não muda nada.
 */
function nextAlertState(prev = {}, result, now) {
  if (!result) return prev;
  const base = {
    lastNotifiedAt: prev.lastNotifiedAt || 0,
    streak: result.streak ?? 0,
    detail: result.detail,
  };
  if (result.active && !prev.active) {
    return { ...base, active: true, since: now, episodeNotified: false };
  }
  if (result.active) {
    return {
      ...base,
      active: true,
      since: prev.since || now,
      episodeNotified: !!prev.episodeNotified,
    };
  }
  return { ...base, active: false, since: 0, episodeNotified: false };
}

/* ------------------------------ Textos ------------------------------ */

function describeAlert(type, detail = {}) {
  switch (type) {
    case "disk":
      return {
        title: `Disco ${detail.drive || "C:"} quase cheio`,
        body: `Restam ${gbText(detail.freeBytes || 0)} livres (${pct(detail.usedPct || 0)} usado). Com pouco espaço o Windows fica lento e as atualizações falham.`,
        short: `Disco ${detail.drive || "C:"} quase cheio (${gbText(detail.freeBytes || 0)} livres)`,
      };
    case "temperature":
      return {
        title: `Temperatura alta: ${detail.source || "CPU"} a ${Math.round(detail.max || 0)} °C`,
        body: `Acima de ${THRESHOLDS.tempHotC} °C há alguns minutos. Verifique a ventilação e a poeira e feche programas pesados.`,
        short: `${detail.source || "CPU"} a ${Math.round(detail.max || 0)} °C`,
      };
    case "defender":
      return {
        title: "Proteção em tempo real desligada",
        body: "O Windows Defender está desligado e nenhum outro antivírus está ativo.",
        short: "Antivírus desligado",
      };
    case "windowsUpdate":
      return {
        title: `Windows sem atualizar há ${detail.days} dias`,
        body: "Atualizações corrigem falhas de segurança. Abra o Windows Update para ficar em dia.",
        short: `Windows sem atualizar há ${detail.days} dias`,
      };
    default:
      return { title: "WinCare", body: "", short: "" };
  }
}

/* ------------------------------ Quando avisar ------------------------------ */

/**
 * Decide quais alertas ativos viram notificação agora.
 * `alerts`: { [tipo]: { active, since, lastNotifiedAt, episodeNotified } }
 * Devolve { due: tipos, reason } — reason explica por que nada sai (testes/log).
 */
function dueNotifications(alerts, ctx) {
  const { now, enabledTypes, snoozeUntil = 0, startedAt = 0, graceMs = STARTUP_GRACE_MS } = ctx;
  if (now - startedAt < graceMs) return { due: [], reason: "grace" };
  if (snoozeUntil > now) return { due: [], reason: "snoozed" };
  if (ctx.lastNotificationAt && now - ctx.lastNotificationAt < MIN_GAP_MS) {
    return { due: [], reason: "gap" };
  }
  const due = [];
  for (const type of ALERT_TYPES) {
    const a = alerts[type];
    if (!a || !a.active || !enabledTypes.includes(type)) continue;
    const last = a.lastNotifiedAt || 0;
    // Episódio novo (problema voltou) ou lembrete de um que continua.
    const wait = a.episodeNotified ? REMIND_MS[type] : REARM_MS[type];
    if (!last || now - last >= wait) due.push(type);
  }
  return { due, reason: due.length ? "due" : "nothing" };
}

/** Uma notificação para um ou vários alertas. */
function composeNotification(types, details) {
  if (types.length === 1) {
    const [type] = types;
    return { ...describeAlert(type, details[type]), route: ALERT_ROUTE[type], types };
  }
  const lines = types.map((t) => `• ${describeAlert(t, details[t]).short}`);
  return {
    title: `${types.length} problemas precisam de atenção`,
    body: lines.join("\n"),
    route: "/",
    types,
  };
}

/* ------------------------------ Bandeja ------------------------------ */

/**
 * Menu da bandeja como dados (o background.cjs liga cada `command` a uma ação).
 */
function trayMenuModel({ active = [], monitorEnabled, snoozeUntil = 0, now, lastCheckAt }) {
  const items = [{ label: "Abrir o WinCare", command: { type: "open" }, bold: true }];
  items.push({ type: "separator" });
  if (!monitorEnabled) {
    items.push({ label: "Alertas desligados", enabled: false });
  } else if (active.length) {
    for (const alert of active) {
      items.push({
        label: `⚠ ${alert.short}`,
        command: { type: "open", to: ALERT_ROUTE[alert.type] },
      });
    }
  } else {
    items.push({
      label: lastCheckAt ? "Nenhum problema encontrado" : "Verificando em segundo plano…",
      enabled: false,
    });
  }
  items.push({ type: "separator" });
  items.push({ label: "Checkup rápido", command: { type: "quick-checkup" } });
  items.push({ label: "Liberar espaço", command: { type: "open", to: "/limpeza" } });
  items.push({ label: "Histórico", command: { type: "open", to: "/historico" } });
  items.push({ label: "Configurações", command: { type: "open", to: "/configuracoes" } });
  items.push({ type: "separator" });
  items.push({
    label: "Avisar sobre problemas",
    type: "checkbox",
    checked: !!monitorEnabled,
    command: { type: "toggle-monitor" },
  });
  if (monitorEnabled) {
    if (snoozeUntil > now) {
      const until = new Date(snoozeUntil).toLocaleString("pt-BR", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      items.push({ label: `Silenciado até ${until} — reativar`, command: { type: "unsnooze" } });
    } else {
      items.push({ label: "Silenciar por 24 horas", command: { type: "snooze" } });
    }
  }
  items.push({ type: "separator" });
  items.push({ label: "Sair do WinCare", command: { type: "quit" } });
  return items;
}

function trayTooltip(active) {
  if (!active.length) return "WinCare";
  if (active.length === 1) return `WinCare — ${active[0].short}`;
  return `WinCare — ${active.length} alertas`;
}

/**
 * Desenha um ponto de aviso no canto do ícone (bitmap BGRA/RGBA quadrado).
 * `order`: "bgra" no Windows (formato nativo do nativeImage), "rgba" nos testes.
 */
function paintAlertDot(bitmap, size, color = { r: 245, g: 158, b: 11 }, order = "bgra") {
  const out = Buffer.from(bitmap);
  const radius = size * 0.23;
  const ring = Math.max(1, size * 0.06);
  const cx = size - radius - ring;
  const cy = size - radius - ring;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > radius + ring) continue;
      const i = (y * size + x) * 4;
      // Anel escuro separa o ponto do desenho do ícone em qualquer fundo.
      const [r, g, b] = d > radius ? [17, 24, 39] : [color.r, color.g, color.b];
      if (order === "bgra") {
        out[i] = b;
        out[i + 1] = g;
        out[i + 2] = r;
      } else {
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
      }
      out[i + 3] = 255;
    }
  }
  return out;
}

module.exports = {
  ALERT_ROUTE,
  ALERT_TYPES,
  CHECK_EVERY_MS,
  LOGIN_GRACE_MS,
  MIN_GAP_MS,
  REARM_MS,
  REMIND_MS,
  STARTUP_GRACE_MS,
  THRESHOLDS,
  composeNotification,
  describeAlert,
  dueNotifications,
  evaluateDefender,
  evaluateDisk,
  evaluateTemperature,
  evaluateWindowsUpdate,
  nextAlertState,
  paintAlertDot,
  trayMenuModel,
  trayTooltip,
};
