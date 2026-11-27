/**
 * Teste de atualização de verdade (npm run test:update), com o app empacotado:
 *
 *   1) "versão nova abre": o app instalado chama o mesmo código do botão
 *      Atualizar (updater.launchApply); o aplicador troca os arquivos e a
 *      versão nova confirma que abriu.
 *   2) "versão nova quebrada": o app.asar da versão nova é corrompido; o
 *      aplicador precisa restaurar a anterior e reabri-la avisando.
 *   3) "atualização pequena": o app instalado confere o manifesto do pacote,
 *      descomprime o app.asar.gz e monta a versão nova com os próprios
 *      arquivos (electron/update-delta.cjs) — só o download fica de fora.
 *
 * A instalação fica na pasta do projeto e a versão nova em %TEMP%: no CI do
 * GitHub (D: × C:) e aqui (F: × C:) a cópia atravessa unidades, o caso que
 * já quebrou a atualização (fs.cpSync).
 *
 * Requer `npm run wincare:package` antes (usa electron-release/WinCare-win32-x64).
 */
const { _electron: electron } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PACKAGE = path.join(ROOT, "electron-release", "WinCare-win32-x64");
const WORK_INSTALL = path.join(ROOT, ".update-test");
const WORK_TEMP = path.join(os.tmpdir(), "wincare-update-test");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(message) {
  console.error(`FALHOU: ${message}`);
  process.exitCode = 1;
}

function copyDir(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
}

