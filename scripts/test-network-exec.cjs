/** Testa execução bufferizada igual ao Electron main (ping / flushdns). */
const { exec } = require("child_process");

function execBuffered(command, limitMs) {
  return new Promise((resolve) => {
    exec(
      command,
      {
        timeout: limitMs,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
        shell: process.env.ComSpec || "cmd.exe",
      },
      (err, stdout, stderr) => {
        const output = `${stdout || ""}${stderr || ""}`;
        const tail =
          output
            .trim()
            .split(/\r?\n/)
            .filter(Boolean)
            .pop() || "";
        resolve({
          code: typeof err?.code === "number" ? err.code : err ? 1 : 0,
          result: tail || (err ? err.message : "OK"),
          output: output.slice(0, 500),
        });
      },
    );
  });
}

async function main() {
  console.log("=== Teste ping ===");
  console.log(await execBuffered("ping -n 2 -w 1000 8.8.8.8", 15000));
  console.log("=== Teste flushdns ===");
  console.log(await execBuffered("ipconfig /flushdns", 15000));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
