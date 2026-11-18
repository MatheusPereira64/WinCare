/**
 * Regras puras de janela e zoom (sem Electron), para poder testar com node --test.
 */

/** Tamanho preferido e mínimo da janela em DIPs (pixels já divididos pela escala do Windows). */
const PREFERRED_SIZE = { width: 1360, height: 900 };
const MINIMUM_SIZE = { width: 1024, height: 640 };

/**
 * Tamanho inicial que cabe na área de trabalho do monitor.
 *
 * Em notebooks com escala de 125%/150% a área útil costuma ser menor que o
 * tamanho preferido (ex.: 1920×1080 a 150% = 1280×~680). Nesse caso abrimos
 * maximizado e guardamos um tamanho "restaurado" que cabe na tela; o mínimo
 * nunca passa do que o monitor comporta, senão a barra de título some.
 */
function computeWindowBounds(workArea, preferred = PREFERRED_SIZE, minimum = MINIMUM_SIZE) {
  const area = {
    x: Number(workArea?.x) || 0,
    y: Number(workArea?.y) || 0,
    width: Math.max(1, Math.floor(Number(workArea?.width) || preferred.width)),
    height: Math.max(1, Math.floor(Number(workArea?.height) || preferred.height)),
  };
  const minWidth = Math.min(minimum.width, area.width);
  const minHeight = Math.min(minimum.height, area.height);
  const fits = preferred.width <= area.width && preferred.height <= area.height;
  const width = fits
    ? preferred.width
    : Math.max(minWidth, Math.min(preferred.width, Math.round(area.width * 0.9)));
  const height = fits
    ? preferred.height
    : Math.max(minHeight, Math.min(preferred.height, Math.round(area.height * 0.9)));
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
    minWidth,
    minHeight,
    maximize: !fits,
  };
}

const ZOOM_IN_KEYS = new Set(["+", "=", "Add"]);
const ZOOM_OUT_KEYS = new Set(["-", "_", "Subtract"]);

/**
 * Converte o evento de teclado do before-input-event em comando de zoom.
 *
 * Usa a tecla produzida (`key`) para funcionar em ABNT2, US e outros layouts;
 * o código físico só entra no teclado numérico e no 0 (AZERTY produz "à").
 * Ctrl+Alt é ignorado: no Windows isso é AltGr, usado para digitar símbolos.
 */
function zoomCommandForInput(input) {
  if (!input || input.type !== "keyDown") return null;
  if (!(input.control || input.meta) || input.alt) return null;
  const { key, code } = input;
  if (ZOOM_IN_KEYS.has(key) || code === "NumpadAdd") return "in";
  if (ZOOM_OUT_KEYS.has(key) || code === "NumpadSubtract") return "out";
  if (key === "0" || code === "Digit0" || code === "Numpad0") return "reset";
  return null;
}

/**
 * Alt+1…9 / Alt+0 (páginas). Usa o código físico (Digit1…Digit0) para valer em
 * qualquer layout; ignora Ctrl+Alt (AltGr digita símbolos no ABNT2/Europa),
 * Shift e o teclado numérico (Alt+numpad digita caracteres no Windows).
 * Retorna o dígito ("1"…"9", "0") ou null.
 */
function pageShortcutForInput(input) {
  if (!input || input.type !== "keyDown") return null;
  if (!input.alt || input.control || input.meta || input.shift) return null;
  const match = /^Digit([0-9])$/.exec(input.code || "");
  return match ? match[1] : null;
}

/**
 * F12 (ferramentas de desenvolvedor): só no keyDown, sem repetição e sem
 * modificadores. O before-input-event também dispara no keyUp — tratar os dois
 * abria e fechava o DevTools no mesmo toque.
 */
function isDevToolsShortcut(input) {
  return (
    !!input &&
    input.type === "keyDown" &&
    input.key === "F12" &&
    !input.isAutoRepeat &&
    !input.control &&
    !input.alt &&
    !input.shift &&
    !input.meta
  );
}

module.exports = {
  computeWindowBounds,
  isDevToolsShortcut,
  pageShortcutForInput,
  zoomCommandForInput,
};
