import { useElementWidth } from "@/hooks/useElementWidth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const compact = (n: number) =>
  Math.abs(n) >= 1000
    ? Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)
    : String(Math.round(n * 1000) / 1000);

export interface LinePoint {
  x: number;
  y: number;
}

/** Responsive SVG line/area chart with y gridlines and x end labels. */
export function LineChart({
  points,
  height = 180,
  formatX,
  formatY = compact,
  className,
}: {
  points: LinePoint[];
  height?: number;
  formatX?: (x: number) => string;
  formatY?: (y: number) => string;
  className?: string;
}) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const { t } = useI18n();
  const w = Math.max(width, 120);
  const pad = { l: 48, r: 12, t: 12, b: 22 };
  const innerW = Math.max(w - pad.l - pad.r, 10);
  const innerH = Math.max(height - pad.t - pad.b, 10);

  if (points.length === 0) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex h-32 items-center justify-center text-xs text-muted-foreground",
          className,
        )}
      >
        {t("No data")}
      </div>
    );
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const yspan = ymax - ymin || 1;

  const sx = (x: number) =>
    xmax === xmin ? pad.l + innerW / 2 : pad.l + ((x - xmin) / (xmax - xmin)) * innerW;
  const sy = (y: number) => pad.t + innerH - ((y - ymin) / yspan) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const area = `${line} L${sx(points[points.length - 1].x).toFixed(1)},${pad.t + innerH} L${sx(points[0].x).toFixed(1)},${pad.t + innerH} Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div ref={ref} className={cn("w-full", className)}>
      {width > 0 ? (
        <svg width={w} height={height} role="img">
          {ticks.map((t) => {
            const y = pad.t + innerH * t;
            const value = ymax - t * yspan;
            return (
              <g key={t}>
                <line
                  x1={pad.l}
                  x2={pad.l + innerW}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
                <text
                  x={pad.l - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize={9}
                  fill="var(--muted-foreground)"
                >
                  {formatY(value)}
                </text>
              </g>
            );
          })}

          <path d={area} fill="var(--chart-1)" opacity={0.12} />
          <path
            d={line}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {points.map((p, i) => (
            <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={1.8} fill="var(--chart-1)">
              <title>
                {(formatX ? formatX(p.x) : String(p.x)) + " · " + formatY(p.y)}
              </title>
            </circle>
          ))}

          <text x={pad.l} y={height - 6} fontSize={9} fill="var(--muted-foreground)">
            {formatX ? formatX(xmin) : String(xmin)}
          </text>
          {xmax !== xmin ? (
            <text
              x={pad.l + innerW}
              y={height - 6}
              textAnchor="end"
              fontSize={9}
              fill="var(--muted-foreground)"
            >
              {formatX ? formatX(xmax) : String(xmax)}
            </text>
          ) : null}
        </svg>
      ) : null}
    </div>
  );
}

/** Responsive horizontal bar chart. */
export function BarChart({
  bars,
  formatValue = compact,
  className,
  maxBars = 12,
}: {
  bars: { label: string; value: number }[];
  formatValue?: (v: number) => string;
  className?: string;
  maxBars?: number;
}) {
  const { t } = useI18n();
  const shown = bars.slice(0, maxBars);
  const max = Math.max(1, ...shown.map((b) => b.value));
  if (shown.length === 0) {
    return (
      <p className={cn("py-6 text-center text-xs text-muted-foreground", className)}>
        {t("No data")}
      </p>
    );
  }
  return (
    <div className={cn("space-y-1.5", className)}>
      {shown.map((b) => (
        <div key={b.label} className="flex items-center gap-2 text-[11px]">
          <span
            className="w-40 shrink-0 truncate font-mono text-muted-foreground"
            title={b.label}
          >
            {b.label}
          </span>
          <span className="relative h-3.5 flex-1 overflow-hidden rounded-sm bg-muted">
            <span
              className="absolute inset-y-0 left-0 rounded-sm bg-[var(--chart-1)]"
              style={{ width: `${Math.max(2, (b.value / max) * 100)}%` }}
            />
          </span>
          <span className="w-16 shrink-0 text-right font-mono">
            {formatValue(b.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
