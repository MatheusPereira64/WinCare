/** Helpers de destino para ferramentas de rede (host/domínio). */

const HOST_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.\-_]*$/;

export function sanitizeNetworkTarget(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Informe um destino (ex.: 8.8.8.8 ou google.com).");
  }
  if (trimmed.length > 253) {
    throw new Error("Destino muito longo.");
  }
  if (!HOST_PATTERN.test(trimmed)) {
    throw new Error("Destino inválido. Use apenas letras, números, pontos e hífens.");
  }
  return trimmed;
}

export const NETWORK_PRESETS = [
  { label: "Google DNS", host: "8.8.8.8" },
  { label: "Cloudflare", host: "1.1.1.1" },
  { label: "google.com", host: "google.com" },
  { label: "cloudflare.com", host: "cloudflare.com" },
] as const;
