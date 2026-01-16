/*
  app.js (PHP 버전 프론트)
  - 서버 주입: window.__PORTAL_BOOT__
  - 기관 데이터: __PORTAL_BOOT__.institutes (data/institutes.json)
  - 보고서 데이터: API(/api/reports.php) + 저장 API(/api/reports_save.php)
*/

const $ = (sel) => document.querySelector(sel);

const els = {
  themeToggle: $("#themeToggle"),
  exportBtn: $("#exportBtn"),
  tabInstitutes: $("#tabInstitutes"),
  tabReports: $("#tabReports"),
  tabTrends: $("#tabTrends"),
  institutesView: $("#institutesView"),
  reportsView: $("#reportsView"),
  trendsView: $("#trendsView"),

  // institutes
  q: $("#q"),
  region: $("#region"),
  viewMode: $("#viewMode"),
  resetBtn: $("#resetBtn"),
  chips: $("#chips"),
  hint: $("#hint"),
  grid: $("#grid"),
  countMeta: $("#countMeta"),
  recent: $("#recent"),
  clearRecentBtn: $("#clearRecentBtn"),
  favList: $("#favList"),
  clearFavBtn: $("#clearFavBtn"),

  // reports
  rq: $("#rq"),
  rInstitute: $("#rInstitute"),
  rYear: $("#rYear"),
  rSort: $("#rSort"),
  rResetBtn: $("#rResetBtn"),
  rHint: $("#rHint"),
  reportsTbody: $("#reportsTbody"),
  reportsEmpty: $("#reportsEmpty"),
  pager: $("#pager"),
  addSampleBtn: $("#addSampleBtn"),
  clearReportsBtn: $("#clearReportsBtn"),
  syncReportsBtn: $("#syncReportsBtn"),
  syncMeta: $("#syncMeta"),
  importReportsBtn: $("#importReportsBtn"),

  // import dialog
  importDialog: $("#importDialog"),
  importText: $("#importText"),
  useTemplateBtn: $("#useTemplateBtn"),
  importApplyBtn: $("#importApplyBtn"),

  toast: $("#toast")
};

const BOOT = window.__PORTAL_BOOT__ || { institutes: [], api: {} };
const AUTH = BOOT.auth || { logged_in:false, approved:false, is_admin:false, user:null };
const DEFAULT_VIEW = BOOT.defaultView || "institutes";
const FLASH = BOOT.flash || {};

const LS = {
  theme: "ri_portal_theme_v1",
  fav: "ri_portal_fav_v1",
  recent: "ri_portal_recent_v1"
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function toast(msg) {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => els.toast.classList.remove("show"), 1400);
}

/* ---------------- Theme ---------------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  saveJSON(LS.theme, theme);
}
function initTheme() {
  const saved = loadJSON(LS.theme, null);
  if (saved) {
    document.documentElement.dataset.theme = saved;
    return;
  }
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.dataset.theme = prefersLight ? "light" : "dark";
}
function bindThemeToggle() {
  els.themeToggle?.addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme || "dark";
    applyTheme(cur === "light" ? "dark" : "light");
  });
}

/* ---------------- Tabs ---------------- */
function buildReturnUrl(tab) {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("tab", tab);
    return u.pathname + u.search;
  } catch (e) {
    // fallback
    const base = window.location.pathname + (window.location.search || "");
    if (base.indexOf("tab=") >= 0) return base.replace(/tab=[^&]*/g, "tab=" + encodeURIComponent(tab));
    return base + (base.indexOf("?") >= 0 ? "&" : "?") + "tab=" + encodeURIComponent(tab);
  }
}
function requireLoginForTab(tab) {
  if (!AUTH || !AUTH.logged_in) {
    toast("로그인 후 이용 가능합니다.");
    const ret = buildReturnUrl(tab);
    window.location.href = "./login.php?return=" + encodeURIComponent(ret);
    return false;
  }
  return true;
}

