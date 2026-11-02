/**
 * Gera as prévias do README em docs/screenshots (npm run wincare:screenshots).
 *
 * Carrega o build sem o preload: o app entra no modo demonstração, com dados
 * simulados, então nenhuma informação real deste computador aparece nas imagens.
 */
const { app, BrowserWindow, Menu, net, protocol } = require("electron");
const fs = require("fs");
const path = require("path");
const url = require("url");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const OUT_DIR = path.join(ROOT, "docs", "screenshots");
const WIDTH = 1360;
const HEIGHT = 860;

const SHOTS = [
  { file: "dashboard", route: "/" },
  { file: "limpeza", route: "/limpeza", script: "expandFirstCleanerApp()" },
  { file: "programas", route: "/programas" },
  { file: "desinstalar-residuos", route: "/programas", script: "openUninstallWizard()" },
  { file: "agendamento", route: "/agendamento" },
  { file: "reparo", route: "/reparo" },
  { file: "confirmacao-ponto-restauracao", route: "/reparo", script: "openRestorePointConfirm()" },
  { file: "monitoramento", route: "/monitoramento", delayMs: 7000 },
  { file: "disco", route: "/disco" },
  { file: "sistema", route: "/sistema" },
  { file: "configuracoes", route: "/configuracoes" },
  { file: "dashboard-claro", route: "/", theme: "light" },
];

const HELPERS = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const byText = (selector, text) =>
    [...document.querySelectorAll(selector)].find((el) => el.textContent.includes(text));
  async function waitFor(fn) {
    for (let i = 0; i < 60; i++) {
      const value = fn();
      if (value) return value;
      await wait(100);
    }
    throw new Error("Elemento não apareceu: " + fn);
  }
  async function expandFirstCleanerApp() {
    const header = await waitFor(() => byText("[data-wincare-cleaner] button[aria-expanded]", "Google Chrome"));
    header.click();
    const seeFiles = await waitFor(() => byText("[data-wincare-cleaner] button", "Ver arquivos"));
    seeFiles.click();
  }
  async function openUninstallWizard() {
    const row = await waitFor(() => byText("[data-wincare-programs] li", "OBS Studio"));
    row.querySelector("button").click();
    const start = await waitFor(() => byText("[role=dialog] button", "Abrir desinstalador"));
    const point = document.querySelector("[role=dialog] button[role=checkbox]");
    if (point) point.click();
    start.click();
    await waitFor(() => byText("[role=dialog] button", "Remover"));
  }
  async function openRestorePointConfirm() {
    const card = await waitFor(() =>
      [...document.querySelectorAll("h3")]
        .find((el) => el.textContent.includes("Restaurar imagem do Windows"))
        ?.closest("[class*=surface-panel]"),
    );
    [...card.querySelectorAll("button")].find((b) => b.textContent.includes("Executar")).click();
    await waitFor(() => document.querySelector("[role=dialog]"));
  }
`;

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

app.setPath("userData", path.join(app.getPath("temp"), "wincare-screenshots"));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url);
    let filePath = path.join(DIST, decodeURIComponent(pathname));
    if (
      !filePath.startsWith(DIST) ||
      !fs.existsSync(filePath) ||
      fs.statSync(filePath).isDirectory()
    ) {
      filePath = path.join(DIST, "index.html");
    }
    return net.fetch(url.pathToFileURL(filePath).toString());
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  Menu.setApplicationMenu(null);
  /* Renderização offscreen: uma janela oculta comum congela timers e a pintura da página. */
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    show: false,
    backgroundColor: "#0d1117",
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  let failed = false;
  for (const shot of SHOTS) {
    try {
      await win.loadURL("app://wincare/index.html");
      await win.webContents.executeJavaScript(`
        localStorage.setItem("wincare-state", JSON.stringify({
          theme: ${JSON.stringify(shot.theme ?? "dark")},
          autoCheck: false,
          favorites: [],
        }));
      `);
      await win.loadURL(`app://wincare/index.html#${shot.route}`);
      await win.webContents.executeJavaScript(`
        (async () => {
          ${HELPERS}
          await wait(1800);
          ${shot.script ? `await ${shot.script};` : ""}
          await wait(${shot.delayMs ?? 500});
        })()
      `);
      const image = await win.webContents.capturePage();
      const target = path.join(OUT_DIR, `${shot.file}.png`);
      fs.writeFileSync(target, image.toPNG());
      console.log(`OK ${path.relative(ROOT, target)}`);
    } catch (error) {
      failed = true;
      console.error(`FALHOU ${shot.file}: ${error instanceof Error ? error.message : error}`);
    }
  }
  app.exit(failed ? 1 : 0);
});
