/**
 * Treemap "squarified" (Bruls, Huizing e van Wijk): divide um retângulo em
 * blocos com área proporcional ao tamanho, mantendo-os o mais quadrados
 * possível (fáceis de clicar e de comparar). Coordenadas em % do contêiner.
 */
export interface TreemapInput {
  id: string;
  value: number;
}

export interface TreemapRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pior proporção (lado maior / menor) de uma fileira com o lado `side`. */
function worstRatio(row: number[], side: number) {
  const sum = row.reduce((a, b) => a + b, 0);
  if (sum <= 0 || side <= 0) return Infinity;
  const max = Math.max(...row);
  const min = Math.min(...row);
  const s2 = side * side;
  const sum2 = sum * sum;
  return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
}

function layoutRow(items: { id: string; area: number }[], box: Box, out: TreemapRect[]): Box {
  const sum = items.reduce((n, it) => n + it.area, 0);
  if (box.w >= box.h) {
    // Coluna à esquerda com a altura toda.
    const width = sum / box.h;
    let y = box.y;
    for (const it of items) {
      const h = it.area / width;
      out.push({ id: it.id, x: box.x, y, w: width, h });
      y += h;
    }
    return { x: box.x + width, y: box.y, w: box.w - width, h: box.h };
  }
  const height = sum / box.w;
  let x = box.x;
  for (const it of items) {
    const w = it.area / height;
    out.push({ id: it.id, x, y: box.y, w, h: height });
    x += w;
  }
  return { x: box.x, y: box.y + height, w: box.w, h: box.h - height };
}

/**
 * Calcula os blocos para um contêiner `width` × `height` (proporção real da
 * tela) e devolve as posições em % (0–100). Itens com valor ≤ 0 são ignorados.
 */
export function squarify(input: TreemapInput[], width = 100, height = 100): TreemapRect[] {
  const valid = input.filter((it) => it.value > 0).sort((a, b) => b.value - a.value);
  const total = valid.reduce((n, it) => n + it.value, 0);
  if (!valid.length || total <= 0 || width <= 0 || height <= 0) return [];
  const scale = (width * height) / total;
  const items = valid.map((it) => ({ id: it.id, area: it.value * scale }));

  const out: TreemapRect[] = [];
  let box: Box = { x: 0, y: 0, w: width, h: height };
  let row: { id: string; area: number }[] = [];
  let i = 0;
  while (i < items.length) {
    const side = Math.min(box.w, box.h);
    const next = items[i];
    const current = row.map((r) => r.area);
    if (!row.length || worstRatio([...current, next.area], side) <= worstRatio(current, side)) {
      row.push(next);
      i++;
    } else {
      box = layoutRow(row, box, out);
      row = [];
    }
  }
  if (row.length) layoutRow(row, box, out);

  return out.map((r) => ({
    id: r.id,
    x: (r.x / width) * 100,
    y: (r.y / height) * 100,
    w: (r.w / width) * 100,
    h: (r.h / height) * 100,
  }));
}