function setTab(which) {
  const isInstitutes = which === "institutes";
  const isReports = which === "reports";
  const isTrends = which === "trends";

  if ((isReports || isTrends) && (!AUTH || !AUTH.logged_in)) {
    requireLoginForTab(isReports ? "reports" : "trends");
    return;
  }

  els.tabInstitutes?.classList.toggle("active", isInstitutes);
  els.tabReports?.classList.toggle("active", isReports);
  els.tabTrends?.classList.toggle("active", isTrends);

  els.institutesView?.classList.toggle("hidden", !isInstitutes);
  els.reportsView?.classList.toggle("hidden", !isReports);
  els.trendsView?.classList.toggle("hidden", !isTrends);

  els.tabInstitutes?.setAttribute("aria-selected", isInstitutes ? "true" : "false");
  els.tabReports?.setAttribute("aria-selected", isReports ? "true" : "false");
  els.tabTrends?.setAttribute("aria-selected", isTrends ? "true" : "false");
}
function bindTabs() {
  els.tabInstitutes?.addEventListener("click", () => setTab("institutes"));

  // 보기(기관/보고서/트렌드)는 모두 공개.
  // 쓰기/관리 기능은 서버(API)에서 별도로 권한을 확인합니다.
  els.tabReports?.addEventListener("click", () => { if (requireLoginForTab("reports")) setTab("reports"); });
els.tabTrends?.addEventListener("click", () => { if (requireLoginForTab("trends")) setTab("trends"); });
}

/* ---------------- Institutes ---------------- */
function getFavSet() {
  return new Set(loadJSON(LS.fav, []));
}
function saveFavSet(set) {
  saveJSON(LS.fav, Array.from(set));
}
function getRecentList() {
  return loadJSON(LS.recent, []);
}
function saveRecentList(list) {
  saveJSON(LS.recent, list.slice(0, 12));
}

function renderSelectOptions(selectEl, values, allLabel="전체") {
  if (!selectEl) return;
  const cur = selectEl.value;
  selectEl.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "ALL";
  optAll.textContent = allLabel;
  selectEl.appendChild(optAll);

  values.forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    selectEl.appendChild(o);
  });

  // keep selection if possible
  if ([...selectEl.options].some(o => o.value === cur)) selectEl.value = cur;
}

function normalize(s) {
  return (s || "").toString().trim();
}

function filterInstitutes(items) {
  const q = normalize(els.q?.value).toLowerCase();
  const region = els.region?.value || "ALL";
  const mode = els.viewMode?.value || "ALL";
  const fav = getFavSet();

  return items.filter(it => {
    const name = normalize(it.name);
    const reg = normalize(it.region);
    const url = normalize(it.url);
    const hit = !q || (name + " " + reg + " " + url).toLowerCase().includes(q);
    const regOk = region === "ALL" || reg === region;
    const favOk = mode !== "FAV" || fav.has(name);
    return hit && regOk && favOk;
  });
}

function instituteCard(it, favSet) {
  const card = document.createElement("div");
  card.className = "item";

  const top = document.createElement("div");
  top.className = "item-top";

  const left = document.createElement("div");
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = it.name || "(이름 없음)";
  const region = document.createElement("div");
  region.className = "region";
  region.textContent = it.region || "-";
  left.appendChild(title);
  left.appendChild(region);

  const star = document.createElement("button");
  star.className = "star" + (favSet.has(it.name) ? " on" : "");
  star.type = "button";
  star.title = "즐겨찾기";
  star.textContent = favSet.has(it.name) ? "★" : "☆";
  star.addEventListener("click", (e) => {
    e.preventDefault();
    const key = it.name;
    if (!key) return;
    if (favSet.has(key)) favSet.delete(key);
    else favSet.add(key);
    saveFavSet(favSet);
    renderInstitutes();
    renderFavList();
  });

  top.appendChild(left);
  top.appendChild(star);

  const url = document.createElement("div");
  url.className = "url";
  url.textContent = it.url || "-";

  const actions = document.createElement("div");
  actions.className = "actions";
  const open = document.createElement("a");
  open.className = "btn small";
  open.textContent = "열기";
  open.href = it.url || "#";
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  open.addEventListener("click", () => {
    const list = getRecentList();
    const next = [{ name: it.name, url: it.url, region: it.region, at: Date.now() }, ...list.filter(x => x.name !== it.name)];
    saveRecentList(next);
    renderRecent();
  });
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = it.region || "-";

  actions.appendChild(open);
  actions.appendChild(badge);

  card.appendChild(top);
  card.appendChild(url);
  card.appendChild(actions);
  return card;
}

