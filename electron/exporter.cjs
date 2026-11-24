/*
 * Exportar tabelas (resultados da análise de disco, busca, duplicados,
 * comparação, histórico) em CSV, Excel (.xlsx), PDF, HTML ou texto.
 *
 * O renderer manda só dados (título, colunas e linhas); o destino vem da
 * janela "Salvar como" aberta aqui. O .xlsx é montado à mão (planilha simples
 * com strings em linha) para não trazer uma dependência só para isso.
 */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");
const { BrowserWindow, dialog } = require("electron");

const MAX_ROWS = 50_000;
const MAX_COLUMNS = 20;

const FORMATS = Object.freeze({
  csv: { name: "Planilha CSV", ext: "csv" },
  xlsx: { name: "Pasta de trabalho do Excel", ext: "xlsx" },
  pdf: { name: "Documento PDF", ext: "pdf" },
  html: { name: "Página HTML", ext: "html" },
  txt: { name: "Texto", ext: "txt" },
});

/* ------------------------------ Dados ------------------------------ */

const GB = 1024 ** 3;

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= GB) return `${(n / GB).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`;
  if (n >= 1024 ** 2) {
    return `${(n / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  }
  if (n >= 1024) return `${Math.round(n / 1024).toLocaleString("pt-BR")} KB`;
  return `${n} B`;
}

/** Tabela normalizada: colunas válidas, células como texto (e número para o Excel). */
function normalizeTable({ title, columns, rows }) {
  const cols = (Array.isArray(columns) ? columns : [])
    .slice(0, MAX_COLUMNS)
    .map((c) => ({
      key: String(c?.key || ""),
      label: String(c?.label || c?.key || "").slice(0, 80),
      type: ["number", "bytes", "date", "text"].includes(c?.type) ? c.type : "text",
    }))
    .filter((c) => c.key);
  const list = (Array.isArray(rows) ? rows : []).slice(0, MAX_ROWS);
  const cells = list.map((row) =>
    cols.map((col) => {
      const raw = row?.[col.key];
      if (col.type === "bytes") return { text: formatBytes(raw), number: Number(raw) || 0 };
      if (col.type === "number") {
        const n = Number(raw);
        return Number.isFinite(n)
          ? { text: n.toLocaleString("pt-BR"), number: n }
          : { text: String(raw ?? "") };
      }
      if (col.type === "date") {
        const n = Number(raw);
        return { text: Number.isFinite(n) && n > 0 ? new Date(n).toLocaleString("pt-BR") : "" };
      }
      return { text: String(raw ?? "").slice(0, 2000) };
    }),
  );
  return { title: String(title || "Relatório WinCare").slice(0, 120), cols, cells };
}

const csvCell = (text) => (/[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/** ";" e BOM: o Excel em português abre direto nas colunas certas. */
function toCsv(table) {
  const lines = [table.cols.map((c) => csvCell(c.label)).join(";")];
  for (const row of table.cells) lines.push(row.map((c) => csvCell(c.text)).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

function toText(table) {
  const widths = table.cols.map((c, i) =>
    Math.min(60, Math.max(c.label.length, ...table.cells.map((r) => r[i].text.length))),
  );
  const pad = (text, i) => text.slice(0, widths[i]).padEnd(widths[i]);
  const lines = [
    table.title,
    `Gerado em ${new Date().toLocaleString("pt-BR")}`,
    "",
    table.cols.map((c, i) => pad(c.label, i)).join("  "),
    widths.map((w) => "-".repeat(w)).join("  "),
    ...table.cells.map((row) => row.map((c, i) => pad(c.text, i)).join("  ")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function toHtml(table) {
  const numeric = table.cols.map((c) => c.type === "number" || c.type === "bytes");
  const head = table.cols
    .map((c, i) => `<th${numeric[i] ? ' class="n"' : ""}>${escapeHtml(c.label)}</th>`)
    .join("");
  const body = table.cells
    .map(
      (row) =>
        `<tr>${row.map((c, i) => `<td${numeric[i] ? ' class="n"' : ""}>${escapeHtml(c.text)}</td>`).join("")}</tr>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(table.title)}</title>
