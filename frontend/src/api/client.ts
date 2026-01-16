export type AuthStatus = {
  logged_in: boolean;
  approved: boolean;
  is_admin: boolean;
  user: null | { email: string; name?: string };
};

export type Institute = {
  name: string;
  region?: string;
  url?: string;
};

export type Report = {
  id?: string | number | null;
  year?: number | null;
  title: string;
  authors?: string;
  institute?: string;
  url?: string;
};

// GitHub Pages는 PHP를 실행할 수 없어서(정적 호스팅)
// build(PROD)에서는 public/data/*.json 을 읽도록 전환합니다.
const STATIC_MODE = import.meta.env.VITE_STATIC_MODE === 'true' || import.meta.env.PROD;

function dataUrl(filename: string) {
  // BASE_URL은 vite.config.ts의 base 설정을 반영합니다. (예: /ri-portal/)
  return `${import.meta.env.BASE_URL}data/${filename}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
  });

  if (res.status === 401) {
    const e: any = new Error('UNAUTHORIZED');
    e.code = 401;
    throw e;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`);
  }

  return (await res.json()) as T;
}

export function isStaticMode() {
  return STATIC_MODE;
}

export function getAuthStatus() {
  if (STATIC_MODE) {
    // Pages 배포에서는 로그인/세션이 없으므로 "비로그인" 상태로 고정
    return Promise.resolve<AuthStatus>({
      logged_in: false,
      approved: false,
      is_admin: false,
      user: null,
    });
  }
  return fetchJson<AuthStatus>('./api/auth_status.php');
}

export function getInstitutes() {
  if (STATIC_MODE) {
    return fetchJson<Institute[]>(dataUrl('institutes.json'), { credentials: 'omit' });
  }
  return fetchJson<Institute[]>('./api/institutes.php');
}

export function getReports() {
  if (STATIC_MODE) {
    return fetchJson<Report[]>(dataUrl('reports.json'), { credentials: 'omit' });
  }
  return fetchJson<Report[]>('./api/reports.php');
}

export async function saveReports(reports: Report[]) {
  if (STATIC_MODE) {
    // Pages에서는 서버 저장이 불가능(정적 호스팅)
    return { ok: false, error: 'GitHub Pages(정적 호스팅)에서는 서버 저장 기능을 사용할 수 없습니다.' } as const;
  }
  return fetchJson<{ ok: boolean; count?: number; error?: string }>('./api/reports_save.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reports),
  });
}
