/**
 * Gera as prévias do README em docs/screenshots (npm run wincare:screenshots).
 *
 * Carrega o build sem o preload: o app entra no modo demonstração, com dados
 * simulados, então nenhuma informação real deste computador aparece nas imagens.
 *
 * Opções (depois de `--` no npm):
 *   --responsivo        matriz 1024×640, 1366×768 e 1920×1080 das telas principais
 *                       e dos diálogos, em docs/screenshots/responsivo/
 *                       (npm run wincare:screenshots:responsivo)
 *   --viewport=LxA      tamanho da janela das prévias do README (padrão 1360x860)
 *   --only=a,b          só estas capturas (nome do arquivo sem .png)
 */
const { app, BrowserWindow, Menu, net, protocol } = require("electron");
const fs = require("fs");
const path = require("path");
const url = require("url");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const OUT_DIR = path.join(ROOT, "docs", "screenshots");
const RESPONSIVE_DIR = path.join(OUT_DIR, "responsivo");

const argValue = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const RESPONSIVE = process.argv.includes("--responsivo");
const ONLY = argValue("only")?.split(",").filter(Boolean) ?? null;

function parseViewport(value) {
  const m = /^(\d{3,4})x(\d{3,4})$/.exec(String(value || ""));
  if (!m) throw new Error(`Viewport inválido: ${value} (use LARGURAxALTURA, ex.: 1366x768)`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

const README_VIEWPORT = parseViewport(argValue("viewport") ?? "1360x860");
const RESPONSIVE_VIEWPORTS = ["1024x640", "1366x768", "1920x1080"].map(parseViewport);

/** Prévias do README. `state` sobrescreve o estado salvo (ex.: introdução ainda não vista). */
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
  { file: "historico", route: "/historico" },
  { file: "bandeja-alertas", route: "/configuracoes", script: "scrollToTraySettings()" },
  { file: "primeira-execucao", route: "/", state: { onboardingDone: false } },
  { file: "configuracoes", route: "/configuracoes" },
  { file: "dashboard-claro", route: "/", theme: "light" },
];

/** Matriz responsiva: telas principais e os diálogos (os botões não podem sumir em 1024×640). */
const RESPONSIVE_SHOTS = [
  { file: "dashboard", route: "/" },
  { file: "limpeza", route: "/limpeza" },
  { file: "programas", route: "/programas" },
  { file: "desinstalar-residuos", route: "/programas", script: "openUninstallWizard()" },
  { file: "reparo", route: "/reparo" },
  { file: "confirmacao-ponto-restauracao", route: "/reparo", script: "openRestorePointConfirm()" },
  { file: "sistema", route: "/sistema" },
  { file: "historico", route: "/historico" },
  { file: "configuracoes", route: "/configuracoes" },
  { file: "primeira-execucao", route: "/", state: { onboardingDone: false } },
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
  async function scrollToTraySettings() {
    const panel = await waitFor(() => document.querySelector("[data-wincare-background]"));
    panel.scrollIntoView({ block: "start" });
  }
`;

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

app.setPath("userData", path.join(app.getPath("temp"), "wincare-screenshots"));
app.disableHardwareAcceleration();

async function capture(win, shot, target) {
  await win.loadURL("app://wincare/index.html");
  await win.webContents.executeJavaScript(`
    localStorage.setItem("wincare-state", JSON.stringify(${JSON.stringify({
      theme: shot.theme ?? "dark",
      autoCheck: false,
      favorites: [],
      onboardingDone: true,
      ...shot.state,
    })}));
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
  fs.writeFileSync(target, image.toPNG());
  console.log(`OK ${path.relative(ROOT, target)}`);
}

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

  Menu.setApplicationMenu(null);

  /* Cada execução: lista de { viewport, shot, destino }. */
  const jobs = RESPONSIVE
    ? RESPONSIVE_VIEWPORTS.flatMap((viewport) =>
        RESPONSIVE_SHOTS.map((shot) => ({
          viewport,
          shot,
          target: path.join(
            RESPONSIVE_DIR,
            `${shot.file}-${viewport.width}x${viewport.height}.png`,
          ),
        })),
      )
    : SHOTS.map((shot) => ({
        viewport: README_VIEWPORT,
        shot,
        target: path.join(OUT_DIR, `${shot.file}.png`),
      }));
  const selected = ONLY ? jobs.filter((j) => ONLY.includes(j.shot.file)) : jobs;
  fs.mkdirSync(RESPONSIVE ? RESPONSIVE_DIR : OUT_DIR, { recursive: true });

  let failed = false;
  let win = null;
  let current = "";
  for (const job of selected) {
    const key = `${job.viewport.width}x${job.viewport.height}`;
    if (key !== current) {
      /* Cria a nova antes de fechar a anterior: sem janelas, o Electron encerra o app. */
      const previous = win;
      /* Renderização offscreen: uma janela oculta comum congela timers e a pintura da página. */
      win = new BrowserWindow({
        width: job.viewport.width,
        height: job.viewport.height,
        useContentSize: true,
        show: false,
        backgroundColor: "#0d1117",
        webPreferences: { offscreen: true, backgroundThrottling: false },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      previous?.destroy();
      current = key;
    }
    try {
      await capture(win, job.shot, job.target);
    } catch (error) {
      failed = true;
      console.error(
        `FALHOU ${path.basename(job.target)}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  app.exit(failed ? 1 : 0);
});