function renderChips(regions) {
  if (!els.chips) return;
  els.chips.innerHTML = "";
  const all = document.createElement("button");
  all.type = "button";
  all.className = "chip" + ((els.region?.value || "ALL") === "ALL" ? " active" : "");
  all.textContent = "전체";
  all.addEventListener("click", () => {
    els.region.value = "ALL";
    renderInstitutes();
  });
  els.chips.appendChild(all);

  regions.slice(0, 12).forEach(r => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + ((els.region?.value || "ALL") === r ? " active" : "");
    b.textContent = r;
    b.addEventListener("click", () => {
      els.region.value = r;
      renderInstitutes();
    });
    els.chips.appendChild(b);
  });
}

function renderRecent() {
  if (!els.recent) return;
  const list = getRecentList();
  els.recent.innerHTML = "";
  if (!list.length) {
    els.recent.innerHTML = `<div class="hint">최근 방문이 없습니다.</div>`;
    return;
  }
  list.slice(0, 10).forEach(it => {
    const a = document.createElement("a");
    a.href = it.url || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.innerHTML = `<span>${it.name || "-"}</span><small>${it.region || ""}</small>`;
    els.recent.appendChild(a);
  });
}

function renderFavList() {
  if (!els.favList) return;
  const fav = Array.from(getFavSet());
  els.favList.innerHTML = "";
  if (!fav.length) {
    els.favList.innerHTML = `<div class="hint">즐겨찾기가 없습니다.</div>`;
    return;
  }
  fav.slice(0, 20).forEach(name => {
    const a = document.createElement("a");
    a.href = "#";
    a.innerHTML = `<span>${name}</span><small>★</small>`;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      els.q.value = name;
      renderInstitutes();
    });
    els.favList.appendChild(a);
  });
}

function renderInstitutes() {
  const items = Array.isArray(BOOT.institutes) ? BOOT.institutes : [];
  const regions = Array.from(new Set(items.map(it => it.region).filter(Boolean))).sort();
  renderSelectOptions(els.region, regions, "전체");
  renderChips(regions);

  const filtered = filterInstitutes(items);
  const favSet = getFavSet();

  if (els.grid) {
    els.grid.innerHTML = "";
    filtered.forEach(it => els.grid.appendChild(instituteCard(it, favSet)));
  }
  if (els.countMeta) els.countMeta.textContent = `${filtered.length}개`;
  if (els.hint) {
    els.hint.textContent = items.length
      ? `기관 데이터는 서버의 data/institutes.json(지자체),data/national_institutes.json(국책)에서 읽습니다. (현재 ${items.length}개)`
      : `기관 데이터가 비어 있습니다. 데이터를 채워 주세요.`;
  }
}

function bindInstitutesEvents() {
  els.q?.addEventListener("input", () => renderInstitutes());
  els.region?.addEventListener("change", () => renderInstitutes());
  els.viewMode?.addEventListener("change", () => renderInstitutes());
  els.resetBtn?.addEventListener("click", () => {
    els.q.value = "";
    els.region.value = "ALL";
    els.viewMode.value = "ALL";
    renderInstitutes();
  });
  els.clearRecentBtn?.addEventListener("click", () => {
    saveRecentList([]);
    renderRecent();
    toast("최근 방문을 비웠습니다");
  });
  els.clearFavBtn?.addEventListener("click", () => {
    saveFavSet(new Set());
    renderInstitutes();
    renderFavList();
    toast("즐겨찾기를 해제했습니다");
  });
}

