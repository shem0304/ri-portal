import React from 'react';
import * as d3 from 'd3';

export type HeatCell = { row: string; col: string; value: number };

export function Heatmap({
  rows,
  cols,
  cells,
  height = 520,
}: {
  rows: string[];
  cols: string[];
  cells: HeatCell[];
  height?: number;
}) {
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = e.contentRect.width;
        if (w && Math.abs(w - width) > 1) setWidth(w);
      }
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width || 0);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const svg = React.useMemo(() => {
    const padLeft = 120;
    const padTop = 80;
    const padRight = 16;
    const padBottom = 16;

    const colCount = Math.max(1, cols.length);
    const rowCount = Math.max(1, rows.length);

    const cellW = Math.max(16, Math.floor((Math.max(520, width) - padLeft - padRight) / colCount));
    const cellH = Math.max(20, Math.floor((height - padTop - padBottom) / rowCount));

    const totalW = padLeft + padRight + cellW * colCount;
    const totalH = padTop + padBottom + cellH * rowCount;

    const maxV = d3.max(cells, (d) => d.value) || 0;
    const color = d3.scaleLinear<string>().domain([0, maxV || 1]).range(['transparent', 'currentColor']);

    const cellMap = new Map<string, number>();
    for (const c of cells) cellMap.set(`${c.row}||${c.col}`, c.value);

    return { padLeft, padTop, cellW, cellH, totalW, totalH, color, cellMap };
  }, [cells, cols.length, rows.length, height, width]);

  return (
    <div ref={wrapRef} style={{ width: '100%', height, overflow: 'auto' }}>
      <svg width={svg.totalW} height={svg.totalH}>
        {/* column labels */}
        {cols.map((c, j) => (
          <g key={c} transform={`translate(${svg.padLeft + j * svg.cellW}, ${svg.padTop - 8})`}>
            <text
              transform={`rotate(-45)`}
              fontSize={12}
              opacity={0.85}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {c}
            </text>
          </g>
        ))}

        {/* row labels */}
        {rows.map((r, i) => (
          <text
            key={r}
            x={svg.padLeft - 10}
            y={svg.padTop + i * svg.cellH + svg.cellH / 2}
            fontSize={12}
            opacity={0.85}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {r}
          </text>
        ))}

        {/* cells */}
        {rows.flatMap((r, i) =>
          cols.map((c, j) => {
            const v = svg.cellMap.get(`${r}||${c}`) || 0;
            return (
              <g key={`${r}||${c}`}>
                <rect
                  x={svg.padLeft + j * svg.cellW}
                  y={svg.padTop + i * svg.cellH}
                  width={svg.cellW - 2}
                  height={svg.cellH - 2}
                  fill={svg.color(v)}
                  opacity={v === 0 ? 0.05 : 0.35 + 0.6 * (v / Math.max(1, d3.max(cells, (d) => d.value) || 1))}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                {v > 0 ? (
                  <text
                    x={svg.padLeft + j * svg.cellW + (svg.cellW - 2) / 2}
                    y={svg.padTop + i * svg.cellH + (svg.cellH - 2) / 2}
                    fontSize={11}
                    opacity={0.85}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {Math.round(v)}
                  </text>
                ) : null}
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}
