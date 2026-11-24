/*
 * Painel da bandeja: janela pequena ao lado do relógio, aberta com um clique
 * no ícone do WinCare. Mostra saúde, disco, memória, energia, CPU, rede e
 * Bluetooth; um segundo cartão (à esquerda) abre o detalhe de cada item.
 *
 * É a mesma interface (rota #/painel) numa janela sem moldura e transparente;
 * os dados vêm das mesmas chamadas do app. Some ao perder o foco.
 */
const path = require("path");
const { BrowserWindow, ipcMain, screen } = require("electron");

const logger = require("./logger.cjs");

const CARD_WIDTH = 392;
const GAP = 14;
const MARGIN = 12;
const MAX_HEIGHT = 720;

let panel = null;
let expanded = false;
let anchor = null;
let hiddenAt = 0;
let deps = null;

function computeBounds() {
  const point = anchor ? { x: anchor.x, y: anchor.y } : screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(point);
  const width = expanded ? CARD_WIDTH * 2 + GAP : CARD_WIDTH;
  const height = Math.min(MAX_HEIGHT, workArea.height - MARGIN * 2);
  // Barra de tarefas embaixo/à direita (padrão): canto inferior direito da área útil.
  const x = Math.round(workArea.x + workArea.width - width - MARGIN);
  const y = Math.round(workArea.y + workArea.height - height - MARGIN);
  return { x, y, width, height };
}

function createPanel() {
  panel = new BrowserWindow({
    ...computeBounds(),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    title: "WinCare",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
    },
  });
  panel.setAlwaysOnTop(true, "pop-up-menu");
  panel.on("blur", () => {
    if (process.env.WINCARE_DEVTOOLS === "1") return;
    hidePanel();
  });
  panel.on("closed", () => {
    panel = null;
  });
  panel.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      if (expanded) setExpanded(false);
      else hidePanel();
    }
  });
  panel.loadURL("app://wincare/index.html#/painel");
}

function hidePanel() {
  if (!panel || panel.isDestroyed() || !panel.isVisible()) return;
  hiddenAt = Date.now();
  panel.hide();
  panel.webContents.send("wincare:panelVisibility", false);
}

function showPanel(trayBounds) {
  anchor = trayBounds && trayBounds.width ? trayBounds : null;
  if (!panel || panel.isDestroyed()) createPanel();
  expanded = false;
  panel.setBounds(computeBounds());
  panel.show();
  panel.focus();
  panel.webContents.send("wincare:panelVisibility", true);
}

/** Clique no ícone: abre ou fecha (o clique que tirou o foco já escondeu). */
function togglePanel(trayBounds) {
  if (panel && !panel.isDestroyed() && panel.isVisible()) {
    hidePanel();
    return;
  }
  // O próprio clique no ícone tira o foco do painel: não reabrir no mesmo clique.
  if (Date.now() - hiddenAt < 250) return;
  showPanel(trayBounds);
}

function setExpanded(value) {
  expanded = !!value;
  if (panel && !panel.isDestroyed()) panel.setBounds(computeBounds());
  return { ok: true, expanded };
}

function initTrayPanel(options) {
  deps = options;
  ipcMain.handle("wincare:panelExpand", (_e, payload) => setExpanded(payload?.expanded));
  ipcMain.handle("wincare:panelClose", () => {
    hidePanel();
    return { ok: true };
  });
  ipcMain.handle("wincare:panelOpenApp", (_e, payload) => {
    hidePanel();
    deps.openApp({ to: payload?.to });
    return { ok: true };
  });
  // Pré-carrega escondido: o primeiro clique abre na hora.
  setTimeout(() => {
    try {
      if (!panel) createPanel();
    } catch (error) {
      logger.warn("panel", "Pré-carregar painel", error instanceof Error ? error.message : error);
    }
  }, 4000);
}

function disposeTrayPanel() {
  if (panel && !panel.isDestroyed()) panel.destroy();
  panel = null;
}

module.exports = { disposeTrayPanel, hidePanel, initTrayPanel, togglePanel };
