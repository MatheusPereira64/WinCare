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
