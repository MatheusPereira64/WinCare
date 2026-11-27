const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const Module = require("node:module");

/* Os módulos usam `electron` só em tempo de execução; aqui testamos a lógica pura. */
const originalLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === "electron") {
    return { app: {}, shell: {}, BrowserWindow: class {}, dialog: {}, ipcMain: {} };
  }
  return originalLoad.call(this, request, ...rest);
};

const {
  categoryOf,
  compareSnapshots,
  differenceHash,
  groupSimilar,
  hammingDistance,
  isUserDeletablePath,
  pickKeeper,
  shouldIndexFile,
} = require("../file-rules.cjs");
const { buildZip, crc32, normalizeTable, toCsv, toXlsx } = require("../exporter.cjs");
const { expandKnownFolder, lastUsedFor, rot13 } = require("../app-usage.cjs");
const {
  assessExtension,
  computeCpuPct,
  endProcess,
  isProtectedProcess,
  parseNetstatBytes,
} = require("../system-tools.cjs");
const {
  describeAlert,
  evaluateDiskGrowth,
  evaluateNewProgram,
  nextAlertState,
} = require("../alerts.cjs");

const env = {
  SystemDrive: "C:",
  WINDIR: "C:\\Windows",
  ProgramFiles: "C:\\Program Files",
  "ProgramFiles(x86)": "C:\\Program Files (x86)",
  ProgramData: "C:\\ProgramData",
  USERPROFILE: "C:\\Users\\Ana",
  APPDATA: "C:\\Users\\Ana\\AppData\\Roaming",
  LOCALAPPDATA: "C:\\Users\\Ana\\AppData\\Local",
};

test("Lixeira: só arquivos do usuário, nunca do Windows ou de programas", () => {
  for (const ok of [
    "C:\\Users\\Ana\\Downloads\\video.mp4",
    "C:\\Users\\Ana\\Pictures\\foto.jpg",
    "D:\\Backup\\copia.zip",
  ]) {
    assert.equal(isUserDeletablePath(ok, env), true, ok);
  }
  for (const blocked of [
    "C:\\Windows\\System32\\kernel32.dll",
    "C:\\Program Files\\Steam\\steam.exe",
    "C:\\Program Files (x86)\\App\\a.dll",
    "C:\\ProgramData\\x.dat",
    "C:\\Users\\Ana\\AppData\\Local\\Temp\\a.tmp",
    "C:\\pagefile.sys",
    "C:\\$Recycle.Bin\\S-1\\a",
    "C:\\Program Files\\WindowsApps\\a",
    "C:\\",
    "relativo\\a.txt",
  ]) {
    assert.equal(isUserDeletablePath(blocked, env), false, blocked);
  }
});

test("categorias por extensão e índice da busca", () => {
  assert.equal(categoryOf("Filme.MKV"), "video");
  assert.equal(categoryOf("setup.msi"), "installer");
  assert.equal(categoryOf("ubuntu.iso"), "diskImage");
  assert.equal(categoryOf("sem-extensao"), "other");
  assert.equal(shouldIndexFile("a.txt", 500 * 1024), false);
  assert.equal(shouldIndexFile("a.jpg", 500 * 1024), true);
  assert.equal(shouldIndexFile("a.bin", 2 * 1024 * 1024), true);
});

