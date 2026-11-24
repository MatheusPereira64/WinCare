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
