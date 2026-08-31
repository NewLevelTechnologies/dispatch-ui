// ─────────────────────────────────────────────────────────────────
// Sparkline.tsx — tiny line chart for inside KPI cards.
//
// Pure SVG, no external deps. Fixed pixel size by default. Color
// follows the accent or whatever you pass.
//
//   <Sparkline values={[6,8,7,11,9,12,14,13,15,18]} />
//   <Sparkline values={[...]} color="var(--success-500)" filled />
// ─────────────────────────────────────────────────────────────────

type Props = {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  filled?: boolean;
  className?: string;
};

export function Sparkline({
  values, width = 70, height = 28,
  color = 'var(--accent-500)', filled = false, className,
}: Props) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => [i * step, height - ((v - min) / range) * (height - 4) - 2] as const);
  const d = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
  const dFill = d + ` L${width},${height} L0,${height} Z`;
  return (
    <svg
      width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      {filled && <path d={dFill} fill={color} opacity={0.18} />}
      <path d={d} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" />
    </svg>
  );
}
