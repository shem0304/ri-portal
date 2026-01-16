import React from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

import { getReports, Report, isStaticMode } from '../api/client';
import { useToast } from '../components/Toast';
import { WordCloud } from '../components/trends/WordCloud';
import { CoocNetwork, CoocLink, CoocNode } from '../components/trends/CoocNetwork';
import { Heatmap, HeatCell } from '../components/trends/Heatmap';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

function yearOf(r: Report) {
  return typeof r.year === 'number' && Number.isFinite(r.year) ? r.year : null;
}

function norm(s?: string | null) {
  return (s || '').toString().trim();
}

// ---- Tokenization (가벼운 트렌드용) ----
const STOP = new Set([
  '및',
  '위한',
  '대한',
  '관한',
  '따른',
  '통한',
  '관련',
  '현황',
  '사례',
  '비교',
  '검토',
  '평가',
  '조사',
  '분석',
  '연구',
  '방안',
  '계획',
  '전략',
  '기본',
  '추진',
  '활용',
  '개선',
  '대응',
  '정책',
]);

function isEnglishOnlyToken(tok: string) {
  return /^[A-Za-z]+$/.test(tok);
}

function tokenize(title: string) {
  const cleaned = (title || '')
    .toString()
    .trim()
    .replace(/[^0-9A-Za-z가-힣\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [] as string[];

  const toks = cleaned.split(' ');
  const out: string[] = [];

  for (const raw of toks) {
    if (!raw) continue;
    if (/^\d+$/.test(raw)) continue;
    if (isEnglishOnlyToken(raw)) continue;

    const w = raw.toLowerCase();
    if (w.length < 2) continue;
    if (STOP.has(w)) continue;

    out.push(w);
  }

  return out;
}

function bigrams(tokens: string[]) {
  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]} ${tokens[i + 1]}`);
  return out;
}

// ---- Theme dictionary (간단 분류; 필요 시 추가 확장) ----
const THEMES: { key: string; terms: string[] }[] = [
  { key: '인구·청년·고령화', terms: ['인구', '저출산', '저출생', '청년', '고령', '고령화', '노인', '이주', '정주'] },
  { key: '탄소·에너지·기후', terms: ['탄소', '탄소중립', '기후', '재생에너지', '에너지', '온실가스', '녹색'] },
  { key: '교통·도시·공간', terms: ['교통', '대중교통', '모빌리티', '도시', '도시재생', '공간', '주거', '토지'] },
  { key: '산업·경제·일자리', terms: ['산업', '경제', '일자리', '고용', '기업', '상권', '관광', '투자'] },
  { key: '복지·보건·돌봄', terms: ['복지', '보건', '의료', '돌봄', '건강', '취약', '장애', '보육'] },
  { key: '디지털·데이터·AI', terms: ['디지털', '데이터', 'ai', '인공지능', '스마트', '플랫폼', '빅데이터'] },
];

function classifyTheme(tokens: string[]) {
  const joined = tokens.join(' ');
  let best = { key: '기타', score: 0 };
  for (const t of THEMES) {
    let s = 0;
    for (const term of t.terms) {
      if (joined.includes(term.toLowerCase())) s += 1;
    }
    if (s > best.score) best = { key: t.key, score: s };
  }
  return best.key;
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function toCSV(rows: any[]) {
  const esc = (v: any) => {
    const s = (v ?? '').toString().replace(/\r?\n/g, ' ');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(','));
  return lines.join('\n');
}

function downloadText(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function TrendsPage() {
  const toast = useToast();
  const STATIC = isStaticMode();
  const [reports, setReports] = React.useState<Report[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Filters
  const [q, setQ] = React.useState('');
  const [inst, setInst] = React.useState('ALL');
  const [yearFrom, setYearFrom] = React.useState<number | 'ALL'>('ALL');
  const [yearTo, setYearTo] = React.useState<number | 'ALL'>('ALL');
  const [cloudTopN, setCloudTopN] = React.useState(50);

  // Interaction
  const [focus, setFocus] = React.useState<{ kind: 'keyword' | 'bigram'; value: string } | null>(null);

  React.useEffect(() => {
    let mounted = true;
    getReports()
      .then((r) => {
        if (!mounted) return;
        setReports(r || []);
      })
      .catch((e: any) => {
        if (e?.code === 401) {
          toast.show('로그인 후 이용 가능합니다.');
          if (!STATIC) {
            window.location.href = `./login.php?return=${encodeURIComponent('/react/trends')}`;
          }
          return;
        }
        toast.show('트렌드 데이터를 불러오지 못했습니다.');
        console.error(e);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [toast]);

  const yearsAll = React.useMemo(() => {
    const ys = uniq(reports.map(yearOf).filter((y): y is number => y != null)).sort((a, b) => a - b);
    return ys;
  }, [reports]);

  // Init year filters once data comes
  React.useEffect(() => {
    if (yearsAll.length === 0) return;
    setYearFrom((prev) => (prev === 'ALL' ? yearsAll[0] : prev));
    setYearTo((prev) => (prev === 'ALL' ? yearsAll[yearsAll.length - 1] : prev));
  }, [yearsAll]);

  const institutesAll = React.useMemo(() => {
    const ins = uniq(reports.map((r) => norm(r.institute)).filter(Boolean)).sort((a, b) => a.localeCompare(b));
    return ins;
  }, [reports]);

  const filtered = React.useMemo(() => {
    const ql = q.trim().toLowerCase();
    const yf = yearFrom === 'ALL' ? null : yearFrom;
    const yt = yearTo === 'ALL' ? null : yearTo;

    return reports.filter((r) => {
      const y = yearOf(r);
      if (yf != null && y != null && y < yf) return false;
      if (yt != null && y != null && y > yt) return false;
      if (inst !== 'ALL' && norm(r.institute) !== inst) return false;
      if (ql) {
        const t = (r.title || '').toLowerCase();
        if (!t.includes(ql)) return false;
      }
      return true;
    });
  }, [reports, q, inst, yearFrom, yearTo]);

  const analytics = React.useMemo(() => {
    const rows = filtered;
    const ys = rows.map(yearOf).filter((y): y is number => y != null);
    const minY = ys.length ? Math.min(...ys) : null;
    const maxY = ys.length ? Math.max(...ys) : null;

    const byYear = new Map<number, Report[]>();
    const byInst = new Map<string, Report[]>();
    const kw = new Map<string, number>();
    const bg = new Map<string, number>();
    const theme = new Map<string, number>();

    for (const r of rows) {
      const y = yearOf(r);
      if (y != null) {
        const a = byYear.get(y) || [];
        a.push(r);
        byYear.set(y, a);
      }

      const ins = norm(r.institute) || '(미상)';
      const bi = byInst.get(ins) || [];
      bi.push(r);
      byInst.set(ins, bi);

      const toks = tokenize(r.title);
      for (const t of toks) kw.set(t, (kw.get(t) || 0) + 1);
      for (const b of bigrams(toks)) bg.set(b, (bg.get(b) || 0) + 1);

      const th = classifyTheme(toks);
      theme.set(th, (theme.get(th) || 0) + 1);
    }

    const years = Array.from(byYear.keys()).sort((a, b) => a - b);
    const yearCounts = years.map((y) => byYear.get(y)?.length || 0);

    const instPairs = Array.from(byInst.entries()).sort((a, b) => (b[1].length || 0) - (a[1].length || 0));

    const topKeywords = Array.from(kw.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([k, v]) => ({ k, v }));

    const topBigrams = Array.from(bg.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([k, v]) => ({ k, v }));

    const topThemes = Array.from(theme.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, v]) => ({ k, v }));

    const topTheme = topThemes[0]?.k || '-';
    const topThemeCount = topThemes[0]?.v || 0;

    const topKeyword = topKeywords[0]?.k || '-';
    const topKeywordCount = topKeywords[0]?.v || 0;

    // keyword trend per year (top 5)
    const top5 = topKeywords.slice(0, 5).map((x) => x.k);
    const trendSeries = top5.map((key) => {
      const data = years.map((y) => {
        const list = byYear.get(y) || [];
        if (list.length === 0) return 0;
        let c = 0;
        for (const r of list) {
          const toks = tokenize(r.title);
          for (const t of toks) if (t === key) c += 1;
        }
        return (c / list.length) * 100; // 100건당
      });
      return { key, data };
    });

    // rising keywords: compare last window vs prev window
    const rise = (() => {
      if (years.length < 2) return [] as { k: string; delta: number; prev: number; recent: number; yearLabel: string }[];
      const last = years[years.length - 1];
      const prev = years.length >= 4 ? years[years.length - 3] : years[years.length - 2];

      const recentYears = years.length >= 4 ? [years[years.length - 1], years[years.length - 2]] : [years[years.length - 1]];
      const prevYears = years.length >= 4 ? [years[years.length - 3], years[years.length - 4]] : [years[years.length - 2]];

      const countInYears = (ys2: number[], key: string) => {
        let docs = 0;
        let hits = 0;
        for (const y of ys2) {
          const list = byYear.get(y) || [];
          docs += list.length;
          for (const r of list) {
            const toks = tokenize(r.title);
            for (const t of toks) if (t === key) hits += 1;
          }
        }
        if (docs === 0) return 0;
        return (hits / docs) * 100;
      };

      const items = Array.from(kw.keys()).map((k) => {
        const r1 = countInYears(recentYears, k);
        const r0 = countInYears(prevYears, k);
        return {
          k,
          delta: r1 - r0,
          prev: r0,
          recent: r1,
          yearLabel:
            years.length >= 4
              ? `${prevYears[1]}-${prevYears[0]} → ${recentYears[1]}-${recentYears[0]}`
              : `${prev} → ${last}`,
        };
      });

      return items
        .filter((x) => x.delta > 0.01)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 20);
    })();

    // burst: max jump between consecutive years (100건당)
    const burst = (() => {
      if (years.length < 2) return [] as any[];
      const keyPool = Array.from(kw.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 120)
        .map(([k]) => k);

      const perYearRate = (y: number, key: string) => {
        const list = byYear.get(y) || [];
        if (list.length === 0) return 0;
        let hits = 0;
        for (const r of list) {
          const toks = tokenize(r.title);
          for (const t of toks) if (t === key) hits += 1;
        }
        return (hits / list.length) * 100;
      };

      const items = keyPool.map((k) => {
        let best = { year: years[1], delta: -1e9, prev: 0, recent: 0 };
        for (let i = 1; i < years.length; i++) {
          const y = years[i];
          const y0 = years[i - 1];
          const r0 = perYearRate(y0, k);
          const r1 = perYearRate(y, k);
          const d = r1 - r0;
          if (d > best.delta) best = { year: y, delta: d, prev: r0, recent: r1 };
        }
        return { k, ...best };
      });

      return items
        .filter((x) => x.delta > 0.01)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 20);
    })();

    // co-occurrence network (top 30)
    const cooc = (() => {
      const vocab = new Set(topKeywords.slice(0, 30).map((x) => x.k));
      if (vocab.size < 5) return { nodes: [] as CoocNode[], links: [] as CoocLink[] };

      const nodeCount = new Map<string, number>();
      const pairCount = new Map<string, number>();

      for (const r of rows) {
        const toks = uniq(tokenize(r.title).filter((t) => vocab.has(t)));
        for (const t of toks) nodeCount.set(t, (nodeCount.get(t) || 0) + 1);
        for (let i = 0; i < toks.length; i++) {
          for (let j = i + 1; j < toks.length; j++) {
            const a = toks[i];
            const b = toks[j];
            const key = a < b ? `${a}||${b}` : `${b}||${a}`;
            pairCount.set(key, (pairCount.get(key) || 0) + 1);
          }
        }
      }

      const nodes: CoocNode[] = Array.from(nodeCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([id, size]) => ({ id, size }));

      const nodeSet = new Set(nodes.map((n) => n.id));

      const links: CoocLink[] = Array.from(pairCount.entries())
        .map(([k, w]) => {
          const [a, b] = k.split('||');
          return { source: a, target: b, weight: w };
        })
        .filter((l) => nodeSet.has(l.source) && nodeSet.has(l.target) && l.weight >= 2)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 80);

      return { nodes, links };
    })();

    // institute keyword heatmap (Top 10 institutes x Top 15 keywords)
    const heat = (() => {
      const topInst = instPairs.slice(0, 10).map(([name]) => name);
      const topKw = topKeywords.slice(0, 15).map((x) => x.k);
      const cells: HeatCell[] = [];

      for (const iName of topInst) {
        const list = byInst.get(iName) || [];
        const denom = Math.max(1, list.length);
        const counts = new Map<string, number>();
        for (const r of list) {
          for (const t of tokenize(r.title)) {
            if (topKw.includes(t)) counts.set(t, (counts.get(t) || 0) + 1);
          }
        }
        for (const k of topKw) {
          cells.push({ row: iName, col: k, value: (counts.get(k) || 0) / denom * 100 });
        }
      }

      return { rows: topInst, cols: topKw, cells };
    })();

    return {
      minY,
      maxY,
      years,
      yearCounts,
      instPairs,
      topKeywords,
      topBigrams,
      topThemes,
      topTheme,
      topThemeCount,
      topKeyword,
      topKeywordCount,
      trendSeries,
      rise,
      burst,
      cooc,
      heat,
    };
  }, [filtered]);

  const focusTitles = React.useMemo(() => {
    if (!focus) return [] as Report[];
    const needle = focus.value.toLowerCase();
    return filtered
      .filter((r) => {
        const toks = tokenize(r.title);
        if (focus.kind === 'keyword') return toks.includes(needle);
        return bigrams(toks).includes(needle);
      })
      .slice(0, 80);
  }, [focus, filtered]);

  // ---- Chart configs ----
  const kwBar = React.useMemo(() => {
    const items = analytics.topKeywords.slice(0, 12);
    return {
      data: {
        labels: items.map((x) => x.k),
        datasets: [{ label: '빈도', data: items.map((x) => x.v) }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        onClick: (_: any, elements: any[]) => {
          const idx = elements?.[0]?.index;
          if (typeof idx === 'number') setFocus({ kind: 'keyword', value: items[idx].k });
        },
      } as any,
    };
  }, [analytics.topKeywords]);

  const bgBar = React.useMemo(() => {
    const items = analytics.topBigrams.slice(0, 12);
    return {
      data: {
        labels: items.map((x) => x.k),
        datasets: [{ label: '빈도', data: items.map((x) => x.v) }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        onClick: (_: any, elements: any[]) => {
          const idx = elements?.[0]?.index;
          if (typeof idx === 'number') setFocus({ kind: 'bigram', value: items[idx].k });
        },
      } as any,
    };
  }, [analytics.topBigrams]);

  const themeDoughnut = React.useMemo(() => {
    const items = analytics.topThemes;
    return {
      data: {
        labels: items.map((x) => x.k),
        datasets: [{ data: items.map((x) => x.v) }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
      } as any,
    };
  }, [analytics.topThemes]);

  const keywordTrendLine = React.useMemo(() => {
    const labels = analytics.years.map(String);
    return {
      data: {
        labels,
        datasets: analytics.trendSeries.map((s) => ({
          label: s.key,
          data: s.data.map((x) => Math.round(x * 10) / 10),
          fill: false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { title: { display: true, text: '100건당' } } },
      } as any,
    };
  }, [analytics.years, analytics.trendSeries]);

  const volLine = React.useMemo(() => {
    return {
      data: {
        labels: analytics.years.map(String),
        datasets: [{ label: '보고서 수', data: analytics.yearCounts, fill: true }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      } as any,
    };
  }, [analytics.years, analytics.yearCounts]);

  const instBar = React.useMemo(() => {
    const items = analytics.instPairs.slice(0, 15);
    return {
      data: {
        labels: items.map((x) => x[0]),
        datasets: [{ label: '보고서 수', data: items.map((x) => x[1].length) }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        indexAxis: 'y' as const,
      } as any,
    };
  }, [analytics.instPairs]);

  const riseBar = React.useMemo(() => {
    const items = analytics.rise;
    return {
      data: {
        labels: items.map((x) => x.k),
        datasets: [{ label: '증가(100건당)', data: items.map((x) => Math.round(x.delta * 10) / 10) }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        onClick: (_: any, elements: any[]) => {
          const idx = elements?.[0]?.index;
          if (typeof idx === 'number') setFocus({ kind: 'keyword', value: items[idx].k });
        },
      } as any,
    };
  }, [analytics.rise]);

  const burstBar = React.useMemo(() => {
    const items = analytics.burst;
    return {
      data: {
        labels: items.map((x) => x.k),
        datasets: [{ label: '급증(100건당)', data: items.map((x) => Math.round(x.delta * 10) / 10) }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        onClick: (_: any, elements: any[]) => {
          const idx = elements?.[0]?.index;
          if (typeof idx === 'number') setFocus({ kind: 'keyword', value: items[idx].k });
        },
      } as any,
    };
  }, [analytics.burst]);

  const cloudWords = React.useMemo(() => {
    const items = analytics.topKeywords.slice(0, Math.max(10, Math.min(200, cloudTopN)));
    return items.map((x) => ({ text: x.k, value: x.v }));
  }, [analytics.topKeywords, cloudTopN]);

  const reset = () => {
    setQ('');
    setInst('ALL');
    if (yearsAll.length) {
      setYearFrom(yearsAll[0]);
      setYearTo(yearsAll[yearsAll.length - 1]);
    } else {
      setYearFrom('ALL');
      setYearTo('ALL');
    }
    setFocus(null);
  };

  const exportFiltered = () => {
    const rows = filtered.map((r) => ({
      year: yearOf(r) ?? '',
      title: r.title ?? '',
      authors: r.authors ?? '',
      institute: r.institute ?? '',
      url: r.url ?? '',
    }));
    const csv = toCSV(rows);
    downloadText('reports_filtered.csv', csv, 'text/csv;charset=utf-8');
  };

  return (
    <div>
      <div className="page-title">연구 트렌드</div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '1 1 280px' }}>
            <label>제목 필터(포함 검색)</label>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 청년, 탄소, 교통…" />
          </div>
          <div className="field" style={{ minWidth: 200 }}>
            <label>기관</label>
            <select className="select" value={inst} onChange={(e) => setInst(e.target.value)}>
              <option value="ALL">전체</option>
              {institutesAll.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 140 }}>
            <label>연도(시작)</label>
            <select
              className="select"
              value={yearFrom === 'ALL' ? 'ALL' : String(yearFrom)}
              onChange={(e) => setYearFrom(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
            >
              {yearsAll.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 140 }}>
            <label>연도(끝)</label>
            <select
              className="select"
              value={yearTo === 'ALL' ? 'ALL' : String(yearTo)}
              onChange={(e) => setYearTo(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
            >
              {yearsAll.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="mini-actions">
            <button className="button" type="button" onClick={reset}>
              초기화
            </button>
            <button className="button primary" type="button" onClick={exportFiltered}>
              내보내기
            </button>
          </div>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          {loading ? '불러오는 중…' : `현재 조건에서 ${filtered.length.toLocaleString()}건 분석`}
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <div className="kpi">
          <div className="label">필터 결과</div>
          <div className="value">{loading ? '…' : filtered.length.toLocaleString()}</div>
          <div className="label" style={{ marginTop: 6 }}>
            {analytics.minY && analytics.maxY ? `${analytics.minY} - ${analytics.maxY}` : '-'}
          </div>
        </div>
        <div className="kpi">
          <div className="label">상위 키워드</div>
          <div className="value">{analytics.topKeyword}</div>
          <div className="label" style={{ marginTop: 6 }}>
            {analytics.topKeywordCount ? `${analytics.topKeywordCount.toLocaleString()}회` : '-'}
          </div>
        </div>
        <div className="kpi">
          <div className="label">상위 주제</div>
          <div className="value">{analytics.topTheme}</div>
          <div className="label" style={{ marginTop: 6 }}>
            {analytics.topThemeCount ? `${analytics.topThemeCount.toLocaleString()}건` : '-'}
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <section className="card">
          <div className="card-head">
            <h2>상위 키워드 (제목 기준)</h2>
            <span className="meta">막대 클릭 → 관련 제목</span>
          </div>
          <div className="chart-wrap">
            <Bar data={kwBar.data} options={kwBar.options} />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>상위 2-그램(연속 단어)</h2>
            <span className="meta">막대 클릭 → 관련 제목</span>
          </div>
          <div className="chart-wrap">
            <Bar data={bgBar.data} options={bgBar.options} />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>주제 분포 (간단 분류)</h2>
            <span className="meta">사전 기반(필요 시 키워드 확장)</span>
          </div>
          <div className="chart-wrap">
            <Doughnut data={themeDoughnut.data} options={themeDoughnut.options} />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>키워드 연도별 추이 (상위 5개)</h2>
            <span className="meta">연도별 100건당 등장 횟수</span>
          </div>
          <div className="chart-wrap">
            <Line data={keywordTrendLine.data} options={keywordTrendLine.options} />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>연도별 보고서 발행량</h2>
            <span className="meta">선택 조건 기준</span>
          </div>
          <div className="chart-wrap">
            <Line data={volLine.data} options={volLine.options} />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>기관별 보고서 발행량 (Top 15)</h2>
            <span className="meta">선택 조건 기준</span>
          </div>
          <div className="chart-wrap">
            <Bar data={instBar.data} options={instBar.options} />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>급상승 키워드 (Top 20)</h2>
            <span className="meta">{analytics.rise[0]?.yearLabel || '-'}</span>
          </div>
          <div className="chart-wrap">
            {analytics.rise.length === 0 ? <div className="muted">데이터가 부족합니다.</div> : <Bar data={riseBar.data} options={riseBar.options} />}
          </div>
        </section>

        <section className="card full">
          <div className="card-head">
            <div>
              <h2>워드클라우드 (상위 키워드)</h2>
              <span className="meta">단어 클릭 → 관련 제목</span>
            </div>
            <div className="mini-actions">
              <div className="field" style={{ minWidth: 140 }}>
                <label>표시 개수</label>
                <input
                  className="input"
                  type="number"
                  min={10}
                  max={200}
                  value={cloudTopN}
                  onChange={(e) => setCloudTopN(Math.max(10, Math.min(200, Number(e.target.value) || 50)))}
                />
              </div>
            </div>
          </div>
          <div className="chart-wrap tall">
            {cloudWords.length === 0 ? (
              <div className="muted">데이터가 없습니다.</div>
            ) : (
              <WordCloud words={cloudWords} height={420} onWordClick={(t) => setFocus({ kind: 'keyword', value: t })} />
            )}
          </div>
        </section>

        <section className="card full">
          <div className="card-head">
            <h2>신규·급증 키워드 (버스트)</h2>
            <span className="meta">연도 간 최대 상승폭(100건당)</span>
          </div>
          <div className="chart-wrap">
            {analytics.burst.length === 0 ? <div className="muted">데이터가 부족합니다.</div> : <Bar data={burstBar.data} options={burstBar.options} />}
          </div>
          {analytics.burst.length ? (
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 56 }}>#</th>
                    <th>키워드</th>
                    <th style={{ width: 110 }}>급증 연도</th>
                    <th style={{ width: 140 }}>증가(100건당)</th>
                    <th style={{ width: 140 }}>직전(100건당)</th>
                    <th style={{ width: 140 }}>해당(100건당)</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.burst.map((b, idx) => (
                    <tr key={b.k} style={{ cursor: 'pointer' }} onClick={() => setFocus({ kind: 'keyword', value: b.k })}>
                      <td>{idx + 1}</td>
                      <td>{b.k}</td>
                      <td>{b.year}</td>
                      <td>{(Math.round(b.delta * 10) / 10).toFixed(1)}</td>
                      <td>{(Math.round(b.prev * 10) / 10).toFixed(1)}</td>
                      <td>{(Math.round(b.recent * 10) / 10).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="card full">
          <div className="card-head">
            <h2>키워드 동시출현 네트워크</h2>
            <span className="meta">상위 키워드가 같은 제목에 함께 등장한 관계</span>
          </div>
          <div className="chart-wrap tall">
            {analytics.cooc.nodes.length === 0 ? (
              <div className="muted">데이터가 부족합니다.</div>
            ) : (
              <CoocNetwork
                nodes={analytics.cooc.nodes}
                links={analytics.cooc.links}
                height={420}
                onNodeClick={(id) => setFocus({ kind: 'keyword', value: id })}
              />
            )}
          </div>
        </section>

        <section className="card full">
          <div className="card-head">
            <h2>기관별 키워드 프로파일 (히트맵)</h2>
            <span className="meta">Top 10 기관 x Top 15 키워드 (100건당)</span>
          </div>
          <div className="chart-wrap xl">
            {analytics.heat.rows.length === 0 ? (
              <div className="muted">데이터가 부족합니다.</div>
            ) : (
              <Heatmap rows={analytics.heat.rows} cols={analytics.heat.cols} cells={analytics.heat.cells} height={520} />
            )}
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="card-head">
          <h2>{focus ? `관련 제목: ${focus.value}` : '관련 제목'}</h2>
          <span className="meta">{focus ? `${focusTitles.length.toLocaleString()}건(상위 80개 표시)` : '차트/단어를 클릭해 선택하세요'}</span>
        </div>
        {focus ? (
          <div className="titles">
            {focusTitles.length === 0 ? (
              <div className="muted">해당 조건에서 매칭되는 제목이 없습니다.</div>
            ) : (
              focusTitles.map((r, idx) => (
                <div key={`${r.id ?? idx}-${r.title}`} className="title-item">
                  <div style={{ fontWeight: 700 }}>{r.title}</div>
                  <div className="small">
                    {yearOf(r) ?? '-'} · {norm(r.institute) || '(미상)'} · {norm(r.authors) || '-'}
                    {r.url ? (
                      <>
                        {' '}
                        ·{' '}
                        <a className="link" href={r.url} target="_blank" rel="noreferrer">
                          링크
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="muted">상위 키워드/2-그램/워드클라우드/네트워크에서 항목을 클릭하면 관련 제목이 표시됩니다.</div>
        )}
      </section>
    </div>
  );
}
