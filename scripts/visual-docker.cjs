/**
 * Roda os testes visuais no contêiner Linux oficial do Playwright — o mesmo
 * que o CI usa —, para que as capturas saiam idênticas em qualquer máquina.
 *
 *   npm run test:visual          compara com as referências
 *   npm run test:visual:update   regrava as referências (revise o diff antes do commit)
 *
 * Requer Docker em execução e `npm run wincare:build` antes (os scripts npm já fazem).
 * Os node_modules do projeto são usados como estão: o runner do Playwright é
 * JavaScript puro, e o servidor (scripts/serve-dist.cjs) não tem dependências.
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const { version } = require(path.join(ROOT, "node_modules", "@playwright", "test", "package.json"));
const IMAGE = `mcr.microsoft.com/playwright:v${version}-noble`;

const args = [
  "run",
  "--rm",
  "--ipc=host",
  "-e",
  "CI=1",
  "-v",
  `${ROOT}:/work`,
  "-w",
  "/work",
  IMAGE,
  "node",
  "node_modules/@playwright/test/cli.js",
  "test",
  "--project=visual",
  ...process.argv.slice(2),
];

console.log(`> docker ${args.join(" ")}`);
const result = spawnSync("docker", args, { stdio: "inherit" });
if (result.error) {
  console.error("Não foi possível iniciar o Docker:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