/** Fecha todo WinCare.exe que roda a partir de uma pasta (o teste reabre o app). */
function killFrom(dir) {
  const script = `Get-CimInstance Win32_Process -Filter "Name='WinCare.exe'" | Where-Object { $_.ExecutablePath -like '${dir.replace(/'/g, "''")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { stdio: "ignore" });
  } catch {
    /* nada aberto */
  }
}

async function waitForLog(file, pattern, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(file) && pattern.test(fs.readFileSync(file, "utf8"))) return true;
    await sleep(500);
  }
  return false;
}

async function scenario(name, { breakNewVersion = false, delta = false } = {}) {
  console.log(`\n== ${name}`);
  const install = path.join(WORK_INSTALL, name);
  const source = path.join(WORK_TEMP, name);
  copyDir(PACKAGE, install);
  if (delta) fs.rmSync(source, { recursive: true, force: true });
  else copyDir(PACKAGE, source);
  if (breakNewVersion) {
    // A versão nova roda (o aplicador é ela mesma), mas não abre a janela.
    fs.writeFileSync(path.join(source, "resources", "versao-quebrada-teste.txt"), "1");
  }
  const originalAsar = fs.statSync(path.join(install, "resources", "app.asar")).size;

  const app = await electron.launch({
    executablePath: path.join(install, "WinCare.exe"),
    args: [`--user-data-dir=${path.join(WORK_TEMP, `${name}-dados`)}`],
    env: {
      ...process.env,
      WINCARE_UPDATE_OK_WAIT_MS: "15000",
      WINCARE_TEST_BROKEN_MARKER: "versao-quebrada-teste.txt",
    },
  });
  await (await app.firstWindow()).waitForTimeout(3000);
  if (delta) {
    // Mesmo caminho do updater.tryDeltaUpdate, com os arquivos do pacote no lugar do download.
    const plan = await app.evaluate(
      async (_electron, { manifestFile, gzFile, sourceDir }) => {
        const nodePath = process.mainModule.require("path");
        const nodeFs = process.mainModule.require("fs");
        const delta = process.mainModule.require("./update-delta.cjs");
        const installDir = nodePath.dirname(process.execPath);
        const manifest = JSON.parse(nodeFs.readFileSync(manifestFile, "utf8"));
        const local = await delta.readLocalFiles(installDir, manifest);
        const result = delta.planDelta(manifest, local, process.versions.electron);
        if (!result.ok) return result;
        nodeFs.mkdirSync(sourceDir, { recursive: true });
        const newAsar = nodePath.join(nodePath.dirname(sourceDir), "app.asar.new");
        await delta.unpackAsar(gzFile, newAsar, result.asar.sha256);
        delta.buildStaging(installDir, sourceDir, newAsar, manifest);
        return { ok: true };
      },
      {
        manifestFile: path.join(ROOT, "electron-release", "WinCare-manifest.json"),
        gzFile: path.join(ROOT, "electron-release", "WinCare-app.asar.gz"),
        sourceDir: source,
      },
    );
    if (!plan.ok) {
      fail(`${name}: a atualização pequena foi recusada (${JSON.stringify(plan)}).`);
      await app.close().catch(() => {});
      return;
    }
    if (!fs.existsSync(path.join(source, "WinCare.exe"))) {
      fail(`${name}: a versão nova montada não tem WinCare.exe.`);
    }
  }
  fs.writeFileSync(path.join(source, "resources", "marcador-versao-nova.txt"), "nova");
  // O mesmo código do botão Atualizar (só sem o download do GitHub).
  const { logFile } = await app.evaluate((_electron, sourceDir) => {
    const updater = process.mainModule.require("./updater.cjs");
    return updater.launchApply(sourceDir);
  }, source);
  console.log(`log do aplicador: ${logFile}`);

  const expected = breakNewVersion
    ? /Versão anterior restaurada|Falha ao restaurar/
    : /Atualização concluída/;
  const finished = await waitForLog(logFile, expected, 120_000);
  await sleep(2000);
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "(sem log)";
  console.log(log.trim().replace(/^/gm, "  "));
  killFrom(install);

  const marker = fs.existsSync(path.join(install, "resources", "marcador-versao-nova.txt"));
  const asar = fs.statSync(path.join(install, "resources", "app.asar")).size;
  if (!finished) fail(`${name}: o aplicador não terminou em 2 min.`);
  if (breakNewVersion) {
    if (marker) fail(`${name}: arquivo da versão quebrada ficou na instalação.`);
    if (fs.existsSync(path.join(install, "resources", "versao-quebrada-teste.txt"))) {
      fail(`${name}: o marcador da versão quebrada ficou na instalação.`);
    }
    if (asar !== originalAsar) fail(`${name}: app.asar não voltou ao original.`);
    if (!/Versão anterior restaurada/.test(log))
      fail(`${name}: a versão anterior não foi restaurada.`);
  } else {
    if (!marker) fail(`${name}: os arquivos da versão nova não chegaram na instalação.`);
    if (!/Atualização concluída/.test(log)) fail(`${name}: a versão nova não confirmou que abriu.`);
  }
  if (!process.exitCode) console.log(`OK: ${name}`);
}

(async () => {
  if (process.platform !== "win32") {
    console.log("Teste de atualização só roda no Windows.");
    return;
  }
  if (!fs.existsSync(path.join(PACKAGE, "WinCare.exe"))) {
    console.error("Rode `npm run wincare:package` antes.");
    process.exit(1);
  }
  console.log(`instalação: ${WORK_INSTALL}  |  versão nova: ${WORK_TEMP}`);
  try {
    await scenario("versao-nova-abre", { breakNewVersion: false });
    await scenario("versao-nova-quebrada", { breakNewVersion: true });
    await scenario("atualizacao-pequena", { delta: true });
  } finally {
    killFrom(WORK_INSTALL);
    killFrom(WORK_TEMP);
    await sleep(1500);
    for (const dir of [WORK_INSTALL, WORK_TEMP]) {
      try {
        // Os apps reabertos pelo teste podem levar alguns segundos para soltar os arquivos.
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
      } catch (error) {
        console.warn(`Aviso: não foi possível apagar ${dir} (${error.code}).`);
      }
    }
  }
  if (process.exitCode) console.error("\nTeste de atualização FALHOU.");
  else console.log("\nTeste de atualização OK.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
