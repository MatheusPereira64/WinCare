import { TOOLS, resolveCommand } from "./tools";
import type { Tool } from "./types";

export const NETWORK_TOOLS: Tool[] = TOOLS.filter((t) => t.category === "network");

export type NetworkToolId =
  | "flushdns"
  | "renew-ip"
  | "winsock"
  | "tcpip"
  | "ping"
  | "tracert"
  | "nslookup"
  | "speedtest";

const HOST_PATTERN = /^[a-zA-Z0-9.\-_]+$/;

/** Valida host/domínio informado pelo usuário antes de enviar ao processo nativo. */
export function sanitizeNetworkTarget(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !HOST_PATTERN.test(trimmed)) {
    throw new Error("Destino inválido. Use apenas letras, números, pontos e hífens.");
  }
  return trimmed;
}

export function getNetworkTool(id: string) {
  return NETWORK_TOOLS.find((t) => t.id === id);
}

/** Comando legível para logs (modo demo e histórico). */
export function describeNetworkCommand(tool: Tool, target?: string): string {
  try {
    if (tool.input && target?.trim()) {
      return resolveCommand(tool, sanitizeNetworkTarget(target));
    }
  } catch {
    /* fallback */
  }
  return resolveCommand(tool, target);
}
