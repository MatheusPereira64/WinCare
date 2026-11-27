/*
 * Atualizar programas pelo winget (Gerenciador de Pacotes do Windows).
 * - listProgramUpdates: roda `winget upgrade` e lê a tabela (cabeçalho
 *   traduzido, então as colunas saem da posição, não do nome);
 * - updateProgram: só aceita ids da última lista (o renderer manda só o id)
 *   e chama o winget sem shell, em modo silencioso.
 * A leitura da tabela é testada em electron/tests/features.test.cjs.
 */
const { execFile } = require("child_process");

const LIST_TIMEOUT_MS = 2 * 60 * 1000;
const UPGRADE_TIMEOUT_MS = 20 * 60 * 1000;
const ID_RE = /^[A-Za-z0-9][\w.+-]{0,127}$/;

/** Último resultado: { id → item } — só esses ids podem ser atualizados. */
let known = new Map();
let busy = false;

/** Colunas pelo cabeçalho: palavras separadas por 2+ espaços. */
function columnStarts(header) {
  const starts = [];
  const re = /\S+(?: \S+)*/g;
  let m;
  while ((m = re.exec(header))) starts.push(m.index);
  return starts;
}

/** Tira o "spinner" do winget (\r, -, \, |, /) antes do texto da linha. */
const cleanLine = (line) => {
  const text = line.replace(/\s+$/, "");
  return text.slice(text.lastIndexOf("\r") + 1);
};

/** Lê a primeira tabela de `winget upgrade`. */
function parseWingetUpgrade(text) {
  const lines = String(text || "")
    .split("\n")
    .map(cleanLine);
  const dashes = lines.findIndex((l) => /^-{20,}$/.test(l.trim()));
  if (dashes < 1) return [];
  const header = lines[dashes - 1].replace(/^[\s\\|/-]+(?=\S)/, (s) => " ".repeat(s.length));
  const starts = columnStarts(header);
  if (starts.length < 4) return [];
  const cell = (line, i) =>
    line.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : undefined).trim();
  const items = [];
  for (const line of lines.slice(dashes + 1)) {
    if (!line.trim()) break;
    const id = cell(line, 1);
    // Rodapé ("42 atualizações disponíveis.") não chega à coluna do ID; id
    // cortado ("…") não dá para atualizar com segurança.
    if (!id || id.includes("…") || !ID_RE.test(id)) continue;
    const name = cell(line, 0);
    const version = cell(line, 2);
    const available = cell(line, 3);
    if (!name || !available) continue;
    items.push({
      id,
      name: name.replace(/…$/, "").trim(),
      version: version || null,
      available,
      source: starts.length > 4 ? cell(line, 4) || null : null,
    });
  }
  return items;
}

function runWinget(args, timeout) {
  return new Promise((resolve) => {
    execFile(
      "winget",
      args,
      { encoding: "utf8", windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        resolve({
          code: error ? (typeof error.code === "number" ? error.code : -1) : 0,
          missing: error?.code === "ENOENT",
          stdout: stdout || "",
        });
      },
    );
  });
}

async function listProgramUpdates() {
  if (process.platform !== "win32") return { ok: false, reason: "not-windows", items: [] };
  const out = await runWinget(
    ["upgrade", "--accept-source-agreements", "--disable-interactivity"],
    LIST_TIMEOUT_MS,
  );
  if (out.missing) return { ok: false, reason: "no-winget", items: [] };
  const items = parseWingetUpgrade(out.stdout);
  known = new Map(items.map((i) => [i.id, i]));
  if (!items.length && out.code !== 0) {
    return { ok: false, reason: "winget-failed", items: [] };
  }
  return { ok: true, items, at: Date.now() };
}

/** Códigos do winget (HRESULT como número com sinal) que valem mensagem própria. */
const WINGET_CODES = {
  [0x8a15002b | 0]: "Já está na versão mais nova.",
  [0x8a150011 | 0]: "O instalador foi cancelado ou recusou a atualização.",
  [0x8a150056 | 0]: "Feche o programa e tente de novo: ele está aberto.",
  [0x8a150101 | 0]: "Feche o programa e tente de novo: ele está aberto.",
  [0x8a150019 | 0]: "Precisa de permissão de administrador (o pedido foi recusado).",
};

function describeCode(code) {
  return WINGET_CODES[code | 0] || `O winget terminou com o código ${code}.`;
}

async function updateProgram({ id } = {}) {
  if (process.platform !== "win32") return { ok: false, reason: "not-windows" };
  const item = known.get(String(id || ""));
  if (!item)
    return { ok: false, reason: "unknown-id", message: "Atualize a lista e tente de novo." };
  if (busy)
    return { ok: false, reason: "busy", message: "Já existe uma atualização em andamento." };
  busy = true;
  try {
    const out = await runWinget(
      [
        "upgrade",
        "--id",
        item.id,
        "--exact",
        "--silent",
        "--accept-package-agreements",
        "--accept-source-agreements",
        "--disable-interactivity",
      ],
      UPGRADE_TIMEOUT_MS,
    );
    if (out.code === 0) {
      known.delete(item.id);
      return { ok: true, id: item.id, name: item.name, version: item.available };
    }
    return {
      ok: false,
      id: item.id,
      name: item.name,
      reason: "winget-failed",
      code: out.code,
      message: describeCode(out.code),
    };
  } finally {
    busy = false;
  }
}

module.exports = { listProgramUpdates, parseWingetUpgrade, updateProgram };
