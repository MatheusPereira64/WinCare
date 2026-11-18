/**
 * Servidor estático do build do renderer (dist/) para os testes E2E.
 *
 * Sem o preload do Electron o app entra no modo demonstração (dados
 * simulados), então nada deste computador aparece nos testes. Sem
 * dependências nativas de propósito: roda igual no Windows e no contêiner
 * Linux do Playwright (testes visuais). Uso: node scripts/serve-dist.cjs [porta]
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const DIST = path.resolve(__dirname, "..", "dist");
const PORT = Number(process.argv[2] || process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("dist/index.html não existe. Rode antes: npm run wincare:build");
  process.exit(1);
}

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url || "/", "http://localhost");
    let file = path.join(DIST, decodeURIComponent(pathname));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, "index.html");
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`WinCare (demonstração) em http://127.0.0.1:${PORT}`);
  });
