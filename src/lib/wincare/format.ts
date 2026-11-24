/**
 * Números na interface seguem o pt-BR: vírgula decimal ("15,4 GB"), ponto de
 * milhar ("6.214 arquivos"). Use estas funções em vez de `toFixed`.
 */
export function formatDecimal(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Gigabytes com uma casa ("15,4"), sem a unidade. */
export const formatGb = (value: number) => formatDecimal(value, 1);

/** "1 programa" / "3 programas" — sem "programa(s)" na interface. */
export function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString("pt-BR")} ${count === 1 ? one : many}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "hoje", "há 3 dias", "há 5 meses", "há 2 anos" — para datas de arquivos e de uso. */
export function formatAge(timestamp: number, now = Date.now()) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "—";
  const days = Math.floor((now - timestamp) / DAY_MS);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `há ${plural(months, "mês", "meses")}`;
  const years = Math.floor(days / 365.25);
  return `há ${plural(years, "ano", "anos")}`;
}

/** Velocidade de rede: "850 KB/s", "12,4 MB/s". */
export function formatRate(bytesPerSecond: number | null | undefined) {
  if (bytesPerSecond === null || bytesPerSecond === undefined || !Number.isFinite(bytesPerSecond)) {
    return "—";
  }
  if (bytesPerSecond >= 1024 ** 2) return `${formatDecimal(bytesPerSecond / 1024 ** 2, 1)} MB/s`;
  if (bytesPerSecond >= 1024) return `${Math.round(bytesPerSecond / 1024)} KB/s`;
  return `${Math.round(bytesPerSecond)} B/s`;
}