<style>
body{font-family:"Segoe UI",system-ui,sans-serif;color:#1b2333;margin:32px}
h1{font-size:20px;margin:0 0 4px}
p{color:#5b6478;font-size:12px;margin:0 0 20px}
table{border-collapse:collapse;width:100%;font-size:12px}
th{background:#eef3ff;color:#1f3a8a;text-align:left;font-weight:600}
th,td{padding:6px 10px;border-bottom:1px solid #e3e8f2;vertical-align:top;word-break:break-word}
tr:nth-child(even) td{background:#f8faff}
.n{text-align:right;white-space:nowrap}
</style></head><body>
<h1>${escapeHtml(table.title)}</h1>
<p>Gerado pelo WinCare em ${escapeHtml(new Date().toLocaleString("pt-BR"))} · ${table.cells.length.toLocaleString("pt-BR")} linhas</p>
<table><thead><tr>${head}</tr></thead><tbody>
${body}
</tbody></table></body></html>`;
}

/* ------------------------------ .xlsx ------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP mínimo (deflate), suficiente para o Office abrir o pacote. */
function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.content, "utf8");
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const xmlEscape = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Caracteres de controle quebram o XML do Excel.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function columnName(index) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function toXlsx(table) {
  // Bytes viram número em MB (dá para somar/ordenar no Excel).
  const header = table.cols.map((c) => (c.type === "bytes" ? `${c.label} (MB)` : c.label));
  const rowXml = (cells, r) =>
    `<row r="${r}">${cells
      .map((cell, i) => {
        const ref = `${columnName(i)}${r}`;
        if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
        return `<c r="${ref}" t="inlineStr"${r === 1 ? ' s="1"' : ""}><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
      })
      .join("")}</row>`;
  const rows = [rowXml(header, 1)];
  table.cells.forEach((row, ri) => {
    const values = row.map((cell, ci) => {
      const col = table.cols[ci];
      if (col.type === "bytes") return Math.round((cell.number / 1024 ** 2) * 100) / 100;
      if (col.type === "number" && typeof cell.number === "number") return cell.number;
      return cell.text;
    });
    rows.push(rowXml(values, ri + 2));
  });
  const widths = table.cols
    .map(
      (c, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${c.type === "text" ? 48 : 18}" customWidth="1"/>`,
    )
    .join("");
  const sheetName = xmlEscape(table.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "WinCare");
  return buildZip([
    {
      name: "[Content_Types].xml",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    },
    {
      name: "_rels/.rels",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    },
    {
      name: "xl/styles.xml",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>',
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${rows.join("")}</sheetData></worksheet>`,
    },
  ]);
}

/* ------------------------------ PDF ------------------------------ */

async function toPdf(table) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, contextIsolation: true, nodeIntegration: false },
  });
  try {
    const html = Buffer.from(toHtml(table), "utf8").toString("base64");
    await win.loadURL(`data:text/html;charset=utf-8;base64,${html}`);
    return await win.webContents.printToPDF({
      printBackground: true,
      landscape: table.cols.length > 4,
      pageSize: "A4",
      margins: { marginType: "default" },
    });
  } finally {
    win.destroy();
  }
}

/* ------------------------------ Salvar ------------------------------ */

const safeName = (name) =>
  String(name || "WinCare")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .slice(0, 80);

async function exportTable(payload = {}) {
  const format = FORMATS[payload.format] ? payload.format : "csv";
  const table = normalizeTable(payload);
  if (!table.cols.length) return { ok: false, reason: "Nada para exportar." };
  const { ext, name } = FORMATS[format];
  const base = safeName(payload.fileName || table.title);
  const win = BrowserWindow.getFocusedWindow() || undefined;
  const result = await dialog.showSaveDialog(win, {
    title: "Exportar resultado",
    defaultPath: `${base}-${new Date().toISOString().slice(0, 10)}.${ext}`,
    filters: [{ name, extensions: [ext] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, reason: "cancelled" };
  let content;
  if (format === "csv") content = toCsv(table);
  else if (format === "txt") content = toText(table);
  else if (format === "html") content = toHtml(table);
  else if (format === "xlsx") content = toXlsx(table);
  else content = await toPdf(table);
  const target =
    path.extname(result.filePath).toLowerCase() === `.${ext}`
      ? result.filePath
      : `${result.filePath}.${ext}`;
  fs.writeFileSync(target, content);
  return { ok: true, path: target, rows: table.cells.length };
}

module.exports = { buildZip, crc32, exportTable, normalizeTable, toCsv, toXlsx };
