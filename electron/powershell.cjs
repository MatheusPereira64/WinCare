const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

/** BOM + UTF-8 na saída: sem isso o PowerShell 5.1 corrompe acentos em scripts e no stdout. */
const PS_PRELUDE =
  "\uFEFF[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)\r\n" +
  "$OutputEncoding = [System.Text.UTF8Encoding]::new($false)\r\n";

const tempFile = (ext) =>
  path.join(os.tmpdir(), `wincare-ps-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);

const unlinkQuiet = (file) => {
  try {
    fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
};

/** Literal de string PowerShell entre aspas simples (inclui as aspas tipográficas que o parser aceita). */
const psQuote = (value) => `'${String(value).replace(/['\u2018\u2019\u201A\u201B]/g, "''")}'`;

/** No PowerShell 5.1, `,@(lista) | ConvertTo-Json` vira `{ value: [...], Count: n }`. */
function parseJsonOutput(text) {
  const data = JSON.parse(
    String(text || "null")
      .replace(/^\uFEFF/, "")
      .trim() || "null",
  );
  const wrapped = data && typeof data === "object" && !Array.isArray(data);
  return wrapped && Array.isArray(data.value) && "Count" in data ? data.value : data;
}

/** Scripts longos: evita escaping quebrado via arquivo .ps1 temporário. */
const psFileJson = (scriptBody, timeoutMs = 60000) =>
  new Promise((resolve, reject) => {
    const ps1 = tempFile("ps1");
    fs.writeFileSync(ps1, `${PS_PRELUDE}${scriptBody}`, "utf8");
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`,
      { maxBuffer: 1024 * 1024 * 16, timeout: timeoutMs, windowsHide: true },
      (err, stdout) => {
        unlinkQuiet(ps1);
        if (err && !stdout) {
          reject(err);
          return;
        }
        try {
          resolve(parseJsonOutput(stdout));
        } catch (parseErr) {
          reject(parseErr);
        }
      },
    );
  });

/**
 * Executa um script elevado (UAC) e devolve o JSON que ele escrever no stdout.
 * Resolve `{ ok: false, reason: "cancelled" }` quando o usuário recusa o UAC.
 */
const psElevatedJson = (scriptBody, timeoutMs = 300000) =>
  new Promise((resolve) => {
    const script = tempFile("ps1");
    const launcher = tempFile("ps1");
    const output = tempFile("json");
    fs.writeFileSync(
      script,
      `${PS_PRELUDE}& {\r\n${scriptBody}\r\n} | Out-File -LiteralPath ${psQuote(output)} -Encoding utf8\r\n`,
      "utf8",
    );
    fs.writeFileSync(
      launcher,
      `${PS_PRELUDE}Start-Process -FilePath powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',${psQuote(`"${script}"`)}\r\n`,
      "utf8",
    );
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${launcher}"`,
      { timeout: timeoutMs, windowsHide: true },
      () => {
        let payload = { ok: false, reason: "cancelled" };
        try {
          if (fs.existsSync(output)) payload = parseJsonOutput(fs.readFileSync(output, "utf8"));
        } catch (error) {
          payload = {
            ok: false,
            reason: error instanceof Error ? error.message : "invalid-output",
          };
        }
        [script, launcher, output].forEach(unlinkQuiet);
        resolve(payload);
      },
    );
  });

const isWindowsAdmin = () =>
  new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => resolve(false), 8000);
    exec(
      'powershell -NoProfile -Command "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"',
      { timeout: 7000, windowsHide: true },
      (err, stdout) => {
        clearTimeout(timer);
        resolve(!err && stdout.trim().toLowerCase() === "true");
      },
    );
  });

/** Usa o script direto quando já elevado; caso contrário passa pelo UAC. */
const psAdminJson = async (scriptBody, timeoutMs) =>
  (await isWindowsAdmin())
    ? psFileJson(scriptBody, timeoutMs)
    : psElevatedJson(scriptBody, timeoutMs);

module.exports = {
  isWindowsAdmin,
  parseJsonOutput,
  psAdminJson,
  psElevatedJson,
  psFileJson,
  psQuote,
};
