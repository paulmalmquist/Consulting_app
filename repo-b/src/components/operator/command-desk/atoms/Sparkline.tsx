type SparklineProps = {
  points: number[];
  color?: string;
  fill?: boolean;
  height?: number;
  strokeWidth?: number;
};

export function Sparkline({
  points,
  color = "var(--neon-cyan)",
  fill = true,
  height = 32,
  strokeWidth = 1.2,
}: SparklineProps) {
  if (!points || points.length < 2) {
    return <svg width="100%" height={height} viewBox={`0 0 200 ${height}`} />;
  }
  const w = 200;
  const h = height;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map(
    (v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`,
  );
  // Build a safe gradient id. Some callers pass `var(--neon-cyan)`; strip punctuation.
  const gid = `cd-spark-${color.replace(/[^a-z0-9]/gi, "")}-${height}-${points.length}`;
  const last = points[points.length - 1];
  const lastY = h - ((last - min) / range) * (h - 4) - 2;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && (
        <polygon fill={`url(#${gid})`} points={`${coords.join(" ")} ${w},${h} 0,${h}`} />
      )}
      <polyline fill="none" stroke={color} strokeWidth={strokeWidth} points={coords.join(" ")} />
      <circle cx={w} cy={lastY} r="2" fill={color} />
    </svg>
  );
}
