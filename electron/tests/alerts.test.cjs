const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ALERT_TYPES,
  CHECK_EVERY_MS,
  MIN_GAP_MS,
  REARM_MS,
  REMIND_MS,
  STARTUP_GRACE_MS,
  composeNotification,
  dueNotifications,
  evaluateDefender,
  evaluateDisk,
  evaluateTemperature,
  evaluateWindowsUpdate,
  nextAlertState,
  paintAlertDot,
  trayMenuModel,
  trayTooltip,
} = require("../alerts.cjs");

const GB = 1024 ** 3;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const disk = (freeGb, totalGb = 500) => ({
  drive: "C:",
  freeBytes: freeGb * GB,
  totalBytes: totalGb * GB,
});

test("disco: avisa com menos de 10 GB livres ou 95% usado", () => {
  assert.equal(evaluateDisk(disk(9, 500), false).active, true);
  assert.equal(evaluateDisk(disk(20, 400), false).active, true, "95% usado");
  assert.equal(evaluateDisk(disk(50, 500), false).active, false, "90%: fica só na recomendação");
  assert.equal(evaluateDisk(null, false), null);
  assert.equal(evaluateDisk({ freeBytes: 1, totalBytes: 0 }, false), null);
});

test("disco: histerese — só desliga com folga (12 GB e abaixo de 93%)", () => {
  assert.equal(evaluateDisk(disk(11, 500), true).active, true, "11 GB ainda é pouco");
  assert.equal(evaluateDisk(disk(30, 500), true).active, true, "94% usado: continua");
  assert.equal(evaluateDisk(disk(30, 500), false).active, false, "94% sem alerta antes: não liga");
  assert.equal(evaluateDisk(disk(60, 500), true).active, false, "88% e 60 GB: desliga");
});

test("temperatura: um pico não avisa; duas leituras seguidas a 90 °C sim", () => {
  let s = evaluateTemperature({ cpu: 95, gpu: null }, {});
  assert.equal(s.active, false);
  assert.equal(s.streak, 1);
  s = evaluateTemperature({ cpu: 60, gpu: null }, s);
  assert.equal(s.streak, 0, "o pico passou");
  s = evaluateTemperature({ cpu: 91 }, s);
  s = evaluateTemperature({ cpu: 92 }, s);
  assert.equal(s.active, true);
  assert.equal(s.detail.source, "CPU");
  s = evaluateTemperature({ cpu: 85 }, s);
  assert.equal(s.active, true, "entre 80 e 90 continua ativo");
  s = evaluateTemperature({ cpu: 79 }, s);
  assert.equal(s.active, false);
  assert.equal(evaluateTemperature({ cpu: 40, gpu: 93 }, {}).detail.source, "GPU");
  assert.equal(evaluateTemperature({ cpu: null, gpu: null }, {}), null, "sem sensor");
});

test("Defender: desligado só é problema sem outro antivírus ativo", () => {
  assert.equal(evaluateDefender({ realtime: false, otherAntivirus: [] }).active, true);
  assert.equal(evaluateDefender({ realtime: false, otherAntivirus: ["Avast"] }).active, false);
  assert.equal(evaluateDefender({ realtime: true, otherAntivirus: [] }).active, false);
  assert.equal(evaluateDefender({ realtime: null }), null);
});

test("Windows Update: 45 dias ou mais sem atualizar", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  const r = evaluateWindowsUpdate({ lastInstalled: "2026-10-04T12:00:00Z" }, now);
  assert.equal(r.active, true);
  assert.equal(r.detail.days, 45);
  assert.equal(evaluateWindowsUpdate({ lastInstalled: "2026-10-05T12:00:00Z" }, now).active, false);
  assert.equal(evaluateWindowsUpdate({ lastInstalled: "nunca" }, now), null);
});

