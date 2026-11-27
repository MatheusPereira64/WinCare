const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const { buildApplyArgs, parseApplyArgs, runApply, waitForExit } = require("../update-apply.cjs");
const {
  buildStaging,
  planDelta,
  readLocalFiles,
  sha256File,
  unpackAsar,
} = require("../update-delta.cjs");

const sha = (text) => require("node:crypto").createHash("sha256").update(text).digest("hex");

function deltaFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wincare-delta-"));
  const install = path.join(root, "instalado");
  fs.mkdirSync(path.join(install, "resources"), { recursive: true });
  fs.mkdirSync(path.join(install, "locales"), { recursive: true });
  fs.writeFileSync(path.join(install, "WinCare.exe"), "exe-antigo");
  fs.writeFileSync(path.join(install, "ffmpeg.dll"), "dll");
  fs.writeFileSync(path.join(install, "locales", "pt-BR.pak"), "pak");
  fs.writeFileSync(path.join(install, "resources", "app.asar"), "asar-antigo");
  fs.writeFileSync(path.join(install, "nao-e-do-app.txt"), "arquivo do usuário");
  const file = (p, text) => ({ path: p, size: Buffer.byteLength(text), sha256: sha(text) });
  const manifest = {
    version: "9.9.9",
    electron: "43.2.0",
    files: [
      file("WinCare.exe", "exe-novo"),
      file("ffmpeg.dll", "dll"),
      file("locales/pt-BR.pak", "pak"),
      file("resources/app.asar", "asar-novo"),
    ],
  };
  return { root, install, manifest };
}

