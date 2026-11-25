const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildApplyArgs, parseApplyArgs, runApply, waitForExit } = require("../update-apply.cjs");

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

test("copia a versão nova por cima da antiga e registra no log", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "wincare-apply-test-"));
  const source = path.join(base, "novo");
  const install = path.join(base, "instalado");
  fs.mkdirSync(path.join(source, "resources"), { recursive: true });
  fs.mkdirSync(path.join(install, "resources"), { recursive: true });
  fs.writeFileSync(path.join(source, "resources", "versao.txt"), "1.2.1");
  fs.writeFileSync(path.join(install, "resources", "versao.txt"), "1.2.0");
  fs.writeFileSync(path.join(install, "config-local.txt"), "fica");
  const logFile = path.join(base, "log.txt");

  // pid 0 = processo antigo já fechado; o WinCare.exe de teste não existe (não abre nada).
  const code = await runApply({ installDir: install, pid: 0, logFile }, source);

  assert.equal(code, 0);
  assert.equal(fs.readFileSync(path.join(install, "resources", "versao.txt"), "utf8"), "1.2.1");
  assert.equal(fs.readFileSync(path.join(install, "config-local.txt"), "utf8"), "fica");
  assert.match(fs.readFileSync(logFile, "utf8"), /Arquivos copiados/);
  fs.rmSync(base, { recursive: true, force: true });
});
