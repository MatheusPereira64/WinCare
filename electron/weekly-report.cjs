/*
 * Resumo semanal de saúde: o que o WinCare fez nos últimos 7 dias comparado
 * com os 7 anteriores (espaço liberado, manutenções, programas removidos e
 * saúde média). Puro, testado em electron/tests/features.test.cjs; quem manda
 * a notificação é electron/background.cjs.
 */
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

const pad = (n) => String(n).padStart(2, "0");
function localDay(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function summarizeRange(data, from, to) {
  const events = (data.events || []).filter((e) => e.ts >= from && e.ts < to && e.ok);
  const fromDay = localDay(from);
  const toDay = localDay(to - 1);
  const health = (data.health || []).filter((h) => h.day >= fromDay && h.day <= toDay);
  return {
    freedBytes: events.reduce((n, e) => n + (Number(e.freedBytes) || 0), 0),
    maintenance: events.filter((e) => e.kind !== "safety").length,
    programsRemoved: events.filter((e) => e.kind === "uninstall").length,
    healthAvg: health.length
      ? Math.round(health.reduce((n, h) => n + h.avg, 0) / health.length)
      : null,
  };
}

/** Esta semana × a anterior. `hasData`: vale mandar o resumo. */
function weeklyDigest(data, now = Date.now()) {
  const week = summarizeRange(data, now - WEEK, now + 1);
  const previous = summarizeRange(data, now - 2 * WEEK, now - WEEK);
  return {
    week,
    previous,
    hasData: week.maintenance > 0 || week.healthAvg !== null,
  };
}

const gb = (bytes) =>
  `${(Math.round((bytes / 1024 ** 3) * 10) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;

function plural(n, one, many) {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
}

/** Texto da notificação. */
function describeDigest(digest) {
  const { week, previous } = digest;
  const parts = [];
  if (week.freedBytes >= 50 * 1024 ** 2) parts.push(`${gb(week.freedBytes)} liberados`);
  if (week.maintenance) parts.push(plural(week.maintenance, "manutenção", "manutenções"));
  if (week.programsRemoved) {
    parts.push(plural(week.programsRemoved, "programa removido", "programas removidos"));
  }
  if (week.healthAvg !== null) {
    let health = `saúde média ${week.healthAvg}%`;
    if (previous.healthAvg !== null && week.healthAvg !== previous.healthAvg) {
      const delta = week.healthAvg - previous.healthAvg;
      health += ` (${delta > 0 ? "+" : "−"}${Math.abs(delta)} vs. semana passada)`;
    }
    parts.push(health);
  }
  return {
    title: "Seu resumo da semana no WinCare",
    body: parts.length
      ? `${parts.join(" · ")}. Clique para ver os detalhes.`
      : "Semana tranquila: nada precisou de manutenção.",
  };
}

/**
 * Hora de mandar? Uma vez por semana, na segunda a partir das 9 h (ou se já
 * passaram 8 dias, para quem não liga o PC na segunda). A primeira vez só
 * marca o início — não avisa logo depois de instalar.
 */
function isDigestDue(lastSentAt, now = Date.now()) {
  if (!lastSentAt) return { due: false, mark: true };
  const elapsed = now - lastSentAt;
  if (elapsed >= 8 * DAY) return { due: true };
  const d = new Date(now);
  return { due: elapsed >= 6 * DAY && d.getDay() === 1 && d.getHours() >= 9 };
}

module.exports = { describeDigest, isDigestDue, weeklyDigest };
