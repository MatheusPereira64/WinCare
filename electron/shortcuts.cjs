/*
 * Atalhos do app portátil (ZIP): Menu Iniciar (criado na primeira vez que o
 * app abre) e Área de Trabalho (opcional, em Configurações).
 *
 * Cada atalho leva o AppUserModelID do WinCare — a barra de tarefas usa o
 * ícone dele — e é corrigido se a pasta do app mudar de lugar. Só no app
 * empacotado: em desenvolvimento o .exe é uma cópia do Electron.
 */
const fs = require("fs");
const path = require("path");
const { app, ipcMain, shell } = require("electron");

const logger = require("./logger.cjs");

const NAME = "WinCare.lnk";

let deps = null;

const startMenuPath = () =>
  path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", NAME);
const desktopPath = () => path.join(app.getPath("desktop"), NAME);

function shortcutOptions() {
  const exe = process.execPath;
  return {
    target: exe,
    cwd: path.dirname(exe),
    description: "WinCare — Central de manutenção do Windows",
    icon: deps.iconPath || exe,
    iconIndex: 0,
    appUserModelId: deps.appId,
  };
}

/** Cria ou corrige (pasta do app mudou) um atalho. */
function writeShortcut(file) {
  const options = shortcutOptions();
  let mode = "create";
  if (fs.existsSync(file)) {
    try {
      const current = shell.readShortcutLink(file);
      const same =
        path.resolve(current.target || "").toLowerCase() === options.target.toLowerCase() &&
        current.appUserModelId === options.appUserModelId &&
        path.resolve(current.icon || "").toLowerCase() === path.resolve(options.icon).toLowerCase();
      if (same) return true;
    } catch {
      /* atalho inválido: recria */
    }
    mode = "replace";
  }
  const ok = shell.writeShortcutLink(file, mode, options);
  if (ok)
    logger.log("shortcuts", mode === "create" ? "Atalho criado" : "Atalho atualizado", { file });
  return ok;
}

function removeShortcut(file) {
  try {
    if (!fs.existsSync(file)) return true;
    // Só remove atalho do próprio WinCare (nunca um com o mesmo nome de outro app).
    const current = shell.readShortcutLink(file);
    if (current.appUserModelId !== deps.appId) return false;
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

function state() {
  return {
    ok: true,
    supported: deps.supported(),
    startMenu: fs.existsSync(startMenuPath()),
    desktop: fs.existsSync(desktopPath()),
  };
}

function setShortcuts(patch = {}) {
  if (!deps.supported()) return { ...state(), ok: false, reason: "Só no app instalado pelo ZIP." };
  try {
    if (typeof patch.startMenu === "boolean") {
      if (patch.startMenu) writeShortcut(startMenuPath());
      else removeShortcut(startMenuPath());
    }
    if (typeof patch.desktop === "boolean") {
      if (patch.desktop) writeShortcut(desktopPath());
      else removeShortcut(desktopPath());
    }
  } catch (error) {
    logger.warn("shortcuts", "Falha", error instanceof Error ? error.message : error);
    return { ...state(), ok: false, reason: "Não foi possível alterar o atalho." };
  }
  return state();
}

/**
 * @param {object} options
 * @param {string} options.appId AppUserModelID
 * @param {string} [options.iconPath] .ico do app
 * @param {() => boolean} options.supported só o app empacotado cria atalhos
 * @param {boolean} options.firstRun primeira vez que o app abre neste PC
 */
function initShortcuts(options) {
  deps = options;
  ipcMain.handle("wincare:shortcuts", () => state());
  ipcMain.handle("wincare:setShortcuts", (_e, patch) => setShortcuts(patch || {}));
  if (!deps.supported()) return;
  try {
    // Menu Iniciar: cria na primeira vez; depois só corrige se o app mudou de pasta.
    if (deps.firstRun || fs.existsSync(startMenuPath())) writeShortcut(startMenuPath());
    if (fs.existsSync(desktopPath())) writeShortcut(desktopPath());
  } catch (error) {
    logger.warn("shortcuts", "Atalhos", error instanceof Error ? error.message : error);
  }
}

module.exports = { initShortcuts };
