/*
 * Aplica uma atualização baixada, rodando como o WinCare.exe NOVO (extraído na
 * pasta temporária) com --apply-update. É um processo de janela, sem console:
 * nada de .cmd, tasklist ou janelas pretas.
 *
 *   1) espera o WinCare antigo fechar (e força, se passar do limite);
 *   2) guarda uma cópia de segurança da versão atual;
 *   3) copia os arquivos novos para a pasta do app, com novas tentativas
 *      enquanto algum arquivo ainda estiver em uso;
 *   4) abre a versão nova e espera ela avisar que abriu (arquivo de sinal
 *      escrito quando a janela termina de carregar);
 *   5) sem o sinal em 60 s, ou se a cópia falhar no meio: restaura a cópia de
 *      segurança e reabre a versão anterior avisando que a atualização voltou.
 *
 * Funções puras exportadas para teste (electron/tests/update-apply.test.cjs).
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ARG = "--apply-update";
const WAIT_EXIT_MS = 30_000;
const COPY_ATTEMPTS = 20;
const COPY_RETRY_MS = 750;
/** Quanto a versão nova tem para abrir antes de voltarmos para a anterior. */
const STARTUP_OK_MS = 60_000;
const OK_ARG = "--update-ok-file";
const ROLLED_BACK_ARG = "--update-rolled-back";

/** Arquivo de sinal que a versão nova escreve quando abriu (null se não pedido). */
function parseOkFile(argv) {
  const hit = argv.find((a) => a.startsWith(`${OK_ARG}=`));
  const file = hit ? hit.slice(OK_ARG.length + 1) : "";
  return file && path.win32.isAbsolute(file) ? file : null;
}

/** Versão para a qual a atualização falhou (o app mostra um aviso). */
function parseRolledBack(argv) {
  const hit = argv.find((a) => a.startsWith(`${ROLLED_BACK_ARG}=`));
  return hit ? hit.slice(ROLLED_BACK_ARG.length + 1).slice(0, 40) : null;
}

/** Argumentos que o app antigo passa ao novo. */
function buildApplyArgs({ installDir, pid, logFile }) {
  return [ARG, `--install-dir=${installDir}`, `--old-pid=${pid}`, `--log-file=${logFile}`];
}

/** Lê os argumentos (ou null se não for uma aplicação de atualização). */
function parseApplyArgs(argv) {
  if (!argv.includes(ARG)) return null;
  const value = (name) => {
    const prefix = `--${name}=`;
    const hit = argv.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : "";
  };
  const installDir = value("install-dir");
  const pid = Number(value("old-pid"));
  if (!installDir || !path.win32.isAbsolute(installDir)) return null;
  return {
    installDir,
    pid: Number.isInteger(pid) && pid > 0 ? pid : 0,
    logFile: value("log-file") || path.join(os.tmpdir(), `wincare-apply-update-${Date.now()}.log`),
  };
}

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: existe, mas é de outro usuário/elevado — continua rodando.
    return error && error.code === "EPERM";
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForExit(pid, timeoutMs, log) {
  const started = Date.now();
  while (isRunning(pid)) {
    if (Date.now() - started > timeoutMs) {
      log(`O WinCare antigo (PID ${pid}) não fechou em ${timeoutMs / 1000} s: encerrando à força.`);
      try {
        process.kill(pid);
      } catch {
        /* já fechou ou sem permissão */
      }
      await sleep(1500);
      return !isRunning(pid);
    }
    await sleep(250);
  }
  return true;
}

/** Todos os arquivos da pasta (caminhos relativos), sem seguir links. */
function listFiles(root) {
  const out = [];
  const walk = (rel) => {
    for (const ent of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const child = path.join(rel, ent.name);
      if (ent.isDirectory()) walk(child);
      else if (ent.isFile()) out.push(child);
    }
  };
  walk("");
  return out;
}

/**
 * Copia arquivo por arquivo (copyFileSync). NÃO usa fs.cpSync: no runtime do
 * Electron ele derruba o processo ao copiar de uma unidade para outra
 * (ex.: %TEMP% no C: → app em F:), e a atualização nunca terminava.
 * Arquivo em uso (antivírus, processo do app antigo saindo) tenta de novo.
 */
async function copyWithRetry(sourceDir, installDir, log, attempts = COPY_ATTEMPTS) {
  let files;
  try {
    files = listFiles(sourceDir);
  } catch (error) {
    log(`Não foi possível ler a versão nova: ${error && error.message}`);
    return false;
  }
  let pending = files;
  for (let i = 1; i <= attempts && pending.length; i++) {
    const failed = [];
    let lastError = null;
    for (const rel of pending) {
      const target = path.join(installDir, rel);
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(sourceDir, rel), target);
      } catch (error) {
        failed.push(rel);
        lastError = error;
      }
    }
    if (failed.length) {
      log(
        `Tentativa ${i}/${attempts}: ${failed.length} de ${files.length} arquivos em uso (${failed[0]}: ${lastError && lastError.code})`,
      );
      await sleep(COPY_RETRY_MS);
    }
    pending = failed;
  }
  if (pending.length) {
    log(
      `Cópia desistiu: ${pending.length} arquivos não foram substituídos (${pending.slice(0, 3).join(", ")})`,
    );
    return false;
  }
  log(`${files.length} arquivos copiados.`);
  return true;
}

