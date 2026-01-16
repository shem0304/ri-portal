/*
  national.js
  - Data injected: window.__NATIONAL_BOOT__
  - Renders two lists:
    * NST 소관 23개 정부출연연구기관
    * NRC 소관 26개 정부출연연구기관
*/

const $ = (sel) => document.querySelector(sel);

const LS_THEME = "ri_portal_theme_v1";

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  saveJSON(LS_THEME, theme);
}
function initTheme() {
  const saved = loadJSON(LS_THEME, null);
  if (saved) {
    document.documentElement.dataset.theme = saved;
    return;
  }
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.dataset.theme = prefersLight ? "light" : "dark";
}
function bindThemeToggle() {
  const btn = $("#themeToggle");
  btn?.addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme || "dark";
    applyTheme(cur === "light" ? "dark" : "light");
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderList(items, kind, q) {
  const grid = $("#grid");
  const meta = $("#countMeta");
  if (!grid) return;

  const query = (q || "").trim().toLowerCase();
  const filtered = (items || []).filter((it) => {
    const hay = `${it.name || ""} ${it.desc || ""}`.toLowerCase();
    return !query || hay.includes(query);
  });

  if (meta) {
    meta.textContent = `${filtered.length}건 표시 / 전체 ${items.length}건`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1; padding: 18px;">검색 결과가 없습니다.</div>`;
    return;
  }

  grid.innerHTML = filtered
    .map((it) => {
      const name = escapeHtml(it.name || "");
      const desc = escapeHtml(it.desc || "");
      const isAff = !!it.affiliated;
      const tag = isAff ? `<span class="chip" style="padding:6px 10px; font-size:12px;">부설기관</span>` : ``;

      const url = it.url ? String(it.url) : "";
      const urlHtml = url
        ? `<div class="url"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url.replace(/^https?:\/\//, ""))}</a></div>`
        : `<div class="url">(공식 홈페이지 링크 미표기)</div>`;

      return `
        <div class="item">
          <div class="item-top">
            <div>
              <div class="title">${name}</div>
              ${kind === "nst" && desc ? `<div class="region">${desc}</div>` : ``}
            </div>
            ${tag}
          </div>
          ${kind !== "nst" && desc ? `<div class="region" style="margin-top:10px;">${desc}</div>` : ``}
          ${urlHtml}
          <div class="actions">
            ${url ? `<a class="btn small" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">홈페이지</a>` : ``}
          </div>
        </div>
      `;
    })
    .join("");
}

function setActiveTab(tab) {
  const tabNst = $("#tabNST");
  const tabNrc = $("#tabNRC");
  tabNst?.classList.toggle("active", tab === "nst");
  tabNrc?.classList.toggle("active", tab === "nrc");

  $("#sourceNoteNST")?.classList.toggle("hidden", tab !== "nst");
  $("#sourceNoteNRC")?.classList.toggle("hidden", tab !== "nrc");
}

function main() {
  initTheme();
  bindThemeToggle();

  const BOOT = window.__NATIONAL_BOOT__ || { nst: [], nrc: [], sources: {} };
  const data = {
    nst: Array.isArray(BOOT.nst) ? BOOT.nst : [],
    nrc: Array.isArray(BOOT.nrc) ? BOOT.nrc : []
  };

  let tab = "nst";
  const q = $("#q");

  const render = () => {
    setActiveTab(tab);
    renderList(tab === "nst" ? data.nst : data.nrc, tab, q?.value || "");
  };

  $("#tabNST")?.addEventListener("click", () => {
    tab = "nst";
    render();
  });
  $("#tabNRC")?.addEventListener("click", () => {
    tab = "nrc";
    render();
  });

  q?.addEventListener("input", () => render());
  $("#resetBtn")?.addEventListener("click", () => {
    if (q) q.value = "";
    render();
  });

  render();
}

document.addEventListener("DOMContentLoaded", main);