/* ---------------- Reports (server-backed) ---------------- */
let REPORTS = [];
const PAGE_SIZE = 25;
let page = 1;

async function fetchReports() {
  const url = (BOOT.api && BOOT.api.reports) || "./api/reports.php";
  els.syncMeta && (els.syncMeta.textContent = "불러오는 중…");
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    REPORTS = Array.isArray(json) ? json : (json.items || []);
    els.syncMeta && (els.syncMeta.textContent = `서버 데이터 ${REPORTS.length}건`);
  } catch (e) {
    els.syncMeta && (els.syncMeta.textContent = "불러오기 실패");
    console.error(e);
    toast("보고서 불러오기 실패");
    REPORTS = [];
  }
}

function getReportAuthors(r) {
  if (!r) return "";
  if (Array.isArray(r.authors)) return r.authors.join("; ");
  return (r.authors || r.author || "").toString();
}

function filterReports(items) {
  const q = normalize(els.rq?.value).toLowerCase();
  const inst = els.rInstitute?.value || "ALL";
  const year = els.rYear?.value || "ALL";

  return items.filter(r => {
    const title = normalize(r.title);
    const institute = normalize(r.institute);
    const authors = normalize(getReportAuthors(r));
    const y = (r.year ?? "").toString();

    const hit = !q || (title + " " + institute + " " + authors).toLowerCase().includes(q);
    const instOk = inst === "ALL" || institute === inst;
    const yearOk = year === "ALL" || y === year;
    return hit && instOk && yearOk;
  });
}

function sortReports(items) {
  const mode = els.rSort?.value || "YEAR_DESC";
  const copy = items.slice();
  const getYear = (r) => Number(r.year || 0);
  if (mode === "YEAR_DESC") copy.sort((a,b)=>getYear(b)-getYear(a));
  else if (mode === "YEAR_ASC") copy.sort((a,b)=>getYear(a)-getYear(b));
  else if (mode === "TITLE_ASC") copy.sort((a,b)=>normalize(a.title).localeCompare(normalize(b.title), "ko"));
  else if (mode === "INSTITUTE_ASC") copy.sort((a,b)=>normalize(a.institute).localeCompare(normalize(b.institute), "ko"));
  return copy;
}

function renderReportsFilters() {
  const insts = Array.from(new Set(REPORTS.map(r => r.institute).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"ko"));
  const years = Array.from(new Set(REPORTS.map(r => r.year).filter(Boolean))).sort((a,b)=>Number(b)-Number(a)).map(String);

  renderSelectOptions(els.rInstitute, insts, "전체");
  renderSelectOptions(els.rYear, years, "전체");
}

function reportRow(r) {
  const tr = document.createElement("tr");
  const y = document.createElement("td");
  y.textContent = r.year ?? "-";

  const title = document.createElement("td");
  title.innerHTML = `<div class="t-title">${escapeHTML(r.title || "-")}</div>
                     <div class="t-sub">${escapeHTML(r.id || "")}</div>`;

  const authors = document.createElement("td");
  authors.textContent = getReportAuthors(r) || "-";

  const inst = document.createElement("td");
  inst.textContent = r.institute || "-";

  const linkTd = document.createElement("td");
  if (r.url) {
    const a = document.createElement("a");
    a.className = "link";
    a.href = r.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "열기";
    linkTd.appendChild(a);
  } else {
    linkTd.textContent = "-";
  }

  tr.appendChild(y);
  tr.appendChild(title);
  tr.appendChild(authors);
  tr.appendChild(inst);
  tr.appendChild(linkTd);
  return tr;
}

