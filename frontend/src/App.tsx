import React from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';

import { getAuthStatus, isStaticMode } from './api/client';
import { ToastProvider, useToast } from './components/Toast';
import InstitutesPage from './pages/InstitutesPage';
import ReportsPage from './pages/ReportsPage';
import TrendsPage from './pages/TrendsPage';

const BASE = import.meta.env.BASE_URL;
const STATIC = isStaticMode();

function Header() {
  const [theme, setTheme] = React.useState<string>(() => {
    return localStorage.getItem('ri_portal_theme_v1') || '';
  });

  React.useEffect(() => {
    // 기존 PHP UI와 동일한 방식(data-theme)
    const saved = localStorage.getItem('ri_portal_theme_v1');
    if (saved) {
      document.documentElement.dataset.theme = saved;
      return;
    }
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    const init = prefersLight ? 'light' : 'dark';
    document.documentElement.dataset.theme = init;
    localStorage.setItem('ri_portal_theme_v1', init);
    setTheme(init);
  }, []);

  const toggle = () => {
    const cur = document.documentElement.dataset.theme || 'dark';
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('ri_portal_theme_v1', next);
    setTheme(next);
  };

  return (
    <header className="topbar">
      <div className="brand">
        {/* 라우트가 /reports 같은 하위 경로여도 깨지지 않게 BASE_URL 사용 */}
        <img src={`${BASE}logo-sheep-64.png`} alt="logo" width={28} height={28} style={{ borderRadius: 10 }} />
        <div>
          <div className="brand-title">지역연구원 통합 포털</div>
          <div className="brand-sub">
            {STATIC ? 'React UI (GitHub Pages: 정적 데이터 모드)' : 'React UI (기존 PHP API 연동)'}
          </div>
        </div>
      </div>

      <div className="topbar-actions">
        <button className="btn" type="button" onClick={toggle} aria-label="theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        {!STATIC && (
          <a className="btn" href="./download.php" target="_blank" rel="noreferrer">
            ZIP
          </a>
        )}
      </div>
    </header>
  );
}

function Nav() {
  return (
    <nav className="tabs" aria-label="Primary">
      <NavLink className={({ isActive }) => (isActive ? 'tab active' : 'tab')} to="/">
        기관
      </NavLink>
      <NavLink className={({ isActive }) => (isActive ? 'tab active' : 'tab')} to="/reports">
        보고서
      </NavLink>
      <NavLink className={({ isActive }) => (isActive ? 'tab active' : 'tab')} to="/trends">
        트렌드
      </NavLink>
    </nav>
  );
}

function RequireLoginGate({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const toast = useToast();

  // GitHub Pages(정적 호스팅)에서는 PHP 세션/로그인이 없으므로 게이트를 비활성화
  if (STATIC) return <>{children}</>;

  React.useEffect(() => {
    let ok = false;
    getAuthStatus()
      .then((s) => {
        ok = !!s.logged_in;
        if (!ok) {
          toast.show('로그인 후 이용 가능합니다.');
          const ret = `${loc.pathname}${loc.search}`;
          window.location.href = `./login.php?return=${encodeURIComponent('/react/' + ret.replace(/^\//, ''))}`;
        }
      })
      .catch(() => {
        // auth_status가 막혀있거나 에러면, 페이지는 보여주되 API가 401 내면 Reports/Trends에서 처리
      });

    return () => {
      if (!ok) return;
    };
  }, [loc.pathname, loc.search, toast]);

  return <>{children}</>;
}

function Shell() {
  return (
    <div className="app">
      <Header />
      <Nav />
      <main className="container">
        <Routes>
          <Route path="/" element={<InstitutesPage />} />
          <Route
            path="/reports"
            element={
              <RequireLoginGate>
                <ReportsPage />
              </RequireLoginGate>
            }
          />
          <Route
            path="/trends"
            element={
              <RequireLoginGate>
                <TrendsPage />
              </RequireLoginGate>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