test("estado: problema novo abre episódio; leitura falha não muda nada", () => {
  let a = nextAlertState(undefined, { active: true, detail: { x: 1 } }, 1000);
  assert.deepEqual([a.active, a.since, a.episodeNotified], [true, 1000, false]);
  a = { ...a, episodeNotified: true, lastNotifiedAt: 1000 };
  assert.equal(nextAlertState(a, null, 2000), a);
  const still = nextAlertState(a, { active: true, detail: { x: 2 } }, 3000);
  assert.equal(still.since, 1000);
  assert.equal(still.episodeNotified, true);
  const cleared = nextAlertState(still, { active: false, detail: {} }, 4000);
  assert.equal(cleared.active, false);
  assert.equal(cleared.lastNotifiedAt, 1000, "lembra do último aviso (evita repetir logo)");
});

const ctx = (now, extra = {}) => ({
  now,
  enabledTypes: ALERT_TYPES,
  startedAt: 0,
  ...extra,
});

test("quando avisar: nada nos primeiros minutos, silenciado ou logo após outro aviso", () => {
  const alerts = { disk: { active: true, episodeNotified: false } };
  assert.equal(dueNotifications(alerts, ctx(STARTUP_GRACE_MS - 1)).reason, "grace");
  assert.equal(dueNotifications(alerts, ctx(DAY, { snoozeUntil: DAY + 1 })).reason, "snoozed");
  assert.equal(
    dueNotifications(alerts, ctx(DAY, { lastNotificationAt: DAY - MIN_GAP_MS + 1 })).reason,
    "gap",
  );
  assert.deepEqual(dueNotifications(alerts, ctx(DAY)).due, ["disk"]);
  assert.deepEqual(
    dueNotifications(alerts, ctx(DAY, { enabledTypes: ["temperature"] })).due,
    [],
    "tipo desligado nas Configurações",
  );
});

test("quando avisar: lembrete só depois de REMIND_MS; episódio novo respeita REARM_MS", () => {
  const t0 = DAY;
  const notified = { disk: { active: true, episodeNotified: true, lastNotifiedAt: t0 } };
  assert.deepEqual(dueNotifications(notified, ctx(t0 + REMIND_MS.disk - 1)).due, []);
  assert.deepEqual(dueNotifications(notified, ctx(t0 + REMIND_MS.disk)).due, ["disk"]);

  // Sumiu e voltou 1 hora depois: ainda não (REARM de 6 h para disco).
  const back = { disk: { active: true, episodeNotified: false, lastNotifiedAt: t0 } };
  assert.deepEqual(dueNotifications(back, ctx(t0 + HOUR)).due, []);
  assert.deepEqual(dueNotifications(back, ctx(t0 + REARM_MS.disk)).due, ["disk"]);
});

test("simulação: disco oscilando entre 8 e 13 GB por 3 dias avisa no máximo 1 vez por dia", () => {
  let state = {};
  let lastNotificationAt = 0;
  let count = 0;
  const start = DAY;
  for (let t = start; t < start + 3 * DAY; t += CHECK_EVERY_MS.disk) {
    const free = 8 + ((t / CHECK_EVERY_MS.disk) % 6); // 8…13 GB
    const prev = state.disk || {};
    state.disk = nextAlertState(prev, evaluateDisk(disk(free), !!prev.active), t);
    const { due } = dueNotifications(state, ctx(t, { lastNotificationAt }));
    if (due.length) {
      count += 1;
      lastNotificationAt = t;
      for (const type of due)
        state[type] = { ...state[type], lastNotifiedAt: t, episodeNotified: true };
    }
  }
  assert.ok(count >= 1 && count <= 3, `avisou ${count} vezes`);
});

test("simulação: jogo esquentando a GPU em picos de 1 leitura nunca avisa", () => {
  let state = {};
  let count = 0;
  for (let i = 0; i < 200; i++) {
    const t = DAY + i * CHECK_EVERY_MS.temperature;
    const gpu = i % 2 === 0 ? 93 : 70; // alterna: nunca duas quentes seguidas
    state.temperature = nextAlertState(
      state.temperature,
      evaluateTemperature({ cpu: 50, gpu }, state.temperature || {}),
      t,
    );
    if (dueNotifications(state, ctx(t)).due.length) count += 1;
  }
  assert.equal(count, 0);
});