function escapeHTML(s) {
  return (s || "").toString().replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function renderPager(total, pageNow) {
  if (!els.pager) return;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  page = Math.min(Math.max(1, pageNow), totalPages);

  els.pager.innerHTML = "";

  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = `${page} / ${totalPages} 페이지 · ${total}건`;
  els.pager.appendChild(meta);

  const prev = document.createElement("button");
  prev.className = "btn ghost small";
  prev.type = "button";
  prev.textContent = "이전";
  prev.disabled = page <= 1;
  prev.addEventListener("click", () => { renderReports(page - 1); });

  const next = document.createElement("button");
  next.className = "btn ghost small";
  next.type = "button";
  next.textContent = "다음";
  next.disabled = page >= totalPages;
  next.addEventListener("click", () => { renderReports(page + 1); });

  els.pager.appendChild(prev);
  els.pager.appendChild(next);
}

function renderReports(pageNow = 1) {
  if (!els.reportsTbody) return;
  const filtered = sortReports(filterReports(REPORTS));

  const start = (pageNow - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  els.reportsTbody.innerHTML = "";
  slice.forEach(r => els.reportsTbody.appendChild(reportRow(r)));

  if (els.reportsEmpty) {
    els.reportsEmpty.textContent = filtered.length ? "" : "표시할 보고서가 없습니다. CSV/JSON 가져오기를 이용해 데이터를 넣어보세요.";
  }

  if (els.rHint) {
    els.rHint.textContent = `서버 데이터 ${REPORTS.length}건 · 필터 결과 ${filtered.length}건`;
  }

  renderPager(filtered.length, pageNow);
}

async function saveReportsToServer(items) {
  const url = (BOOT.api && BOOT.api.reportsSave) || "./api/reports_save.php";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(items)
  });
  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    throw new Error(`save failed: HTTP ${res.status} ${t}`);
  }
  return res.json().catch(()=> ({}));
}

/* ----- Import helpers ----- */
function csvToReports(csv) {
  const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(",").map(s => s.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const r = {
      year: toInt(cols[idx("year")]),
      title: cols[idx("title")] || "",
      authors: cols[idx("authors")] || "",
      institute: cols[idx("institute")] || "",
      url: cols[idx("url")] || ""
    };
    out.push(r);
  }
  return out;
}

