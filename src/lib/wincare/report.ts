import type { DiskDrive, DiskUsageFolder, RunRecord, StartupItem, SystemInfo } from "./types";

const LOCATION_LABEL: Record<string, string> = {
  "hkcu-run": "Usuário (Registro)",
  "hklm-run": "Sistema (Registro)",
  "startup-folder": "Pasta Inicializar",
};

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function buildDiagnosticReport(input: {
  system: SystemInfo;
  disks: DiskDrive[];
  startup: StartupItem[];
  diskUsage?: DiskUsageFolder[];
  runs?: RunRecord[];
}) {
  const { system, disks, startup, diskUsage = [], runs = [] } = input;
  const now = new Date().toLocaleString("pt-BR");
  const enabledStartup = startup.filter((s) => s.enabled);
  const lines: string[] = [
    "══════════════════════════════════════════",
    "  WinCare — Relatório de diagnóstico",
    `  Gerado em: ${now}`,
    "══════════════════════════════════════════",
    "",
    "▸ SISTEMA",
    `  Computador:     ${system.hostname}`,
    `  Sistema:        ${system.osName}`,
    `  Build:          ${system.build}`,
    `  Saúde geral:    ${system.health}%`,
    `  CPU:            ${system.cpuUsage}%`,
    `  Memória:        ${system.memoryUsage}% de ${system.memoryTotalGb} GB`,
    `  Disco (C:):     ${system.diskUsage}% usado (${system.diskTotalGb} GB)`,
    `  Tempo ligado:   ${system.uptime}`,
    `  Defender:       ${system.defenderStatus}`,
    `  Última update:  ${system.lastUpdate}`,
    `  Fonte:          ${system.simulated ? "Demonstração" : "Nativo"}`,
    "",
    "▸ DISCOS",
  ];

  if (disks.length === 0) {
    lines.push("  (nenhuma unidade listada)");
  } else {
    for (const d of disks) {
      const used = d.totalGb > 0 ? Math.round(((d.totalGb - d.freeGb) / d.totalGb) * 100) : 0;
      lines.push(
        `  ${d.letter} ${d.model} [${d.type}] — SMART ${d.smart}, ${d.freeGb} GB livres / ${d.totalGb} GB (${used}% usado)`,
      );
    }
  }

  lines.push("", "▸ ESPAÇO POR PASTA");
  if (diskUsage.length === 0) {
    lines.push("  (análise não executada)");
  } else {
    const sorted = [...diskUsage].sort((a, b) => b.sizeBytes - a.sizeBytes);
    for (const f of sorted) {
      lines.push(`  ${f.label}: ${formatBytes(f.sizeBytes)}${f.clearable ? " [limpável]" : ""}`);
    }
  }

  lines.push("", `▸ INICIALIZAÇÃO (${enabledStartup.length} ativos / ${startup.length} total)`);
  if (startup.length === 0) {
    lines.push("  (nenhum item)");
  } else {
    for (const s of startup) {
      const loc = LOCATION_LABEL[s.location] ?? s.location;
      lines.push(
        `  [${s.enabled ? "ATIVO" : "OFF "}] ${s.name} — ${loc}`,
        `           ${s.command}`,
      );
    }
  }

  lines.push("", "▸ HISTÓRICO RECENTE (WinCare)");
  const recent = runs.slice(0, 12);
  if (recent.length === 0) {
    lines.push("  (sem execuções registradas)");
  } else {
    for (const r of recent) {
      const when = new Date(r.startedAt).toLocaleString("pt-BR");
      lines.push(`  ${when} — ${r.toolName}: ${r.status}${r.result ? ` (${r.result})` : ""}`);
    }
  }

  lines.push(
    "",
    "▸ OBSERVAÇÕES",
    "  - Relatório gerado pelo WinCare para diagnóstico rápido.",
    "  - Não altera o sistema; apenas documenta o estado atual.",
    "  - Para suporte técnico, anexe este arquivo ao chamado.",
    "",
  );

  return lines.join("\n");
}

export async function downloadOrSaveReport(content: string, defaultName: string) {
  const { getNative } = await import("./bridge");
  const native = getNative();
  if (native?.saveTextFile) {
    return native.saveTextFile(content, defaultName);
  }

  // Modo demonstração (navegador): download via Blob.
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true as const, path: defaultName };
}
