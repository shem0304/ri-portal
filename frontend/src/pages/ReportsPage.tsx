import React from 'react';
import { getReports, getInstitutes, saveReports, Report, Institute } from '../api/client';
import { useToast } from '../components/Toast';

type SortMode = 'newest' | 'oldest' | 'title';

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

function parseMaybeInt(v: string) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseImport(text: string): Report[] {
  const raw = text.trim();
  if (!raw) return [];

  // JSON 배열
  if (raw.startsWith('[')) {
    const data = JSON.parse(raw) as any[];
    if (!Array.isArray(data)) throw new Error('JSON은 배열이어야 합니다.');
    return data
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        id: x.id ?? null,
        year: x.year != null ? Number(x.year) : null,
        title: String(x.title ?? '').trim(),
        authors: String(x.authors ?? ''),
        institute: String(x.institute ?? ''),
        url: String(x.url ?? '')
      }))
      .filter((x) => x.title);
  }

  // CSV (헤더 있으면 헤더 기준, 없으면 title,year,institute,url 정도만 추정)
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const cells = (line: string) => line.split(',').map((x) => x.trim().replace(/^"|"$/g, ''));

  const head = cells(lines[0]);
  const hasHeader = head.some((h) => ['title', 'year', 'institute', 'url', 'authors', 'id'].includes(h.toLowerCase()));

  let start = 0;
  let idx: Record<string, number> = {};
  if (hasHeader) {
    head.forEach((h, i) => {
      idx[h.toLowerCase()] = i;
    });
    start = 1;
  } else {
    // 기본 매핑
    idx = { title: 0, year: 1, institute: 2, url: 3, authors: 4 };
    start = 0;
  }

  const out: Report[] = [];
  for (let i = start; i < lines.length; i++) {
    const c = cells(lines[i]);
    const title = (c[idx.title] ?? '').trim();
    if (!title) continue;
    out.push({
      id: idx.id != null ? c[idx.id] : null,
      year: idx.year != null ? parseMaybeInt(c[idx.year] ?? '') : null,
      title,
      authors: idx.authors != null ? c[idx.authors] ?? '' : '',
      institute: idx.institute != null ? c[idx.institute] ?? '' : '',
      url: idx.url != null ? c[idx.url] ?? '' : ''
    });
  }
  return out;
}

