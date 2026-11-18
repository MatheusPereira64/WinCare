/**
 * Mini gráfico de linha. Com `label`, vira uma imagem com resumo em texto
 * (mín., máx. e valor atual) para o Narrador; sem ele, é decorativo.
 */
export function Sparkline({
  values,
  className = "",
  label,
  suffix = "%",
}: {
  values: number[];
  className?: string;
  label?: string;
  suffix?: string;
}) {
  if (values.length < 2) {
    return <div className={`h-12 ${className}`} aria-hidden />;
  }
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = 100 - ((v - min) / span) * 100;
    return `${x},${y}`;
  });
  const summary = label
    ? `${label}: de ${Math.min(...values)}${suffix} a ${Math.max(...values)}${suffix}, agora ${values[values.length - 1]}${suffix}`
    : undefined;
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={`h-12 w-full ${className}`}
      {...(summary ? { role: "img", "aria-label": summary } : { "aria-hidden": true })}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        points={pts.join(" ")}
      />
    </svg>
  );
}
