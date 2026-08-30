import { useState } from "react";
import { CHART_CHROME, CHART_COLORS } from "../lib/chartColors";

export interface RankingItem {
  label: string;
  value: number;
}

interface RankingBarChartProps {
  title: string;
  items: RankingItem[];
  valueSuffix?: string;
  valuePrefix?: string;
}

const WIDTH = 640;
const ROW_H = 34;
const BAR_H = 20; // <= 24px per mark spec
const LEFT_LABEL_W = 120;
const PAD = { top: 10, right: 48, bottom: 10 };

export default function RankingBarChart({ title, items, valueSuffix = "", valuePrefix = "" }: RankingBarChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tableView, setTableView] = useState(false);

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const maxVal = Math.max(1, ...sorted.map((i) => i.value));
  const plotW = WIDTH - LEFT_LABEL_W - PAD.right;
  const height = PAD.top + PAD.bottom + sorted.length * ROW_H;

  if (sorted.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-card-header">
          <h3>{title}</h3>
        </div>
        <p className="empty-state">No players with logged results yet.</p>
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

      {tableView ? (
        <div className="table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, i) => (
                <tr key={item.label}>
                  <td>{i + 1}</td>
                  <td>{item.label}</td>
                  <td>
                    {valuePrefix}
                    {item.value}
                    {valueSuffix}
                  </td>
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
          {sorted.map((item, i) => {
            const y = PAD.top + i * ROW_H;
            const barW = (item.value / maxVal) * plotW;
            const isHover = hoverIdx === i;
            return (
              <g key={item.label}>
                <text
                  x={LEFT_LABEL_W - 12}
                  y={y + BAR_H / 2}
                  dy={4}
                  textAnchor="end"
                  fontSize={12}
                  fontWeight={600}
                  fill={CHART_CHROME.primaryInk}
                >
                  {item.label}
                </text>
                <rect
                  x={LEFT_LABEL_W}
                  y={y}
                  width={plotW}
                  height={BAR_H}
                  fill={CHART_CHROME.gridline}
                  rx={4}
                  ry={4}
                />
                <rect
                  x={LEFT_LABEL_W}
                  y={y}
                  width={Math.max(barW, 4)}
                  height={BAR_H}
                  fill={CHART_COLORS.blue}
                  opacity={isHover ? 0.85 : 1}
                  rx={4}
                  ry={4}
                />
                <text
                  x={LEFT_LABEL_W + barW + 8}
                  y={y + BAR_H / 2}
                  dy={4}
                  fontSize={12}
                  fontWeight={700}
                  fill={CHART_CHROME.secondaryInk}
                >
                  {valuePrefix}
                  {item.value}
                  {valueSuffix}
                </text>
                <rect
                  x={LEFT_LABEL_W}
                  y={y}
                  width={plotW}
                  height={ROW_H}
                  fill="transparent"
                  tabIndex={0}
                  onMouseEnter={() => setHoverIdx(i)}
                  onFocus={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  onBlur={() => setHoverIdx(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
