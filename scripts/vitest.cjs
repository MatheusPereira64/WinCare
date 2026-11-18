/**
 * Inicia o Vitest (npm run test:unit). Repassa os argumentos.
 *
 * No Windows, um terminal aberto em "f:\…" (letra do drive minúscula, comum
 * no VS Code) faz o Vitest carregar o próprio runner duas vezes e todo arquivo
 * falha com "failed to find the current suite". Aqui o processo recomeça com a
 * letra maiúscula; no Linux/macOS nada muda.
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const cwd = process.cwd().replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const cli = path.join(cwd, "node_modules", "vitest", "vitest.mjs");

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