test("notificação: um problema ou vários numa só", () => {
  const one = composeNotification(["disk"], {
    disk: { drive: "C:", freeBytes: 6.2 * GB, usedPct: 98.7 },
  });
  assert.equal(one.title, "Disco C: quase cheio");
  assert.match(one.body, /6,2 GB livres \(99% usado\)/);
  assert.equal(one.route, "/limpeza");

  const many = composeNotification(["disk", "windowsUpdate"], {
    disk: { drive: "C:", freeBytes: 6 * GB, usedPct: 99 },
    windowsUpdate: { days: 62 },
  });
  assert.equal(many.title, "2 problemas precisam de atenção");
  assert.match(
    many.body,
    /• Disco C: quase cheio \(6 GB livres\)\n• Windows sem atualizar há 62 dias/,
  );
  assert.equal(many.route, "/");
});

test("bandeja: atalhos, alertas ativos, silenciar e sair", () => {
  const now = Date.parse("2026-11-18T12:00:00");
  const model = trayMenuModel({
    active: [{ type: "disk", short: "Disco C: quase cheio (6 GB livres)" }],
    monitorEnabled: true,
    now,
    lastCheckAt: now,
  });
  const labels = model.filter((i) => i.label).map((i) => i.label);
  assert.equal(labels[0], "Abrir o WinCare");
  assert.ok(labels.includes("⚠ Disco C: quase cheio (6 GB livres)"));
  assert.deepEqual(model.find((i) => i.label?.startsWith("⚠")).command, {
    type: "open",
    to: "/limpeza",
  });
  for (const label of [
    "Checkup rápido",
    "Liberar espaço",
    "Histórico",
    "Configurações",
    "Silenciar por 24 horas",
  ]) {
    assert.ok(labels.includes(label), label);
  }
  assert.equal(model.at(-1).command.type, "quit");

  const snoozed = trayMenuModel({
    active: [],
    monitorEnabled: true,
    now,
    snoozeUntil: now + HOUR,
    lastCheckAt: now,
  });
  assert.ok(snoozed.some((i) => /^Silenciado até .* — reativar$/.test(i.label || "")));
  assert.ok(snoozed.some((i) => i.label === "Nenhum problema encontrado"));

  const off = trayMenuModel({ active: [], monitorEnabled: false, now });
  assert.ok(off.some((i) => i.label === "Alertas desligados" && i.enabled === false));
  assert.equal(off.find((i) => i.type === "checkbox").checked, false);
  assert.ok(!off.some((i) => /Silenciar/.test(i.label || "")));
});

test("bandeja: dica do ícone resume os alertas", () => {
  assert.equal(trayTooltip([]), "WinCare");
  assert.equal(trayTooltip([{ short: "CPU a 93 °C" }]), "WinCare — CPU a 93 °C");
  assert.equal(trayTooltip([{ short: "a" }, { short: "b" }]), "WinCare — 2 alertas");
});

test("ícone com alerta: ponto âmbar no canto, resto intacto", () => {
  const size = 32;
  const base = Buffer.alloc(size * size * 4, 0x40);
  const out = paintAlertDot(base, size, { r: 245, g: 158, b: 11 }, "rgba");
  assert.equal(out.length, base.length);
  const px = (x, y) => [...out.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];
  const c = Math.round(size - size * 0.23 - size * 0.06);
  assert.deepEqual(px(c, c), [245, 158, 11, 255]);
  assert.deepEqual(px(2, 2), [0x40, 0x40, 0x40, 0x40], "canto oposto não muda");
  assert.equal(base[0], 0x40, "não altera o bitmap original");
  const bgra = paintAlertDot(base, size, { r: 245, g: 158, b: 11 });
  assert.deepEqual([...bgra.subarray((c * size + c) * 4, (c * size + c) * 4 + 3)], [11, 158, 245]);
});
