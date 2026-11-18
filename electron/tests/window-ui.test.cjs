const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeWindowBounds,
  isDevToolsShortcut,
  pageShortcutForInput,
  zoomCommandForInput,
} = require("../window-ui.cjs");

const key = (overrides) => ({
  type: "keyDown",
  control: true,
  meta: false,
  alt: false,
  shift: false,
  ...overrides,
});

test("zoom: Ctrl + / Ctrl = / numpad aumentam", () => {
  assert.equal(zoomCommandForInput(key({ key: "=", code: "Equal" })), "in");
  assert.equal(zoomCommandForInput(key({ key: "+", code: "Equal", shift: true })), "in");
  assert.equal(zoomCommandForInput(key({ key: "+", code: "NumpadAdd" })), "in");
  // Layout alemão: "+" fica em outra tecla física.
  assert.equal(zoomCommandForInput(key({ key: "+", code: "BracketRight" })), "in");
});

test("zoom: Ctrl − / numpad diminuem", () => {
  assert.equal(zoomCommandForInput(key({ key: "-", code: "Minus" })), "out");
  assert.equal(zoomCommandForInput(key({ key: "_", code: "Minus", shift: true })), "out");
  assert.equal(zoomCommandForInput(key({ key: "-", code: "NumpadSubtract" })), "out");
});

test("zoom: Ctrl 0 volta ao padrão, inclusive no AZERTY e no numpad", () => {
  assert.equal(zoomCommandForInput(key({ key: "0", code: "Digit0" })), "reset");
  assert.equal(zoomCommandForInput(key({ key: "à", code: "Digit0" })), "reset");
  assert.equal(zoomCommandForInput(key({ key: "Insert", code: "Numpad0" })), "reset");
});

test("zoom: ignora teclas sem Ctrl, AltGr, keyUp e outras combinações", () => {
  assert.equal(zoomCommandForInput(key({ key: "=", control: false })), null);
  // AltGr no Windows chega como Ctrl+Alt.
  assert.equal(zoomCommandForInput(key({ key: "0", code: "Digit0", alt: true })), null);
  assert.equal(zoomCommandForInput(key({ key: "=", type: "keyUp" })), null);
  assert.equal(zoomCommandForInput(key({ key: "k", code: "KeyK" })), null);
  assert.equal(zoomCommandForInput(key({ key: "b", code: "KeyB" })), null);
  assert.equal(zoomCommandForInput(null), null);
});

test("janela: tamanho preferido quando cabe no monitor", () => {
  const b = computeWindowBounds({ x: 0, y: 0, width: 1920, height: 1040 });
  assert.equal(b.maximize, false);
  assert.equal(b.width, 1360);
  assert.equal(b.height, 900);
  assert.equal(b.minWidth, 1024);
  assert.equal(b.minHeight, 640);
  // Centralizada na área de trabalho.
  assert.equal(b.x, 280);
  assert.equal(b.y, 70);
});

test("janela: 1920×1080 a 150% (1280×~680) abre maximizada e cabe na tela", () => {
  const area = { x: 0, y: 0, width: 1280, height: 672 };
  const b = computeWindowBounds(area);
  assert.equal(b.maximize, true);
  assert.ok(b.width <= area.width && b.height <= area.height);
  assert.ok(b.x >= 0 && b.y >= 0);
  assert.equal(b.minWidth, 1024);
  assert.equal(b.minHeight, 640);
});

test("janela: 1366×768 a 125% (1093×~614) nunca exige mais que o monitor", () => {
  const area = { x: 0, y: 0, width: 1093, height: 574 };
  const b = computeWindowBounds(area);
  assert.equal(b.maximize, true);
  assert.equal(b.minWidth, 1024);
  assert.equal(b.minHeight, 574);
  assert.ok(b.height <= area.height);
  assert.ok(b.width >= b.minWidth && b.height >= b.minHeight);
});

test("janela: respeita a origem de um segundo monitor", () => {
  const b = computeWindowBounds({ x: 1920, y: -200, width: 2560, height: 1400 });
  assert.ok(b.x >= 1920 && b.x + b.width <= 1920 + 2560);
  assert.ok(b.y >= -200 && b.y + b.height <= 1200);
});

test("janela: work area inválida cai no tamanho preferido", () => {
  const b = computeWindowBounds(undefined);
  assert.equal(b.width, 1360);
  assert.equal(b.height, 900);
  assert.equal(b.maximize, false);
});

const alt = (overrides) => ({
  type: "keyDown",
  control: false,
  meta: false,
  alt: true,
  shift: false,
  ...overrides,
});

test("páginas: Alt+1…9 e Alt+0 pelo código físico (qualquer layout)", () => {
  assert.equal(pageShortcutForInput(alt({ key: "1", code: "Digit1" })), "1");
  assert.equal(pageShortcutForInput(alt({ key: "9", code: "Digit9" })), "9");
  assert.equal(pageShortcutForInput(alt({ key: "0", code: "Digit0" })), "0");
  // AZERTY: sem Shift a tecla do 1 produz "&".
  assert.equal(pageShortcutForInput(alt({ key: "&", code: "Digit1" })), "1");
});

test("páginas: ignora AltGr, Shift, numpad, keyUp e Alt sozinho", () => {
  // AltGr+2 digita "²" no ABNT2 e chega como Ctrl+Alt.
  assert.equal(pageShortcutForInput(alt({ key: "²", code: "Digit2", control: true })), null);
  assert.equal(pageShortcutForInput(alt({ key: "!", code: "Digit1", shift: true })), null);
  // Alt+numpad digita caracteres (códigos Alt) no Windows.
  assert.equal(pageShortcutForInput(alt({ key: "1", code: "Numpad1" })), null);
  assert.equal(pageShortcutForInput(alt({ key: "1", code: "Digit1", type: "keyUp" })), null);
  assert.equal(pageShortcutForInput(alt({ key: "Alt", code: "AltLeft" })), null);
  assert.equal(pageShortcutForInput(alt({ key: "1", code: "Digit1", alt: false })), null);
  assert.equal(pageShortcutForInput(null), null);
});

test("F12: alterna o DevTools uma vez por toque (só keyDown, sem repetição)", () => {
  const f12 = (overrides) => ({ type: "keyDown", key: "F12", isAutoRepeat: false, ...overrides });
  assert.equal(isDevToolsShortcut(f12({})), true);
  assert.equal(isDevToolsShortcut(f12({ type: "keyUp" })), false);
  assert.equal(isDevToolsShortcut(f12({ isAutoRepeat: true })), false);
  assert.equal(isDevToolsShortcut(f12({ control: true })), false);
  assert.equal(isDevToolsShortcut(f12({ key: "F11" })), false);
  assert.equal(isDevToolsShortcut(null), false);
});
