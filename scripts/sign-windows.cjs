/**
 * Assina WinCare.exe e as DLLs do pacote com signtool (Windows SDK).
 *
 * Sem certificado configurado o passo é pulado, então builds locais e forks seguem
 * funcionando. Em release, defina WINCARE_SIGN_REQUIRED=1 para falhar em vez de pular.
 *
 * Variáveis:
 *   WINCARE_SIGN_PFX_BASE64  certificado .pfx em base64 (GitHub Secret)
 *   WINCARE_SIGN_PFX         ou caminho de um .pfx local
 *   WINCARE_SIGN_PASSWORD    senha do .pfx
 *   WINCARE_SIGN_TIMESTAMP   servidor RFC 3161 (padrão: DigiCert)
 *   SIGNTOOL                 caminho do signtool.exe (padrão: procura no Windows SDK)
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_TIMESTAMP = "http://timestamp.digicert.com";

function findSigntool(env = process.env) {
  if (env.SIGNTOOL && fs.existsSync(env.SIGNTOOL)) return env.SIGNTOOL;
  const kits = path.join(
    env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    "Windows Kits/10/bin",
  );
  let versions = [];
  try {
    versions = fs
      .readdirSync(kits)
      .filter((name) => /^\d+\./.test(name))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  } catch {
    return null;
  }
  for (const version of versions) {
    const candidate = path.join(kits, version, "x64", "signtool.exe");
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function listSignableFiles(appDir) {
  return fs
    .readdirSync(appDir)
    .filter((name) => /\.(exe|dll)$/i.test(name))
    .map((name) => path.join(appDir, name));
}

function fail(message) {
  console.error(`Assinatura: ${message}`);
  process.exit(1);
}

/** @returns {boolean} true se os binários foram assinados e verificados. */
function signPackage(appDir, env = process.env) {
  const required = env.WINCARE_SIGN_REQUIRED === "1";
  const hasCertificate = !!(env.WINCARE_SIGN_PFX_BASE64 || env.WINCARE_SIGN_PFX);

  if (!hasCertificate) {
    if (required) fail("WINCARE_SIGN_REQUIRED=1, mas nenhum certificado foi configurado.");
    console.log("Assinatura: sem certificado configurado — pacote NÃO assinado.");
    return false;
  }

  const signtool = findSigntool(env);
  if (!signtool) fail("signtool.exe não encontrado. Instale o Windows SDK ou defina SIGNTOOL.");

  let tempPfx = null;
  try {
    let pfx = env.WINCARE_SIGN_PFX;
    if (env.WINCARE_SIGN_PFX_BASE64) {
      tempPfx = path.join(os.tmpdir(), `wincare-sign-${process.pid}.pfx`);
      fs.writeFileSync(tempPfx, Buffer.from(env.WINCARE_SIGN_PFX_BASE64, "base64"), {
        mode: 0o600,
      });
      pfx = tempPfx;
    }

    const files = listSignableFiles(appDir);
    const sign = spawnSync(
      signtool,
      [
        "sign",
        "/f",
        pfx,
        ...(env.WINCARE_SIGN_PASSWORD ? ["/p", env.WINCARE_SIGN_PASSWORD] : []),
        "/fd",
        "SHA256",
        "/tr",
        env.WINCARE_SIGN_TIMESTAMP || DEFAULT_TIMESTAMP,
        "/td",
        "SHA256",
        "/d",
        "WinCare",
        ...files,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    if (sign.status !== 0) fail("signtool sign falhou.");

    const verify = spawnSync(signtool, ["verify", "/pa", path.join(appDir, "WinCare.exe")], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (verify.status !== 0) fail("a assinatura de WinCare.exe não passou na verificação.");

    console.log(`Assinatura: ${files.length} arquivos assinados e verificados.`);
    return true;
  } finally {
    if (tempPfx) fs.rmSync(tempPfx, { force: true });
  }
}

module.exports = { findSigntool, listSignableFiles, signPackage };
