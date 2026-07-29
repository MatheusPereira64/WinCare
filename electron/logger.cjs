const fs = require("fs");
const path = require("path");

let logDir = "";
let logFile = "";

function initLogger(app) {
  logDir = path.join(app.getPath("userData"), "logs");
  logFile = path.join(logDir, "wincare.log");
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    /* ignore */
  }
}

let pendingLines = [];
let flushTimer = null;

function flushPending() {
  flushTimer = null;
  if (!logFile || !pendingLines.length) return;
  const batch = `${pendingLines.join("\n")}\n`;
  pendingLines = [];
  fs.appendFile(logFile, batch, "utf8", () => {});
}

function write(level, scope, message, extra) {
  const line = `[${new Date().toISOString()}] [${level}] [${scope}] ${message}${
    extra ? ` ${typeof extra === "string" ? extra : JSON.stringify(extra)}` : ""
  }`;
  console.log(line);
  if (!logFile) return;
  pendingLines.push(line);
  if (!flushTimer) {
    flushTimer = setImmediate(flushPending);
  }
}

module.exports = {
  initLogger,
  getLogPaths: () => ({ logDir, logFile }),
  log: (scope, message, extra) => write("INFO", scope, message, extra),
  warn: (scope, message, extra) => write("WARN", scope, message, extra),
  error: (scope, message, extra) => write("ERROR", scope, message, extra),
};
