import React from 'react';
import cloud from 'd3-cloud';

export type CloudWord = { text: string; value: number };

type Positioned = {
  text: string;
  value: number;
  x: number;
  y: number;
  rotate: number;
  size: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mapRange(value: number, vmin: number, vmax: number, omin: number, omax: number) {
  if (!Number.isFinite(value)) return omin;
  if (!Number.isFinite(vmin) || !Number.isFinite(vmax) || vmax <= vmin) return (omin + omax) / 2;
  const t = clamp((value - vmin) / (vmax - vmin), 0, 1);
  return lerp(omin, omax, t);
}

function useMeasureWidth() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number>(0);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const ent of entries) {
        const w = ent.contentRect.width;
        if (w && Math.abs(w - width) > 1) setWidth(w);
      }
    });

    ro.observe(el);
    setWidth(el.getBoundingClientRect().width || 0);

    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, width };
}

export function WordCloud({
  words,
  height = 420,
  onWordClick,
}: {
  words: CloudWord[];
  height?: number;
  onWordClick?: (text: string) => void;
}) {
  const { ref, width } = useMeasureWidth();
  const [layoutWords, setLayoutWords] = React.useState<Positioned[]>([]);

  React.useEffect(() => {
    if (!width || words.length === 0) {
      setLayoutWords([]);
      return;
    }

    const sorted = [...words].filter((w) => w.text).sort((a, b) => b.value - a.value);
    const vmax = sorted[0]?.value ?? 1;
    const vmin = sorted[sorted.length - 1]?.value ?? 0;

    // NOTE: d3-cloud often lacks complete TypeScript typings.
    // We keep the runtime usage the same, but explicitly type callback params
    // to avoid TS "implicit any" errors under strict/noImplicitAny.
    const job = (cloud as any)()
      .size([Math.floor(width), Math.floor(height)])
      .words(sorted)
      .padding(2)
      .rotate(() => (Math.random() < 0.12 ? 90 : 0))
      .font('sans-serif')
      .fontSize((d: CloudWord) => mapRange(d.value, vmin, vmax, 12, 64))
      .on('end', (out: any[]) => {
        const positioned: Positioned[] = out.map((d) => ({
          text: d.text,
          value: d.value,
          x: d.x,
          y: d.y,
          rotate: d.rotate,
          size: d.size,
        }));
        setLayoutWords(positioned);
      });

    job.start();
    return () => {
      try {
        job.stop();
      } catch {
        // ignore
      }
    };
  }, [words, width, height]);

  return (
    <div ref={ref} style={{ width: '100%', height }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(1, Math.floor(width))} ${height}`}>
        <g transform={`translate(${Math.floor(width / 2)}, ${Math.floor(height / 2)})`}>
          {layoutWords.map((w) => (
            <text
              key={w.text}
              textAnchor="middle"
              transform={`translate(${w.x},${w.y}) rotate(${w.rotate})`}
              style={{ fontSize: w.size, cursor: onWordClick ? 'pointer' : 'default' }}
              opacity={0.85}
              onClick={() => onWordClick?.(w.text)}
            >
              {w.text}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
