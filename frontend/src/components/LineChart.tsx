import { useId, useMemo, useState } from "react";
import { CHART_CHROME } from "../lib/chartColors";

export interface LineSeries {
  name: string;
  color: string;
  values: number[]; // one value per label, same length/order as `labels`
}

interface LineChartProps {
  title: string;
  labels: string[]; // x-axis categories, e.g. "Wk 1"
  series: LineSeries[];
  valueSuffix?: string;
  height?: number;
}

const WIDTH = 640;
const PAD = { top: 20, right: 20, bottom: 32, left: 40 };

export default function LineChart({ title, labels, series, valueSuffix = "", height = 260 }: LineChartProps) {
  const gid = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tableView, setTableView] = useState(false);

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const allValues = series.flatMap((s) => s.values);
  const maxRaw = allValues.length ? Math.max(...allValues) : 1;
  const minRaw = allValues.length ? Math.min(0, ...allValues) : 0;
  const niceMax = maxRaw <= 0 ? 1 : Math.ceil(maxRaw * 1.15);
  const niceMin = minRaw;

  const xFor = (i: number) => (labels.length <= 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
  const yFor = (v: number) => plotH - ((v - niceMin) / (niceMax - niceMin || 1)) * plotH;

  const yTicks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => niceMin + ((niceMax - niceMin) * i) / count);
  }, [niceMin, niceMax]);

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

      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span className="chart-legend-item" key={s.name}>
              <span className="chart-legend-swatch line" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}

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
                    <td key={s.name}>
                      {s.values[i]}
                      {valueSuffix}
                    </td>
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
                <line
                  x1={0}
                  x2={plotW}
                  y1={yFor(t)}
                  y2={yFor(t)}
                  stroke={CHART_CHROME.gridline}
                  strokeWidth={1}
                />
                <text x={-8} y={yFor(t)} dy={4} textAnchor="end" fontSize={11} fill={CHART_CHROME.mutedInk}>
                  {Math.round(t)}
                </text>
              </g>
            ))}

            <line x1={0} x2={plotW} y1={plotH} y2={plotH} stroke={CHART_CHROME.axis} strokeWidth={1} />

            {labels.map((label, i) => (
              <text
                key={label}
                x={xFor(i)}
                y={plotH + 20}
                textAnchor="middle"
                fontSize={11}
                fill={CHART_CHROME.mutedInk}
              >
                {label}
              </text>
            ))}

            {series.map((s) => {
              const path = s.values.map((v, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(v)}`).join(" ");
              const last = s.values.length - 1;
              return (
                <g key={s.name}>
                  <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  {s.values.map((v, i) => (
                    <circle
                      key={i}
                      cx={xFor(i)}
                      cy={yFor(v)}
                      r={4}
                      fill={s.color}
                      stroke={CHART_CHROME.surface}
                      strokeWidth={2}
                    />
                  ))}
                  <text
                    x={xFor(last) + 6}
                    y={yFor(s.values[last])}
                    dy={4}
                    fontSize={11}
                    fontWeight={700}
                    fill={CHART_CHROME.secondaryInk}
                  >
                    {s.values[last]}
                    {valueSuffix}
                  </text>
                </g>
              );
            })}

            {/* Hover layer: one invisible column per label, crosshair + tooltip */}
            {labels.map((_, i) => (
              <rect
                key={i}
                x={xFor(i) - plotW / labels.length / 2}
                y={0}
                width={plotW / labels.length}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onFocus={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onBlur={() => setHoverIdx(null)}
                tabIndex={0}
              />
            ))}

            {hoverIdx !== null && (
              <>
                <line
                  x1={xFor(hoverIdx)}
                  x2={xFor(hoverIdx)}
                  y1={0}
                  y2={plotH}
                  stroke={CHART_CHROME.axis}
                  strokeWidth={1}
                />
                <foreignObject
                  x={Math.min(Math.max(xFor(hoverIdx) - 70, 0), plotW - 140)}
                  y={-4}
                  width={140}
                  height={20 + series.length * 16}
                >
                  <div className="chart-tooltip" data-gid={gid}>
                    <div className="chart-tooltip-title">{labels[hoverIdx]}</div>
                    {series.map((s) => (
                      <div className="chart-tooltip-row" key={s.name}>
                        <span className="chart-legend-swatch line" style={{ background: s.color }} />
                        <span className="chart-tooltip-value">{s.values[hoverIdx]}{valueSuffix}</span>
                        <span className="chart-tooltip-name">{s.name}</span>
                      </div>
                    ))}
                  </div>
                </foreignObject>
              </>
            )}
          </g>
        </svg>
      )}
    </div>
  );
}