function parseCSVLine(line) {
  // 매우 단순한 CSV 파서(따옴표 지원)
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function toInt(v) {
  const n = Number((v || "").toString().trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeReports(items) {
  const arr = Array.isArray(items) ? items : [];
  return arr.map((r, i) => {
    const year = r.year ?? r.YEARS ?? r.prodYear ?? r.productionYear;
    return {
      id: r.id || r.reportId || null,
      year: toInt(year),
      title: (r.title || r.name || "").toString(),
      authors: Array.isArray(r.authors) ? r.authors : (r.authors || r.author || "").toString(),
      institute: (r.institute || r.org || "").toString(),
      url: (r.url || r.link || "").toString()
    };
  }).filter(r => r.title);
}

function bindReportsEvents() {
  els.rq?.addEventListener("input", () => renderReports(1));
  els.rInstitute?.addEventListener("change", () => renderReports(1));
  els.rYear?.addEventListener("change", () => renderReports(1));
  els.rSort?.addEventListener("change", () => renderReports(1));

  els.rResetBtn?.addEventListener("click", () => {
    els.rq.value = "";
    els.rInstitute.value = "ALL";
    els.rYear.value = "ALL";
    els.rSort.value = "YEAR_DESC";
    renderReports(1);
  });

  els.syncReportsBtn?.addEventListener("click", async () => {
    await fetchReports();
    renderReportsFilters();
    renderReports(1);
    toast("서버 데이터를 다시 불러왔습니다");
  });

  // 쓰기/관리 버튼은 승인 사용자만 동작
  if (!AUTH.approved) {
    [els.addSampleBtn, els.clearReportsBtn, els.importReportsBtn].forEach(btn => {
      if (!btn) return;
      btn.disabled = true;
      btn.title = "관리자 승인 후 사용 가능합니다";
    });
    return;
  }

  els.addSampleBtn?.addEventListener("click", async () => {
    const sample = [
      { year: 2025, title: "지역경제 동향 분석(샘플)", authors: "홍길동; 김철수", institute: "경기연구원", url: "" },
      { year: 2024, title: "도시정책 평가(샘플)", authors: "이영희", institute: "서울연구원", url: "" }
    ];
    const merged = normalizeReports([...sample, ...REPORTS]);
    await saveReportsToServer(merged);
    await fetchReports();
    renderReportsFilters();
    renderReports(1);
    toast("샘플을 추가했습니다");
  });

  els.clearReportsBtn?.addEventListener("click", async () => {
    await saveReportsToServer([]);
    await fetchReports();
    renderReportsFilters();
    renderReports(1);
    toast("서버 보고서 목록을 비웠습니다");
  });

  els.importReportsBtn?.addEventListener("click", () => {
    els.importDialog?.showModal();
  });

  els.useTemplateBtn?.addEventListener("click", () => {
    els.importText.value =
`year,title,authors,institute,url
2025,지역경제 동향 분석,홍길동;김철수,경기연구원,https://example.com
2024,도시정책 평가,이영희,서울연구원,`;
  });

  els.importApplyBtn?.addEventListener("click", async () => {
    const raw = (els.importText.value || "").trim();
    if (!raw) return toast("내용이 비어 있습니다");
    let items = [];
    try {
      if (raw.startsWith("[")) items = JSON.parse(raw);
      else items = csvToReports(raw);
    } catch (e) {
      console.error(e);
      return toast("파싱 실패: CSV 또는 JSON 배열 형태인지 확인하세요");
    }
    const normalized = normalizeReports(items);
    if (!normalized.length) return toast("유효한 항목이 없습니다");
    try {
      await saveReportsToServer(normalized);
      await fetchReports();
      renderReportsFilters();
      renderReports(1);
      els.importDialog?.close();
      toast(`가져오기 완료: ${normalized.length}건`);
    } catch (e) {
      console.error(e);
      toast("서버 저장 실패(권한/경로 확인)");
    }
  });
}

/* ---------------- Export / Download Zip ---------------- */
function bindExport() {
  // 브라우저에서 JSON 내보내기
  els.exportBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const blob = new Blob([JSON.stringify({ institutes: BOOT.institutes, reports: REPORTS }, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "portal_export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    toast("내보내기 완료");
  });
}

async function boot() {
  initTheme();
  bindThemeToggle();
  bindTabs();

  // flash messages from server
  if (FLASH && FLASH.err) {
    if (FLASH.err === "badpath") toast("잘못된 접근 경로입니다. 메인으로 이동했습니다.");
    else toast(String(FLASH.err));
  } else if (FLASH && FLASH.msg) {
    if (FLASH.msg === "login_ok") toast("로그인되었습니다.");
    else if (FLASH.msg === "logout") toast("로그아웃되었습니다.");
    else toast(String(FLASH.msg));
  }

  // Institutes
  bindInstitutesEvents();
  renderInstitutes();
  renderRecent();
  renderFavList();

  // Reports
  // 연구보고서/연구트렌드 데이터는 로그인 사용자만 조회
  if (AUTH && AUTH.logged_in) {
    await fetchReports();
    renderReportsFilters();
    bindReportsEvents();
    renderReports(1);
  } else {
    els.syncMeta && (els.syncMeta.textContent = "로그인 후 조회 가능합니다");
  }

  // Export
  bindExport();

  // default tab: institutes
  setTab(DEFAULT_VIEW);
}

document.addEventListener("DOMContentLoaded", boot);