export default function ReportsPage() {
  const toast = useToast();

  const [reports, setReports] = React.useState<Report[]>([]);
  const [institutes, setInstitutes] = React.useState<Institute[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [q, setQ] = React.useState('');
  const [inst, setInst] = React.useState('ALL');
  const [year, setYear] = React.useState('ALL');
  const [sort, setSort] = React.useState<SortMode>('newest');

  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  const [importOpen, setImportOpen] = React.useState(false);
  const [importText, setImportText] = React.useState('');

  React.useEffect(() => {
    let mounted = true;
    Promise.all([getReports(), getInstitutes()])
      .then(([r, i]) => {
        if (!mounted) return;
        setReports(r || []);
        setInstitutes(i || []);
      })
      .catch((e: any) => {
        if (e?.code === 401) {
          toast.show('로그인 후 이용 가능합니다.');
          const ret = '/react/reports';
          window.location.href = `./login.php?return=${encodeURIComponent(ret)}`;
          return;
        }
        toast.show('보고서 목록을 불러오지 못했습니다.');
        console.error(e);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [toast]);

  const yearOptions = React.useMemo(() => {
    const ys = (reports || [])
      .map((r) => r.year)
      .filter((y): y is number => typeof y === 'number' && Number.isFinite(y))
      .sort((a, b) => b - a);
    return uniq(ys.map(String));
  }, [reports]);

  const instituteOptions = React.useMemo(() => {
    const xs = (reports || [])
      .map((r) => (r.institute || '').trim())
      .filter(Boolean)
      .sort();
    const fromList = (institutes || []).map((x) => (x.name || '').trim()).filter(Boolean);
    return uniq([...xs, ...fromList]).sort();
  }, [reports, institutes]);

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    const y = year === 'ALL' ? null : parseInt(year, 10);

    let out = (reports || []).filter((r) => {
      const hit = !qq || `${r.title} ${r.authors || ''} ${r.institute || ''}`.toLowerCase().includes(qq);
      const instOk = inst === 'ALL' || (r.institute || '').trim() === inst;
      const yearOk = y == null || r.year === y;
      return hit && instOk && yearOk;
    });

    out = out.slice();
    if (sort === 'newest') out.sort((a, b) => (b.year || 0) - (a.year || 0));
    if (sort === 'oldest') out.sort((a, b) => (a.year || 0) - (b.year || 0));
    if (sort === 'title') out.sort((a, b) => a.title.localeCompare(b.title, 'ko'));

    return out;
  }, [reports, q, inst, year, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageClamped = Math.min(Math.max(1, page), totalPages);
  const view = filtered.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);

  React.useEffect(() => {
    setPage(1);
  }, [q, inst, year, sort]);

  const applyImport = async () => {
    try {
      const parsed = parseImport(importText);
      if (parsed.length === 0) {
        toast.show('가져올 데이터가 없습니다.');
        return;
      }
      const res = await saveReports(parsed);
      if (!res.ok) {
        toast.show(res.error || '저장 실패');
        return;
      }
      toast.show(`저장 완료 (${res.count ?? parsed.length}건)`);
      setImportOpen(false);
      setImportText('');
      // 새로고침
      const fresh = await getReports();
      setReports(fresh || []);
    } catch (e: any) {
      if (e?.code === 401) {
        toast.show('로그인 후 이용 가능합니다.');
        window.location.href = `./login.php?return=${encodeURIComponent('/react/reports')}`;
        return;
      }
      toast.show(e?.message || '가져오기 실패');
    }
  };

  return (
    <div>
      <div className="page-title">보고서</div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <div className="field" style={{ flex: '1 1 260px' }}>
            <label>검색</label>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목/저자/기관" />
          </div>

          <div className="field" style={{ flex: '0 0 220px' }}>
            <label>기관</label>
            <select className="select" value={inst} onChange={(e) => setInst(e.target.value)}>
              <option value="ALL">전체</option>
              {instituteOptions.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ flex: '0 0 140px' }}>
            <label>연도</label>
            <select className="select" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="ALL">전체</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ flex: '0 0 160px' }}>
            <label>정렬</label>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
              <option value="newest">최신순</option>
              <option value="oldest">과거순</option>
              <option value="title">제목순</option>
            </select>
          </div>

          <div className="field" style={{ alignSelf: 'end', display: 'flex', gap: 8 }}>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setQ('');
                setInst('ALL');
                setYear('ALL');
                setSort('newest');
              }}
            >
              초기화
            </button>
            <button className="btn" type="button" onClick={() => setImportOpen(true)}>
              가져오기
            </button>
          </div>
        </div>

        <div className="muted" style={{ marginTop: 8 }}>
          {loading ? '불러오는 중…' : `총 ${filtered.length}건`}
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        {view.length === 0 ? (
          <div className="muted">결과가 없습니다.</div>
        ) : (
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>연도</th>
                <th style={{ textAlign: 'left' }}>제목</th>
                <th style={{ textAlign: 'left' }}>기관</th>
                <th style={{ textAlign: 'left' }}>링크</th>
              </tr>
            </thead>
            <tbody>
              {view.map((r, i) => (
                <tr key={`${r.title}-${i}`}>
                  <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{r.year ?? '-'}</td>
                  <td style={{ padding: '8px 6px' }}>{r.title}</td>
                  <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{r.institute || '-'}</td>
                  <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                    {r.url ? (
                      <a className="link" href={r.url} target="_blank" rel="noreferrer">
                        열기
                      </a>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <div className="muted">
            {filtered.length > 0 ? `${pageClamped}/${totalPages} 페이지` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" type="button" disabled={pageClamped <= 1} onClick={() => setPage(1)}>
              처음
            </button>
            <button className="btn" type="button" disabled={pageClamped <= 1} onClick={() => setPage(pageClamped - 1)}>
              이전
            </button>
            <button className="btn" type="button" disabled={pageClamped >= totalPages} onClick={() => setPage(pageClamped + 1)}>
              다음
            </button>
            <button className="btn" type="button" disabled={pageClamped >= totalPages} onClick={() => setPage(totalPages)}>
              끝
            </button>
          </div>
        </div>
      </div>

      {importOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800 }}>보고서 가져오기</div>
              <button className="btn" type="button" onClick={() => setImportOpen(false)}>
                닫기
              </button>
            </div>

            <div className="muted" style={{ marginTop: 6 }}>
              JSON 배열 또는 CSV를 붙여넣으세요. (title, year, institute, url, authors)
            </div>

            <textarea
              className="textarea"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={10}
              placeholder='예시(JSON):
[
  {"year":2024,"title":"...","institute":"...","url":"..."}
]'
              style={{ width: '100%', marginTop: 10 }}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setImportText('title,year,institute,url,authors\n샘플 보고서,2024,샘플연구원,https://example.com,홍길동');
                }}
              >
                템플릿
              </button>
              <button className="btn" type="button" onClick={applyImport}>
                적용/저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
