"use client";

/** Tiny inline SVG sparkline for a sequence of %B values. */
export function Sparkline({
  values,
  width = 130,
  height = 34,
  color = "#f3ba2f",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (!values || values.length < 2) {
    return <span className="text-binance-muted text-xs">—</span>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 3;

  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (width - pad * 2) + pad;
      const y = height - pad - ((v - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      className="inline-block align-middle"
      role="img"
      aria-label="Recent %B trend"
    >
      {/* baseline at the average level */}
      <line
        x1={pad}
        y1={height / 2}
        x2={width - pad}
        y2={height / 2}
        stroke="#3a4049"
        strokeWidth={0.5}
        strokeDasharray="2 2"
      />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* end dot */}
      {(() => {
        const lastX = width - pad;
        const lastY = height - pad - ((values[values.length - 1] - min) / range) * (height - pad * 2);
        return <circle cx={lastX} cy={lastY} r={2} fill={color} />;
      })()}
    </svg>
  );
}
