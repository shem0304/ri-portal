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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init
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

export function getAuthStatus() {
  return fetchJson<AuthStatus>('./api/auth_status.php');
}

export function getInstitutes() {
  return fetchJson<Institute[]>('./api/institutes.php');
}

export function getReports() {
  return fetchJson<Report[]>('./api/reports.php');
}

export async function saveReports(reports: Report[]) {
  return fetchJson<{ ok: boolean; count?: number; error?: string }>('./api/reports_save.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reports)
  });
}
