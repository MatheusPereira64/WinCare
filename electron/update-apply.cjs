/*
 * Aplica uma atualização baixada, rodando como o WinCare.exe NOVO (extraído na
 * pasta temporária) com --apply-update. É um processo de janela, sem console:
 * nada de .cmd, tasklist ou janelas pretas.
 *
 *   1) espera o WinCare antigo fechar (e força, se passar do limite);
 *   2) copia os arquivos novos para a pasta do app, com novas tentativas
 *      enquanto algum arquivo ainda estiver em uso;
 *   3) abre o WinCare.exe da pasta do app (já na versão nova).
 * Se a cópia falhar, reabre a versão antiga e deixa o motivo no log.
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

/** Copia a pasta toda; arquivo em uso faz tentar de novo (antivírus, processo filho saindo). */
async function copyWithRetry(sourceDir, installDir, log, attempts = COPY_ATTEMPTS) {
  let lastError = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      fs.cpSync(sourceDir, installDir, { recursive: true, force: true });
      return true;
    } catch (error) {
      lastError = error;
      log(`Tentativa ${i}/${attempts} falhou: ${error && error.message}`);
      await sleep(COPY_RETRY_MS);
    }
  }
  log(`Cópia desistiu: ${lastError && lastError.message}`);
  return false;
}

function launchDetached(exePath, cwd) {
  const child = spawn(exePath, [], { cwd, detached: true, stdio: "ignore" });
  // Sem isto, um exe ausente derrubaria o processo (evento "error" sem tratamento).
  child.on("error", () => {});
  child.unref();
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
  const copied = await copyWithRetry(sourceDir, options.installDir, log);
  log(copied ? "Arquivos copiados. Abrindo a versão nova." : "Reabrindo a versão anterior.");
  try {
    launchDetached(exePath, options.installDir);
  } catch (error) {
    log(`Não foi possível abrir o WinCare: ${error && error.message}`);
  }
  return copied ? 0 : 1;
}

module.exports = { buildApplyArgs, parseApplyArgs, runApply, waitForExit };
