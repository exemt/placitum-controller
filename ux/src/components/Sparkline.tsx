import { memo, useId } from "react";

/** Мини-график последних точек. Шкала от нуля, чтобы простой был внизу. */

export const Sparkline = memo(function Sparkline({
  values,
  color,
}: {
  values: number[];
  color: string;
}) {
  const gid = useId().replace(/:/g, "");
  const w = 120;
  const h = 36;
  const pad = 2;

  if (values.length === 0) {
    return (
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" />
    );
  }

  const max = Math.max(...values, 0);
  const last = values.length - 1;
  const points = values.map((value, i) => {
    const x = last === 0 ? w / 2 : (i / last) * w;
    const y =
      max <= 0
        ? h - pad
        : h - pad - (value / max) * (h - pad * 2);
    return { x, y };
  });
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const tip = points[last];

  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={tip.x} cy={tip.y} r="2" fill={color} />
    </svg>
  );
}, sameSparkline);

function sameSparkline(
  prev: { values: number[]; color: string },
  next: { values: number[]; color: string },
): boolean {
  if (prev.color !== next.color || prev.values.length !== next.values.length) {
    return false;
  }
  return prev.values.every((value, i) => value === next.values[i]);
}
