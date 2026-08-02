/**
 * Verifica releases no GitHub e aplica atualização no app portátil (ZIP).
 *
 * Fluxo de apply:
 * 1) Baixa WinCare-Windows-x64.zip
 * 2) Extrai em %TEMP%
 * 3) Gera um .cmd que espera o processo atual encerrar, substitui os arquivos
 *    e reabre o WinCare.exe
 * 4) Encerra o app
 */
const { app, net } = require("electron");
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const fsp = require("fs").promises;
const https = require("https");
const http = require("http");
const os = require("os");
const path = require("path");
const logger = require("./logger.cjs");

const GITHUB_OWNER = "MatheusPereira64";
const GITHUB_REPO = "WinCare";
const ASSET_NAME = "WinCare-Windows-x64.zip";
const USER_AGENT = "WinCare-Updater";

function isReleaseBuild() {
  if (process.platform !== "win32") return false;
  const realAsar = path.join(path.dirname(process.execPath), "resources", "app.asar");
  const realApp = path.join(path.dirname(process.execPath), "resources", "app");
  return fs.existsSync(realAsar) || fs.existsSync(realApp);
}

function getInstallDir() {
  return path.dirname(process.execPath);
}

function getAppVersion() {
  return app.getVersion();
}

/** Compara SemVer simples (1.2.3). Retorna -1 / 0 / 1. */
function compareVersions(a, b) {
  const pa = String(a)
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b)
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((x) => Number.parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

function stripVersion(tag) {
  return String(tag || "").replace(/^v/i, "").trim();
}

async function githubJson(apiPath) {
  const url = `https://api.github.com${apiPath}`;
  if (typeof net.fetch === "function") {
    const res = await net.fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200) || res.statusText}`);
    }
    return res.json();
  }

  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": USER_AGENT,
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (c) => {
            data += c;
          });
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`GitHub API ${res.statusCode}: ${data.slice(0, 200)}`));
              return;
            }
            try {
              resolve(JSON.parse(data));
            } catch (err) {
              reject(err);
            }
          });
        },
      )
      .on("error", reject);
  });
}

async function checkForUpdate() {
  const currentVersion = getAppVersion();
  const release = await githubJson(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`);
  const latestVersion = stripVersion(release.tag_name);
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const asset = assets.find((a) => a && a.name === ASSET_NAME) || null;
  const updateAvailable = compareVersions(currentVersion, latestVersion) < 0;

  return {
    ok: true,
    currentVersion,
    latestVersion,
    updateAvailable,
    releaseName: release.name || `WinCare ${release.tag_name}`,
    releaseNotes: typeof release.body === "string" ? release.body.slice(0, 4000) : "",
    htmlUrl: release.html_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    downloadUrl: asset?.browser_download_url || null,
    assetName: asset?.name || null,
    assetSize: asset?.size || null,
    canAutoUpdate: isReleaseBuild() && !!asset?.browser_download_url,
    packaged: isReleaseBuild(),
  };
}

function downloadFile(fileUrl, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirects) => {
      if (redirects > 8) {
        reject(new Error("Muitos redirecionamentos no download."));
        return;
      }
      const client = currentUrl.startsWith("http://") ? http : https;
      const req = client.get(
        currentUrl,
        { headers: { "User-Agent": USER_AGENT } },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            follow(res.headers.location, redirects + 1);
            return;
          }
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`Falha no download (HTTP ${res.statusCode || "?"}).`));
            res.resume();
            return;
          }

          const total = Number(res.headers["content-length"]) || 0;
          let received = 0;
          const file = fs.createWriteStream(destPath);
          res.on("data", (chunk) => {
            received += chunk.length;
            if (onProgress && total > 0) {
              onProgress({
                phase: "download",
                percent: Math.min(99, Math.round((received / total) * 100)),
                received,
                total,
              });
            }
          });
          res.pipe(file);
          file.on("finish", () => {
            file.close(() => resolve({ received, total }));
          });
          file.on("error", (err) => {
            try {
              fs.unlinkSync(destPath);
            } catch {
              /* ignore */
            }
            reject(err);
          });
        },
      );
      req.on("error", reject);
    };
    follow(fileUrl, 0);
  });
}

function expandZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const ps = [
      "$ErrorActionPreference = 'Stop'",
      `New-Item -ItemType Directory -Force -Path '${destDir.replace(/'/g, "''")}' | Out-Null`,
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ].join("; ");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { windowsHide: true },
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(stderr?.toString()?.trim() || err.message));
          return;
        }
        resolve();
      },
    );
  });
}