function launchDetached(exePath, cwd, args = []) {
  const child = spawn(exePath, args, { cwd, detached: true, stdio: "ignore" });
  // Sem isto, um exe ausente derrubaria o processo (evento "error" sem tratamento).
  child.on("error", () => {});
  child.unref();
  return child.pid || 0;
}

/** Cópia de segurança da pasta do app (para voltar se a versão nova falhar). */
async function backupInstall(installDir, backupDir, log) {
  fs.rmSync(backupDir, { recursive: true, force: true });
  const ok = await copyWithRetry(installDir, backupDir, () => {}, 3);
  log(ok ? `Cópia de segurança em ${backupDir}.` : "Não foi possível fazer a cópia de segurança.");
  return ok;
}

/** Volta a pasta do app exatamente como estava (remove o que a versão nova trouxe). */
async function restoreInstall(installDir, backupDir, log) {
  const keep = new Set(listFiles(backupDir).map((f) => f.toLowerCase()));
  for (const rel of listFiles(installDir)) {
    if (keep.has(rel.toLowerCase())) continue;
    try {
      fs.rmSync(path.join(installDir, rel), { force: true });
    } catch {
      /* arquivo extra que não sai não impede a versão antiga de abrir */
    }
  }
  const ok = await copyWithRetry(backupDir, installDir, log);
  log(ok ? "Versão anterior restaurada." : "Falha ao restaurar a versão anterior.");
  return ok;
}

async function waitForFile(file, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(file)) return true;
    await sleep(500);
  }
  return false;
}

function killTree(pid) {
  if (!pid) return;
  try {
    // taskkill /T fecha também os processos filhos (GPU, janelas) da versão que não abriu.
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } catch {
    /* já fechou */
  }
}

/**
 * Roda a aplicação. `sourceDir` é a pasta do próprio exe novo (process.execPath).
 * Devolve o código de saída do processo.
 */
async function runApply(options, sourceDir) {
  const lines = [];
  const log = (text) => {
    lines.push(`[${new Date().toISOString()}] ${text}`);
    try {
      fs.appendFileSync(options.logFile, `${lines[lines.length - 1]}\r\n`, "utf8");
    } catch {
      /* sem log não impede a atualização */
    }
  };
  const exePath = path.join(options.installDir, "WinCare.exe");
  // No Electron o fs trata .asar como pasta: sem isto a cópia "abriria" o app.asar.
  process.noAsar = true;
  log(`Atualizando ${options.installDir} a partir de ${sourceDir}`);
  if (path.resolve(sourceDir).toLowerCase() === path.resolve(options.installDir).toLowerCase()) {
    log("Origem e destino iguais: nada a fazer.");
    return 1;
  }
  const exited = await waitForExit(options.pid, WAIT_EXIT_MS, log);
  if (!exited) {
    log("O WinCare antigo continua aberto: atualização cancelada.");
    return 1;
  }
  const launch = options.launch || launchDetached;
  // WINCARE_UPDATE_OK_WAIT_MS: só para o teste de "versão nova que não abre" no CI.
  const envWait = Number(process.env.WINCARE_UPDATE_OK_WAIT_MS);
  const okWaitMs =
    options.okWaitMs ?? (envWait >= 5000 && envWait <= STARTUP_OK_MS ? envWait : STARTUP_OK_MS);
  const stamp = Date.now();
  const backupDir = options.backupDir || path.join(os.tmpdir(), `wincare-backup-${stamp}`);
  const okFile = path.join(os.tmpdir(), `wincare-update-ok-${stamp}.flag`);
  const newVersion = options.newVersion || "nova";

  const backedUp = await backupInstall(options.installDir, backupDir, log);
  const copied = await copyWithRetry(sourceDir, options.installDir, log);

  const rollBack = async (reason) => {
    log(`${reason} Voltando para a versão anterior.`);
    if (backedUp) await restoreInstall(options.installDir, backupDir, log);
    launch(exePath, options.installDir, [`${ROLLED_BACK_ARG}=${newVersion}`]);
    return 1;
  };

  if (!copied) return rollBack("A cópia não terminou.");

  log("Arquivos copiados. Abrindo a versão nova.");
  const pid = launch(exePath, options.installDir, [`${OK_ARG}=${okFile}`]);
  const started = await waitForFile(okFile, okWaitMs);
  if (!started) {
    killTree(pid);
    await sleep(2000);
    return rollBack(`A versão nova não abriu em ${Math.round(okWaitMs / 1000)} s.`);
  }
  log("A versão nova abriu. Atualização concluída.");
  try {
    fs.rmSync(okFile, { force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
  } catch {
    /* a cópia de segurança em %TEMP% sai na próxima limpeza */
  }
  return 0;
}

module.exports = {
  buildApplyArgs,
  parseApplyArgs,
  parseOkFile,
  parseRolledBack,
  runApply,
  waitForExit,
};
