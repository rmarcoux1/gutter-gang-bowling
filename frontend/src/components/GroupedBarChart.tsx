import { useMemo, useState } from "react";
import { CHART_CHROME } from "../lib/chartColors";

export interface BarSeries {
  name: string;
  color: string;
  values: number[];
}

interface GroupedBarChartProps {
  title: string;
  labels: string[];
  series: BarSeries[];
  height?: number;
}

const WIDTH = 640;
const PAD = { top: 20, right: 16, bottom: 32, left: 36 };
const BAR_GAP = 2; // surface gap between touching bars
const MAX_BAR_WIDTH = 24;

// A rect with only its top two corners rounded, square at the baseline — per
// the mark spec (bars grow from a single baseline; data-end is the rounded edge).
function roundedTopRectPath(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export default function GroupedBarChart({ title, labels, series, height = 260 }: GroupedBarChartProps) {
  const [hover, setHover] = useState<{ group: number; s: number } | null>(null);
  const [tableView, setTableView] = useState(false);

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const maxRaw = Math.max(1, ...series.flatMap((s) => s.values));
  const niceMax = Math.ceil(maxRaw * 1.2);

  const yFor = (v: number) => plotH - (v / niceMax) * plotH;

  const yTicks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => Math.round((niceMax * i) / count));
  }, [niceMax]);

  const groupWidth = labels.length ? plotW / labels.length : plotW;
  const barWidth = Math.min(MAX_BAR_WIDTH, (groupWidth - BAR_GAP * (series.length + 1)) / series.length);
  const groupContentWidth = barWidth * series.length + BAR_GAP * (series.length - 1);

  if (labels.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-card-header">
          <h3>{title}</h3>
        </div>
        <p className="empty-state">Not enough data yet — log a few matches to see this chart.</p>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <h3>{title}</h3>
        <button type="button" className="ghost-button" onClick={() => setTableView((v) => !v)}>
          {tableView ? "Show chart" : "Table view"}
        </button>
      </div>

      <div className="chart-legend">
        {series.map((s) => (
          <span className="chart-legend-item" key={s.name}>
            <span className="chart-legend-swatch" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>

      {tableView ? (
        <div className="table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th>Week</th>
                {series.map((s) => (
                  <th key={s.name}>{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, i) => (
                <tr key={label}>
                  <td>{label}</td>
                  {series.map((s) => (
                    <td key={s.name}>{s.values[i]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          aria-label={title}
          style={{ width: "100%", height: "auto", overflow: "visible" }}
        >
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {yTicks.map((t, i) => (
              <g key={i}>
                <line x1={0} x2={plotW} y1={yFor(t)} y2={yFor(t)} stroke={CHART_CHROME.gridline} strokeWidth={1} />
                <text x={-8} y={yFor(t)} dy={4} textAnchor="end" fontSize={11} fill={CHART_CHROME.mutedInk}>
                  {t}
                </text>
              </g>
            ))}
            <line x1={0} x2={plotW} y1={plotH} y2={plotH} stroke={CHART_CHROME.axis} strokeWidth={1} />

            {labels.map((label, gi) => {
              const groupStart = gi * groupWidth + (groupWidth - groupContentWidth) / 2;
              return (
                <g key={label}>
                  <text
                    x={gi * groupWidth + groupWidth / 2}
                    y={plotH + 20}
                    textAnchor="middle"
                    fontSize={11}
                    fill={CHART_CHROME.mutedInk}
                  >
                    {label}
                  </text>
                  {series.map((s, si) => {
                    const v = s.values[gi];
                    const barH = Math.max((v / niceMax) * plotH, 1);
                    const x = groupStart + si * (barWidth + BAR_GAP);
                    const isHover = hover?.group === gi && hover.s === si;
                    const r = Math.min(4, barH, barWidth / 2);
                    const barPath = roundedTopRectPath(x, plotH - barH, barWidth, barH, r);
                    return (
                      <g key={s.name}>
                        <path d={barPath} fill={s.color} opacity={isHover ? 0.85 : 1} />
                        <rect
                          x={x - 2}
                          y={0}
                          width={barWidth + 4}
                          height={plotH}
                          fill="transparent"
                          tabIndex={0}
                          onMouseEnter={() => setHover({ group: gi, s: si })}
                          onFocus={() => setHover({ group: gi, s: si })}
                          onMouseLeave={() => setHover(null)}
                          onBlur={() => setHover(null)}
                        />
                        {isHover && (
                          <foreignObject x={x - 40} y={plotH - barH - 34} width={100} height={28}>
                            <div className="chart-tooltip">
                              <div className="chart-tooltip-row">
                                <span className="chart-tooltip-value">{v}</span>
                                <span className="chart-tooltip-name">{s.name}</span>
                              </div>
                            </div>
                          </foreignObject>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}