test("dHash: fotos parecidas ficam juntas, imagens lisas ficam de fora", () => {
  const bitmap = (fn) => {
    const out = Buffer.alloc(9 * 8 * 4);
    for (let i = 0; i < 72; i++) {
      const v = fn(i % 9, Math.floor(i / 9));
      out[i * 4] = v;
      out[i * 4 + 1] = v;
      out[i * 4 + 2] = v;
      out[i * 4 + 3] = 255;
    }
    return out;
  };
  const a = differenceHash(bitmap((x, y) => (x * 29 + y * 7) % 256));
  const b = differenceHash(
    bitmap((x, y) => (((x * 29 + y * 7) % 256) + 2 > 255 ? 255 : ((x * 29 + y * 7) % 256) + 2)),
  );
  const flat = differenceHash(bitmap(() => 120));
  assert.equal(a.length, 16);
  assert.ok(hammingDistance(a, b) <= 6);
  const groups = groupSimilar([
    { id: "1", hash: a },
    { id: "2", hash: b },
    { id: "3", hash: flat },
    { id: "4", hash: "f0f0f0f0f0f0f0f0" },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((g) => g.id).sort(), ["1", "2"]);
});

test("duplicados: mantém a cópia mais nova ou a mais antiga", () => {
  const files = [
    { id: "a", modifiedAt: 100 },
    { id: "b", modifiedAt: 300 },
    { id: "c", modifiedAt: 200 },
  ];
  assert.equal(pickKeeper(files, "newest"), "b");
  assert.equal(pickKeeper(files, "oldest"), "a");
});

test("comparar análises: mostra a pasta mais funda que cresceu", () => {
  const GB = 1024 ** 3;
  const before = { "C:\\": 100 * GB, "C:\\Users": 40 * GB, "C:\\Users\\Ana\\Videos": 10 * GB };
  const after = { "C:\\": 130 * GB, "C:\\Users": 70 * GB, "C:\\Users\\Ana\\Videos": 40 * GB };
  const diff = compareSnapshots(before, after);
  assert.equal(diff.grew[0].path, "C:\\Users\\Ana\\Videos");
  assert.equal(diff.grew[0].delta, 30 * GB);
  assert.equal(diff.shrank.length, 0);
});

test("exportar: CSV com ponto e vírgula e XLSX válido", () => {
  const table = normalizeTable({
    title: "Teste",
    columns: [
      { key: "name", label: "Nome" },
      { key: "size", label: "Tamanho", type: "bytes" },
    ],
    rows: [{ name: 'a;"b"', size: 1024 ** 3 }],
  });
  const csv = toCsv(table);
  assert.ok(csv.startsWith("\uFEFFNome;Tamanho"));
  assert.ok(csv.includes('"a;""b"""'));

  const xlsx = toXlsx(table);
  assert.equal(xlsx.readUInt32LE(0), 0x04034b50);
  assert.equal(xlsx.readUInt32LE(xlsx.length - 22), 0x06054b50);
  assert.equal(xlsx.readUInt16LE(xlsx.length - 12), 6);
  // Primeira entrada descomprime para o XML de tipos.
  const nameLen = xlsx.readUInt16LE(26);
  const size = xlsx.readUInt32LE(18);
  const data = zlib.inflateRawSync(xlsx.subarray(30 + nameLen, 30 + nameLen + size)).toString();
  assert.ok(data.includes("spreadsheetml"));
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  assert.ok(buildZip([{ name: "a.txt", content: "oi" }]).length > 22);
});

test("último uso: ROT13, pasta conhecida e associação ao programa", () => {
  assert.equal(rot13("Uryyb"), "Hello");
  assert.equal(
    expandKnownFolder("{6D809377-6AF0-444B-8957-A3773F02200E}\\GIMP\\gimp.exe", env),
    "c:\\program files\\gimp\\gimp.exe",
  );
  const entries = [
    { path: "c:\\program files\\gimp\\gimp.exe", lastRun: 1000 },
    { path: "c:\\users\\ana\\start menu\\programs\\obs studio.lnk", lastRun: 2000 },
  ];
  assert.equal(
    lastUsedFor({ name: "GIMP 2.10", installLocation: "C:\\Program Files\\GIMP\\" }, entries),
    1000,
  );
  assert.equal(lastUsedFor({ name: "OBS Studio", installLocation: "" }, entries), 2000);
  assert.equal(lastUsedFor({ name: "Outro", installLocation: "D:\\X" }, entries), null);
});

test("processos: % de CPU entre leituras e processos do Windows protegidos", () => {
  const prev = new Map([[10, { cpuSeconds: 5, at: 0 }]]);
  const { list } = computeCpuPct([{ n: "app", p: 10, c: 7, m: 1048576 }], prev, 2000, 4);
  // 2 s de CPU em 2 s com 4 núcleos = 25%.
  assert.equal(list[0].cpuPct, 25);
  assert.equal(list[0].memMb, 1);
  assert.equal(isProtectedProcess("csrss"), true);
  assert.equal(isProtectedProcess("chrome"), false);
  assert.equal(endProcess({ pid: 999999 }).ok, false);
});

test("extensões: acesso amplo + dados pessoais é nível alto", () => {
  assert.equal(
    assessExtension({ permissions: ["cookies", "tabs"], hosts: ["<all_urls>"] }).level,
    "high",
  );
  assert.equal(assessExtension({ permissions: [], hosts: ["https://*/*"] }).level, "medium");
  assert.equal(assessExtension({ permissions: ["storage"], hosts: [] }).level, "low");
});

test("netstat -e: lê bytes recebidos e enviados", () => {
  const text =
    "Estatísticas de interface\r\n\r\n                Recebidos     Enviados\r\nBytes          1234567890    987654321\r\n";
  assert.deepEqual(parseNetstatBytes(text), { received: 1234567890, sent: 987654321 });
});

test("alerta: disco cresceu 1 GB em pouco tempo", () => {
  const GB = 1024 ** 3;
  const t0 = 1_000_000;
  const first = evaluateDiskGrowth({ drives: [{ drive: "C:", usedBytes: 100 * GB }] }, {}, t0);
  assert.equal(first.active, false);
  const prev = nextAlertState({}, first, t0);
  const jump = evaluateDiskGrowth(
    { drives: [{ drive: "C:", usedBytes: 101.5 * GB }] },
    prev,
    t0 + 5 * 60_000,
  );
  assert.equal(jump.active, true);
  assert.equal(jump.fresh, true);
  assert.ok(describeAlert("diskGrowth", jump.detail).title.includes("C:"));
});

test("alerta: programa novo só depois da primeira leitura", () => {
  const base = evaluateNewProgram({ programs: [{ key: "A", name: "App A" }] }, {}, 1);
  assert.equal(base.active, false);
  const prev = nextAlertState({}, base, 1);
  const next = evaluateNewProgram(
    {
      programs: [
        { key: "A", name: "App A" },
        { key: "B", name: "App B" },
      ],
    },
    prev,
    2,
  );
  assert.equal(next.active, true);
  assert.deepEqual(next.detail.names, ["App B"]);
  const state = nextAlertState(prev, next, 2);
  assert.equal(state.episodeNotified, false);
});

test("alerta: Windows Update pesando só depois de ~20 min e desliga abaixo de 5%", () => {
  const { evaluateWindowsUpdateBusy, describeAlert: describe } = require("../alerts.cjs");
  let prev = {};
  // 5 leituras altas (15 min): ainda não avisa.
  for (let i = 0; i < 5; i++) {
    prev = { ...prev, ...evaluateWindowsUpdateBusy({ cpuPct: 30, name: "TiWorker" }, prev) };
    assert.equal(prev.active, false);
  }
  prev = { ...prev, ...evaluateWindowsUpdateBusy({ cpuPct: 30, name: "TiWorker" }, prev) };
  assert.equal(prev.active, true);
  assert.match(describe("windowsUpdateBusy", prev.detail).body, /TiWorker usa 30%/);
  // Oscilar a 10% não desliga; abaixo de 5% desliga.
  prev = { ...prev, ...evaluateWindowsUpdateBusy({ cpuPct: 10, name: "TiWorker" }, prev) };
  assert.equal(prev.active, true);
  prev = { ...prev, ...evaluateWindowsUpdateBusy({ cpuPct: 2, name: "TiWorker" }, prev) };
  assert.equal(prev.active, false);
  // Leitura que falhou não muda nada.
  assert.equal(evaluateWindowsUpdateBusy(null, prev), null);
});

test("limpeza agendada: instaladores esquecidos só quando o usuário liga", () => {
  const { normalizeConfig } = require("../scheduler.cjs");
  assert.equal(normalizeConfig({}).includeInstallers, false);
  assert.equal(normalizeConfig({ includeInstallers: "sim" }).includeInstallers, false);
  assert.equal(normalizeConfig({ includeInstallers: true }).includeInstallers, true);
});

test("resumo semanal compara esta semana com a anterior", () => {
  const { describeDigest, isDigestDue, weeklyDigest } = require("../weekly-report.cjs");
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date(2026, 10, 23, 10, 0, 0).getTime(); // segunda, 10 h
  const day = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const data = {
    events: [
      { ts: now - 1 * DAY, ok: true, kind: "clean", freedBytes: 2 * 1024 ** 3 },
      { ts: now - 2 * DAY, ok: true, kind: "uninstall", freedBytes: 0 },
      { ts: now - 3 * DAY, ok: false, kind: "clean", freedBytes: 9 * 1024 ** 3 },
      { ts: now - 3 * DAY, ok: true, kind: "safety" },
      { ts: now - 10 * DAY, ok: true, kind: "clean", freedBytes: 1024 ** 3 },
    ],
    health: [
      { day: day(now - DAY), avg: 90 },
      { day: day(now - 2 * DAY), avg: 80 },
      { day: day(now - 9 * DAY), avg: 70 },
    ],
  };
  const digest = weeklyDigest(data, now);
  assert.deepEqual(digest.week, {
    freedBytes: 2 * 1024 ** 3,
    maintenance: 2,
    programsRemoved: 1,
    healthAvg: 85,
  });
  assert.deepEqual(digest.previous, {
    freedBytes: 1024 ** 3,
    maintenance: 1,
    programsRemoved: 0,
    healthAvg: 70,
  });
  assert.equal(digest.hasData, true);
  const text = describeDigest(digest);
  assert.match(text.body, /2 GB liberados/);
  assert.match(text.body, /2 manutenções/);
  assert.match(text.body, /1 programa removido/);
  assert.match(text.body, /saúde média 85% \(\+15 vs\. semana passada\)/);
  assert.match(
    describeDigest(weeklyDigest({ events: [], health: [] }, now)).body,
    /Semana tranquila/,
  );

  assert.deepEqual(isDigestDue(0, now), { due: false, mark: true });
  assert.equal(isDigestDue(now - 7 * DAY, now).due, true); // segunda às 10 h
  assert.equal(isDigestDue(now - 3 * DAY, now).due, false);
  assert.equal(isDigestDue(now - 7 * DAY, now - 2 * 60 * 60 * 1000).due, false); // 8 h, cedo
  assert.equal(isDigestDue(now - 9 * DAY, now + DAY).due, true); // 8+ dias, qualquer dia
});

test("tempo de boot junta início, login e programas de inicialização", () => {
  const { compareBoots, lastStartupChange, pairBoots } = require("../boot-times.cjs");
  const S = 1000;
  const M = 60 * S;
  const D = 24 * 60 * M;
  const raw = {
    boots: [3 * D, 1 * D, 2 * D],
    logons: [1 * D + 12 * S, 2 * D + 30 * M, 3 * D + 10 * S],
    ready: [1 * D + 60 * S, 1 * D + 90 * S, 3 * D + 40 * S, 3 * D + 20 * M],
  };
  const boots = pairBoots(raw);
  // O boot do dia 2 ficou 30 min na tela de bloqueio: fora da conta.
  assert.deepEqual(boots, [
    { ts: 3 * D, logonMs: 10 * S, readyMs: 30 * S },
    { ts: 1 * D, logonMs: 12 * S, readyMs: 78 * S },
  ]);
  assert.deepEqual(pairBoots(null), []);

  const change = lastStartupChange([
    { ts: 5, action: "startup-disable", subject: "Velho" },
    { ts: 2 * D, action: "startup-disable", subject: "Steam" },
    { ts: 4 * D, action: "startup-enable", ok: false },
    { ts: 4 * D, action: "clean" },
  ]);
  assert.deepEqual(change, { ts: 2 * D, action: "startup-disable", subject: "Steam" });
  assert.deepEqual(compareBoots(boots, change.ts), {
    beforeMs: 78 * S,
    afterMs: 30 * S,
    beforeCount: 1,
    afterCount: 1,
  });
  assert.equal(compareBoots(boots, null), null);
});

test("tabela do winget upgrade vira lista (cabeçalho traduzido, spinner e rodapé)", () => {
  const { parseWingetUpgrade } = require("../program-updates.cjs");
  const pad = (text, n) => text.padEnd(n);
  const row = (name, id, version, available, source) =>
    `${pad(name, 30)}${pad(id, 28)}${pad(version, 16)}${pad(available, 16)}${source}`;
  const text = [
    "   - \r   \\ \r",
    `\r${row("Nome", "ID", "Versão", "Disponível", "Origem")}`,
    "-".repeat(96),
    row("Git", "Git.Git", "2.56.0.4", "2.56.1", "winget"),
    row("7-Zip 23.01 (x64)", "7zip.7zip", "23.01", "24.09", "winget"),
    row("Ubisoft Connect", "Ubisoft.Connect", "< 175.2.0", "175.2.0.13423", "winget"),
    row("Nome muito compri…", "Fabricante.ProgramaCom…", "1.0", "2.0", "winget"),
    row("CrystalDiskInfo 9.7.2", "XP8K4RGX25G3GM", "9.7.2", "9.9.5", "msstore"),
    "42 atualizações disponíveis.",
    "",
    "Os pacotes a seguir têm uma atualização, mas exigem destino explícito:",
    row("Nome", "ID", "Versão", "Disponível", "Origem"),
    "-".repeat(96),
    row("Fixado", "Fixado.App", "1.0", "2.0", "winget"),
  ].join("\r\n");
  const items = parseWingetUpgrade(text);
  assert.deepEqual(
    items.map((i) => i.id),
    ["Git.Git", "7zip.7zip", "Ubisoft.Connect", "XP8K4RGX25G3GM"],
  );
  assert.deepEqual(items[0], {
    id: "Git.Git",
    name: "Git",
    version: "2.56.0.4",
    available: "2.56.1",
    source: "winget",
  });
  assert.equal(items[2].version, "< 175.2.0");
  assert.equal(items[3].source, "msstore");
  assert.deepEqual(parseWingetUpgrade("Nenhuma atualização disponível."), []);
  assert.deepEqual(parseWingetUpgrade(""), []);
});

test("saúde do disco: status do Windows, desgaste, temperatura e erros", () => {
  const { assessDisk, mergeDetail, normalizeBasic } = require("../disk-health.cjs");
  const [ssd, hdd] = normalizeBasic([
    {
      id: 0,
      model: " Samsung SSD ",
      media: "SSD",
      bus: "NVMe",
      health: "Healthy",
      sizeBytes: 1e12,
      letters: ["C:", "lixo"],
    },
    { id: "1", model: "WDC", media: "HDD", bus: "SATA", health: "Healthy", letters: "D:" },
  ]);
  assert.equal(ssd.model, "Samsung SSD");
  assert.deepEqual(ssd.letters, ["C:"]);
  assert.deepEqual(hdd.letters, ["D:"]);
  assert.equal(assessDisk(ssd).level, "good");
  assert.equal(assessDisk({ ...ssd, health: "Warning" }).level, "warn");
  assert.equal(assessDisk({ ...ssd, health: "Unhealthy" }).level, "bad");
  assert.equal(assessDisk({ ...ssd, health: "Unknown" }).level, "unknown");
  assert.equal(assessDisk(ssd, { predictFailure: true }).level, "bad");

  const [withSmart, hddSmart] = mergeDetail([ssd, hdd], {
    ok: true,
    counters: [
      { id: "0", temperature: 74, wear: 75, powerOnHours: 9000, readErrors: 0, writeErrors: 0 },
      { id: "1", temperature: 0, powerOnHours: 41000, readErrors: 12, writeErrors: 0 },
    ],
  });
  const ssdResult = assessDisk(withSmart);
  assert.equal(ssdResult.level, "warn");
  assert.equal(ssdResult.notes.length, 2); // 75% de desgaste + 74 °C
  assert.equal(hddSmart.smart.temperature, null); // 0 = sem sensor
  const hddResult = assessDisk(hddSmart);
  assert.equal(hddResult.level, "bad"); // 12 erros não corrigidos
  assert.ok(hddResult.notes.some((n) => /40 mil horas/.test(n.text)));
  assert.equal(assessDisk({ ...withSmart, smart: { ...withSmart.smart, wear: 95 } }).level, "bad");
});
