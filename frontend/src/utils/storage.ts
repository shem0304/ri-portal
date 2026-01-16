export const LS = {
  theme: 'ri_portal_theme_v1',
  fav: 'ri_portal_fav_v1',
  recent: 'ri_portal_recent_v1'
} as const;

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}
