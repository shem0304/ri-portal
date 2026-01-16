import React from 'react';
import { getInstitutes, Institute } from '../api/client';
import { LS, loadJSON, saveJSON } from '../utils/storage';
import { useToast } from '../components/Toast';

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

export default function InstitutesPage() {
  const toast = useToast();
  const [items, setItems] = React.useState<Institute[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [q, setQ] = React.useState('');
  const [region, setRegion] = React.useState('ALL');
  const [viewMode, setViewMode] = React.useState<'ALL' | 'FAV'>('ALL');

  const [fav, setFav] = React.useState<Set<string>>(() => new Set(loadJSON<string[]>(LS.fav, [])));
  const [recent, setRecent] = React.useState<string[]>(() => loadJSON<string[]>(LS.recent, []));

  React.useEffect(() => {
    let mounted = true;
    getInstitutes()
      .then((data) => {
        if (!mounted) return;
        setItems(data || []);
      })
      .catch((e) => {
        toast.show('기관 목록을 불러오지 못했습니다.');
        console.error(e);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [toast]);

  const regions = React.useMemo(() => {
    return uniq((items || []).map((x) => (x.region || '').trim()).filter(Boolean)).sort();
  }, [items]);

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (items || []).filter((it) => {
      const name = (it.name || '').trim();
      const reg = (it.region || '').trim();
      const url = (it.url || '').trim();

      const hit = !qq || `${name} ${reg} ${url}`.toLowerCase().includes(qq);
      const regOk = region === 'ALL' || reg === region;
      const favOk = viewMode !== 'FAV' || fav.has(name);
      return hit && regOk && favOk;
    });
  }, [items, q, region, viewMode, fav]);

  const toggleFav = (name: string) => {
    const next = new Set(fav);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setFav(next);
    saveJSON(LS.fav, Array.from(next));
  };

  const addRecent = (name: string) => {
    const next = [name, ...recent.filter((x) => x !== name)].slice(0, 12);
    setRecent(next);
    saveJSON(LS.recent, next);
  };

  const clearRecent = () => {
    setRecent([]);
    saveJSON(LS.recent, []);
  };

  const clearFav = () => {
    setFav(new Set());
    saveJSON(LS.fav, []);
  };

  return (
    <div>
      <div className="page-title">기관 목록</div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <div className="field" style={{ flex: '1 1 260px' }}>
            <label>검색</label>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="기관명/지역/URL" />
          </div>

          <div className="field" style={{ flex: '0 0 200px' }}>
            <label>지역</label>
            <select className="select" value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="ALL">전체</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ flex: '0 0 200px' }}>
            <label>보기</label>
            <select className="select" value={viewMode} onChange={(e) => setViewMode(e.target.value as any)}>
              <option value="ALL">전체</option>
              <option value="FAV">즐겨찾기</option>
            </select>
          </div>

          <div className="field" style={{ alignSelf: 'end' }}>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setQ('');
                setRegion('ALL');
                setViewMode('ALL');
              }}
            >
              초기화
            </button>
          </div>
        </div>

        <div className="muted" style={{ marginTop: 8 }}>
          {loading ? '불러오는 중…' : `총 ${filtered.length}개 / 전체 ${(items || []).length}개`}
        </div>
      </div>

      <div className="grid" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {filtered.map((it, idx) => {
          const name = (it.name || '').trim();
          const on = fav.has(name);
          return (
            <div key={`${name}-${idx}`} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{name || '(이름 없음)'}</div>
                  <div className="muted" style={{ marginTop: 2 }}>{it.region || '-'}</div>
                </div>
                <button className={on ? 'btn star on' : 'btn star'} type="button" onClick={() => toggleFav(name)}>
                  {on ? '★' : '☆'}
                </button>
              </div>

              <div className="muted" style={{ marginTop: 10, wordBreak: 'break-all' }}>{it.url || '-'}</div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {it.url ? (
                  <a
                    className="btn"
                    href={it.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => addRecent(name)}
                  >
                    열기
                  </a>
                ) : (
                  <button className="btn" type="button" disabled>
                    URL 없음
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 800 }}>최근 방문</div>
            <button className="btn" type="button" onClick={clearRecent}>
              비우기
            </button>
          </div>
          {recent.length === 0 ? (
            <div className="muted" style={{ marginTop: 8 }}>최근 기록이 없습니다.</div>
          ) : (
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {recent.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 800 }}>즐겨찾기</div>
            <button className="btn" type="button" onClick={clearFav}>
              비우기
            </button>
          </div>
          {fav.size === 0 ? (
            <div className="muted" style={{ marginTop: 8 }}>즐겨찾기가 없습니다.</div>
          ) : (
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {Array.from(fav).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
