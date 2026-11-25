/**
 * Troca de tema/aparência sem "cores pela metade".
 *
 * Cada botão, link e card tem a sua transição de cor (0,15 s): numa troca de
 * tema, parte da tela mudava na hora e parte ia desbotando depois. Aqui:
 *   1) as transições de cada elemento ficam desligadas durante a troca
 *      (classe `theme-switching` no <html>): tudo muda no mesmo quadro;
 *   2) com a View Transitions API (Chromium/Electron), a tela inteira faz um
 *      único esmaecimento rápido, feito pela GPU sobre duas imagens.
 * Com "reduzir animações" (Windows ou Aparência → Animações desligadas) a
 * troca é instantânea.
 */

type ViewTransition = { finished: Promise<void> };
type DocWithVT = Document & {
  startViewTransition?: (cb: () => Promise<void> | void) => ViewTransition;
};

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  const root = document.documentElement;
  if (root.dataset.motion === "reduced") return true;
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

let pending = 0;

/** Executa `apply` (muda classes/atributos do <html> e o estado) como uma troca de tema. */
export function runThemeChange(apply: () => void) {
  if (typeof document === "undefined") {
    apply();
    return;
  }
  const root = document.documentElement;
  pending++;
  root.classList.add("theme-switching");
  const release = () => {
    // Dois quadros: o navegador já pintou com as cores novas antes de religar as transições.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        pending = Math.max(0, pending - 1);
        if (!pending) root.classList.remove("theme-switching");
      }),
    );
  };

  const doc = document as DocWithVT;
  if (!prefersReducedMotion() && typeof doc.startViewTransition === "function") {
    const transition = doc.startViewTransition(async () => {
      apply();
      // Deixa o React aplicar o que depende do tema (gráficos, avisos) antes da foto nova.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    transition.finished.then(release, release);
    return;
  }
  apply();
  release();
}

/** Cor de uma variável CSS do tema em hexadecimal (bibliotecas de gráfico não entendem oklch). */
export function themeColor(variable: string, fallback = "#888888") {
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.color = `var(${variable})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx || !value) return fallback;
  ctx.fillStyle = "#000";
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