test("atualização pequena: só serve com o mesmo Electron e os mesmos arquivos", async () => {
  const { root, install, manifest } = deltaFixture();
  try {
    const local = await readLocalFiles(install, manifest);
    // O exe e o app.asar ficam de fora da comparação.
    assert.deepEqual(Object.keys(local).sort(), ["ffmpeg.dll", "locales/pt-BR.pak"]);
    const plan = planDelta(manifest, local, "43.2.0");
    assert.equal(plan.ok, true);
    assert.equal(plan.asar.path, "resources/app.asar");

    assert.equal(planDelta(manifest, local, "44.0.0").reason, "electron-changed");
    assert.equal(planDelta(null, local, "43.2.0").reason, "no-manifest");
    const changed = { ...local, "ffmpeg.dll": { size: 3, sha256: sha("DLL") } };
    assert.deepEqual(planDelta(manifest, changed, "43.2.0"), {
      ok: false,
      reason: "different",
      path: "ffmpeg.dll",
    });
    const missing = { "ffmpeg.dll": local["ffmpeg.dll"] };
    assert.equal(planDelta(manifest, missing, "43.2.0").reason, "missing");
    const noAsar = { ...manifest, files: manifest.files.filter((f) => !f.path.endsWith(".asar")) };
    assert.equal(planDelta(noAsar, local, "43.2.0").reason, "no-asar");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("atualização pequena: confere o hash e monta só os arquivos do app", async () => {
  const { root, install, manifest } = deltaFixture();
  try {
    const gz = path.join(root, "app.asar.gz");
    fs.writeFileSync(gz, zlib.gzipSync(Buffer.from("asar-novo")));
    const newAsar = path.join(root, "app.asar.new");
    await assert.rejects(unpackAsar(gz, newAsar, sha("outra coisa")), /não confere/);
    await unpackAsar(gz, newAsar, sha("asar-novo"));
    assert.equal(await sha256File(newAsar), sha("asar-novo"));

    const staging = buildStaging(install, path.join(root, "nova"), newAsar, manifest);
    const read = (p) => fs.readFileSync(path.join(staging, p), "utf8");
    assert.equal(read("resources/app.asar"), "asar-novo");
    assert.equal(read("WinCare.exe"), "exe-antigo"); // o executável local é mantido
    assert.equal(read("locales/pt-BR.pak"), "pak");
    assert.equal(fs.existsSync(path.join(staging, "nao-e-do-app.txt")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("argumentos de --apply-update vão e voltam", () => {
  const installDir = "C:\\Users\\Ana\\WinCare";
  const logFile = "C:\\tmp\\log.txt";
  const args = buildApplyArgs({ installDir, pid: 4321, logFile });
  const parsed = parseApplyArgs(["WinCare.exe", ...args]);
  assert.equal(parsed.installDir, installDir);
  assert.equal(parsed.pid, 4321);
  assert.equal(parsed.logFile, logFile);
  assert.equal(parseApplyArgs(["WinCare.exe"]), null);
  // Pasta relativa não é aceita (nada de copiar para um lugar inesperado).
  assert.equal(parseApplyArgs(["x", "--apply-update", "--install-dir=WinCare"]), null);
});

test("espera o processo antigo fechar antes de seguir", async () => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 1500)"], { stdio: "ignore" });
  const started = Date.now();
  const exited = await waitForExit(child.pid, 10_000, () => {});
  assert.equal(exited, true);
  assert.ok(Date.now() - started >= 1000, "não deveria seguir antes de o processo fechar");
});

/** Instalação "antiga" (1.2.0) e versão "nova" (1.2.1) em pastas temporárias. */
function makeVersions() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "wincare-apply-test-"));
  const source = path.join(base, "novo");
  const install = path.join(base, "instalado");
  fs.mkdirSync(path.join(source, "resources"), { recursive: true });
  fs.mkdirSync(path.join(install, "resources"), { recursive: true });
  fs.writeFileSync(path.join(source, "resources", "versao.txt"), "1.2.1");
  fs.writeFileSync(path.join(source, "so-na-nova.txt"), "novo");
  fs.writeFileSync(path.join(install, "resources", "versao.txt"), "1.2.0");
  fs.writeFileSync(path.join(install, "config-local.txt"), "fica");
  return { base, source, install, logFile: path.join(base, "log.txt") };
}

const okArg = (args) => args.find((a) => a.startsWith("--update-ok-file="))?.split("=")[1];

test("copia a versão nova e conclui quando ela avisa que abriu", async () => {
  const v = makeVersions();
  const launched = [];
  // A "versão nova" confirma que abriu escrevendo o arquivo de sinal.
  const launch = (exe, cwd, args) => {
    launched.push(args);
    const ok = okArg(args);
    if (ok) setTimeout(() => fs.writeFileSync(ok, "1.2.1"), 200);
    return 0;
  };
  const code = await runApply(
    { installDir: v.install, pid: 0, logFile: v.logFile, launch, okWaitMs: 5000 },
    v.source,
  );
  assert.equal(code, 0);
  assert.equal(fs.readFileSync(path.join(v.install, "resources", "versao.txt"), "utf8"), "1.2.1");
  assert.equal(fs.readFileSync(path.join(v.install, "config-local.txt"), "utf8"), "fica");
  assert.equal(launched.length, 1);
  assert.match(fs.readFileSync(v.logFile, "utf8"), /Atualização concluída/);
  fs.rmSync(v.base, { recursive: true, force: true });
});

test("volta para a versão anterior se a nova não abrir", async () => {
  const v = makeVersions();
  const launched = [];
  const launch = (exe, cwd, args) => {
    launched.push(args);
    return 0; // nunca escreve o sinal: a versão nova "travou"
  };
  const code = await runApply(
    {
      installDir: v.install,
      pid: 0,
      logFile: v.logFile,
      launch,
      okWaitMs: 800,
      newVersion: "1.2.1",
    },
    v.source,
  );
  assert.equal(code, 1);
  assert.equal(fs.readFileSync(path.join(v.install, "resources", "versao.txt"), "utf8"), "1.2.0");
  assert.equal(fs.existsSync(path.join(v.install, "so-na-nova.txt")), false);
  assert.equal(fs.readFileSync(path.join(v.install, "config-local.txt"), "utf8"), "fica");
  // Reabre a anterior avisando qual versão falhou.
  assert.deepEqual(launched[1], ["--update-rolled-back=1.2.1"]);
  assert.match(fs.readFileSync(v.logFile, "utf8"), /Versão anterior restaurada/);
  fs.rmSync(v.base, { recursive: true, force: true });
});