async function findExtractedRoot(extractDir) {
  const exeDirect = path.join(extractDir, "WinCare.exe");
  if (fs.existsSync(exeDirect)) return extractDir;

  const entries = await fsp.readdir(extractDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(extractDir, entry.name);
    if (fs.existsSync(path.join(candidate, "WinCare.exe"))) return candidate;
  }
  throw new Error("WinCare.exe não encontrado no ZIP baixado.");
}

function writeApplyScript({ installDir, sourceDir, exePath, pid }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const batFile = path.join(os.tmpdir(), `wincare-apply-update-${id}.cmd`);
  const logFile = path.join(os.tmpdir(), `wincare-apply-update-${id}.log`);

  const bat = [
    "@echo off",
    `set LOG="${logFile}"`,
    "echo [WinCare] Aguardando o aplicativo encerrar... > %LOG%",
    `:wait`,
    `tasklist /FI "PID eq ${pid}" 2>NUL | find "${pid}" >NUL`,
    "if not errorlevel 1 (",
    "  timeout /t 1 /nobreak >NUL",
    "  goto wait",
    ")",
    "echo [WinCare] Copiando arquivos... >> %LOG%",
    `robocopy "${sourceDir}" "${installDir}" /E /IS /IT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP >> %LOG% 2>&1`,
    "set RC=%ERRORLEVEL%",
    "if %RC% GEQ 8 (",
    "  echo [WinCare] Falha ao copiar arquivos (robocopy %RC%). >> %LOG%",
    "  exit /b %RC%",
    ")",
    "echo [WinCare] Reiniciando... >> %LOG%",
    `start "" "${exePath}"`,
    'del "%~f0" >nul 2>&1',
    "exit /b 0",
    "",
  ].join("\r\n");

  fs.writeFileSync(batFile, bat, "utf8");
  return { batFile, logFile };
}

/**
 * Baixa o ZIP do latest release, extrai e agenda a substituição ao sair.
 * Só funciona no build portátil empacotado.
 */
async function downloadAndApplyUpdate(onProgress) {
  if (!isReleaseBuild()) {
    return {
      ok: false,
      reason: "auto-update-unavailable",
      message:
        "Atualização automática só está disponível no app instalado (ZIP). Em desenvolvimento, baixe o release manualmente.",
    };
  }

  onProgress?.({ phase: "check", percent: 0 });
  const info = await checkForUpdate();
  if (!info.updateAvailable) {
    return { ok: false, reason: "up-to-date", message: "Você já está na versão mais recente.", info };
  }
  if (!info.downloadUrl) {
    return {
      ok: false,
      reason: "missing-asset",
      message: `Release encontrado, mas o arquivo ${ASSET_NAME} não está disponível.`,
      info,
    };
  }

  const workDir = path.join(os.tmpdir(), `wincare-update-${Date.now()}`);
  const zipPath = path.join(workDir, ASSET_NAME);
  const extractDir = path.join(workDir, "extract");
  await fsp.mkdir(workDir, { recursive: true });

  try {
    onProgress?.({ phase: "download", percent: 1 });
    logger.log("updater", "Baixando release", {
      version: info.latestVersion,
      url: info.downloadUrl,
    });
    await downloadFile(info.downloadUrl, zipPath, onProgress);

    onProgress?.({ phase: "extract", percent: 0 });
    await expandZip(zipPath, extractDir);
    const sourceDir = await findExtractedRoot(extractDir);

    const installDir = getInstallDir();
    const exePath = path.join(installDir, "WinCare.exe");
    const { batFile, logFile } = writeApplyScript({
      installDir,
      sourceDir,
      exePath,
      pid: process.pid,
    });

    onProgress?.({ phase: "apply", percent: 100 });
    logger.log("updater", "Agenda de substituição criada", { batFile, logFile, installDir });

    const child = spawn("cmd.exe", ["/c", batFile], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    setTimeout(() => app.quit(), 400);

    return {
      ok: true,
      reason: "applying",
      message: `Atualizando para ${info.latestVersion}. O WinCare vai fechar e reabrir.`,
      info,
      logFile,
    };
  } catch (error) {
    logger.error("updater", "Falha ao atualizar", error instanceof Error ? error.message : error);
    try {
      await fsp.rm(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      reason: "failed",
      message: error instanceof Error ? error.message : "Falha ao baixar ou aplicar a atualização.",
    };
  }
}

async function openLatestReleasePage() {
  const { shell } = require("electron");
  const info = await checkForUpdate();
  await shell.openExternal(info.htmlUrl);
  return { ok: true, info };
}

module.exports = {
  GITHUB_OWNER,
  GITHUB_REPO,
  ASSET_NAME,
  isReleaseBuild,
  getAppVersion,
  compareVersions,
  checkForUpdate,
  downloadAndApplyUpdate,
  openLatestReleasePage,
};
