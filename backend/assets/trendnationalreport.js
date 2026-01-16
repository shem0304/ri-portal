(()=>{
/*
  연구 트렌드 화면
  - allreports_normalized.json의 title을 기반으로 키워드/2-그램/주제/연도별 추이를 계산
  - 순수 프론트엔드(정적)로 동작
*/

/* ---------------------- DOM helpers ---------------------- */
const $ = (sel) => document.querySelector(sel);
const els = {
  q: $("#t_q"),
  institute: $("#institute"),
  yearFrom: $("#yearFrom"),
  yearTo: $("#yearTo"),
  resetBtn: $("#t_resetBtn"),
  hint: $("#t_hint"),
  toast: $("#toast"),
  themeToggle: $("#themeToggle"),
  exportBtn: $("#exportBtn"),
  // KPIs
  kpiCount: $("#kpiCount"),
  kpiRange: $("#kpiRange"),
  kpiTopKeyword: $("#kpiTopKeyword"),
  kpiTopKeywordSub: $("#kpiTopKeywordSub"),
  kpiTopTheme: $("#kpiTopTheme"),
  kpiTopThemeSub: $("#kpiTopThemeSub"),
  // Charts
  kwChart: $("#kwChart"),
  bgChart: $("#bgChart"),
  themeChart: $("#themeChart"),
  trendChart: $("#trendChart"),
  volChart: $("#volChart"),
  instChart: $("#instChart"),
  riseChart: $("#riseChart"),
  // Titles
  titlesHead: $("#titlesHead"),
  titlesMeta: $("#titlesMeta"),
  titles: $("#titles"),
  // Extra metas
  volMeta: $("#volMeta"),
  riseMeta: $("#riseMeta"),
  // Wordcloud
  cloudPeriod: $("#cloudPeriod"),
  cloudTopN: $("#cloudTopN"),
  cloudTitle: $("#cloudTitle"),
  cloudMeta: $("#cloudMeta"),
  cloud: $("#cloud"),
  // Advanced
  burstMeta: $("#burstMeta"),
  burstChart: $("#burstChart"),
  burstTable: $("#burstTable"),
  coocMeta: $("#coocMeta"),
  cooc: $("#cooc"),
  heatMeta: $("#heatMeta"),
  instHeatmap: $("#instHeatmap")
};

function clampInt(v, min, max, fallback) {
  const n = Number.parseInt(String(v || ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/* ---------------------- LocalStorage keys ---------------------- */
const LS_KEYS = {
  theme: "ri_portal_theme_v1"
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
  // 페이지 템플릿마다 toast 컨테이너가 없을 수 있어 방어적으로 처리
  if (!els.toast) {
    const div = document.createElement("div");
    div.id = "toast";
    div.className = "toast";
    div.setAttribute("role", "status");
    div.setAttribute("aria-live", "polite");
    document.body.appendChild(div);
    els.toast = div;
  }

  els.toast.textContent = msg;
  els.toast.classList.add("show");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => els.toast.classList.remove("show"), 1400);
}

/* ---------------------- Theme ---------------------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  saveJSON(LS_KEYS.theme, theme);
}
function initTheme() {
  const saved = loadJSON(LS_KEYS.theme, null);
  if (saved) {
    document.documentElement.dataset.theme = saved;
    return;
  }
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.dataset.theme = prefersLight ? "light" : "dark";
}

/* ---------------------- Tokenization ---------------------- */
// NOTE: 형태소 분석기는 사용하지 않고, 공백 기반 + 불용어 제거로 가벼운 트렌드를 봅니다.
const STOPWORDS = new Set([
  // 조사/연결어
  "및", "위한", "대한", "관한", "따른", "통한", "관련", "중심으로", "대상", "방향", "현황",
  "사례", "비교", "적용", "검토", "평가", "조사", "분석", "연구",
  // 보고서/계획/용역 류
  "방안", "대응방안", "발전방안", "개선", "개선방안", "전략", "계획", "기본계획", "기본구상", "수립",
  "용역", "연구용역", "기초연구", "타당성", "타당성검토", "마스터플랜",
  // 매우 일반적인 동사/형용
  "효율적", "미치는", "필요", "추진", "활용", "활성화", "활성화를", "제고", "강화", "확대",
  // 숫자/회차
  "1차", "2차", "3차", "4차", "5차",
  "최근", "시사점", "활용방안", "국내", "구축방안", "이후", "관리방안", "향후", "제고를", "대응한", "활용을", "추진방안", "고려한", "대응들", "활용한", "전략과", "시대", "분석을", "정책과", "정책방안", "정책", "영향",
  "정책방향", "정책과제", "정책적", "대응전략", "대응", "주요", "특성", "제고방안", "현황", "효과", "분석과", "한국의", "중국의", "제2권", "제1권", "우리의", "우리나라", "발전방향", "실현을", "현황과", "시대의", "전망과",
  "평가와", "대응의", "강화를", "대응을", "전망", "발전", "구조", "사례를", "기반의", "영향과", "변화에"

  
]);


// 추가 불용어(제목에 자주 등장하지만 주제 구분에는 덜 유의미한 표현)
[
  "운영", "구축", "조성", "도입", "추진", "확산", "활성화", "활성화방안",
  "개발", "관리", "개편", "정비", "모형", "모델", "지표", "실태", "진단",
  "연계", "거점", "체계", "로드맵", "시범", "대책", "과제"
].forEach(w => STOPWORDS.add(w));

const REGION_WORDS = [
  // 광역 지자체 및 자주 등장하는 축약
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
  "서울시", "부산시", "대구시", "인천시", "광주시", "대전시", "울산시", "세종시",
  "경기도", "강원도", "충청북도", "충청남도", "전라북도", "전라남도", "경상북도", "경상남도", "제주도"
];
const REGION_SET = new Set(REGION_WORDS);


function isRegionToken(tok) {
  const t = (tok || "").toString();
  if (!t) return false;
  if (REGION_SET.has(t)) return true;

  // "OO시/군/구" 형태(행정구역 표기) 제거: 예) 강릉시, 양양군, 성동구
  if (/[가-힣]{2,}(시|군|구)$/.test(t)) return true;

  // "OO도"는 일반명사(용도/수도 등)와 섞일 수 있어 길이가 충분할 때만 제외
  if (/[가-힣]{3,}도$/.test(t)) return true;

  return false;
}


function normalizeText(s) {
  return (s || "").toString().trim();
}
/* ---------------------- Token filters (EN-only + Korean 조사) ---------------------- */
// - 영문 키워드가 단독으로 쓰인 토큰(예: AI, ESG, smart)은 제외
// - 한글 단어 뒤에 붙은 조사는 포함(예: "정책을" -> "정책을")
//   ※ 형태소 분석 없이 공백 단위로만 분리합니다.

const _KOREAN_EUI_EXCEPTIONS = new Set([
  // '의'가 조사(소유격)로 보이지만 실제 단어 자체인 경우가 많아 예외 처리
  "회의", "정의", "의의", "강의", "협의", "합의", "결의", "건의", "심의", "논의", "의회"
]);

const _JOSA_SUFFIXES = [
  "으로써", "로써", "으로서", "로서",
  "에게서", "께서", "에서", "에게", "한테",
  "부터", "까지",
  "으로", // '로'는 오탐(그대로/도로 등) 가능성이 커서 제외
  "에",
  "은", "는", "이", "가", "을", "를", "과", "와",
  "도", "만",
  "의" // 단, 예외 단어는 유지
].slice().sort((a, b) => b.length - a.length);

function isEnglishOnlyToken(tok) {
  return /^[A-Za-z]+$/.test(tok);
}

function stripKoreanJosa(tok) {
  if (!/^[가-힣]+$/.test(tok)) return tok;

  // '의' 예외 처리 (회의/정의/강의 등)
  if (tok.endsWith("의") && _KOREAN_EUI_EXCEPTIONS.has(tok)) return tok;

  for (const suf of _JOSA_SUFFIXES) {
    // 어간이 너무 짧아지면 제거하지 않음(최소 2글자 유지)
    if (tok.length <= suf.length + 1) continue;
    if (tok.endsWith(suf)) return tok.slice(0, -suf.length);
  }
  return tok;
}

function tokenize(title) {
  // 1) 특수문자 제거 후 공백 분리
  const cleaned = normalizeText(title)
    .replace(/[^0-9A-Za-z가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const toks = cleaned.split(" ");

  const out = [];
  for (const raw of toks) {
    if (!raw) continue;

    // 영문 단독 토큰은 제외(트렌드에 노이즈가 많음)
    if (isEnglishOnlyToken(raw)) continue;

    let tok = raw.toLowerCase();

    // 한글 토큰은 조사 포함(원문 유지)

    if (!tok) continue;
    if (tok.length <= 1) continue;
    if (STOPWORDS.has(tok)) continue;
    if (/^\d+$/.test(tok)) continue; // 숫자만은 제외

    out.push(tok);
  }
  return out;
}

function bigrams(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    out.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return out;
}

/* ---------------------- Theme dictionary ---------------------- */
// 사전 기반 분류(완벽하지 않음). 필요 시 키워드를 추가/수정해서 사용하세요.
const THEMES = [
  {
    key: "인구·청년·고령화",
    terms: ["인구", "저출산", "저출생", "출산", "고령", "고령화", "청년", "노인", "인구감소", "정주", "이주", "귀농", "귀촌"]
  },
  {
    key: "지역경제·산업·일자리",
    terms: ["경제", "산업", "기업", "일자리", "고용", "투자", "수출", "상권", "소상공인", "관광", "혁신", "창업", "특구"]
  },
  {
    key: "도시·주거·공간",
    terms: ["도시", "도시재생", "주거", "주택", "정비", "재개발", "재건축", "토지", "공간", "스마트시티", "도시계획", "생활권"]
  },
  {
    key: "교통·물류",
    terms: ["교통", "도로", "철도", "버스", "지하철", "환승", "물류", "항만", "공항", "주차", "모빌리티"]
  },
  {
    key: "환경·기후·에너지",
    terms: ["환경", "기후", "탄소", "온실가스", "에너지", "재생에너지", "태양광", "풍력", "미세먼지", "폐기물", "수질", "하수", "생태", "산림"]
  },
  {
    key: "복지·보건·돌봄",
    terms: ["복지", "보건", "의료", "건강", "돌봄", "장애", "아동", "가족", "보육", "사회서비스"]
  },
  {
    key: "교육·문화·관광",
    terms: ["교육", "학교", "대학", "평생교육", "문화", "예술", "체육", "콘텐츠", "축제", "관광"]
  },
  {
    key: "안전·재난",
    terms: ["안전", "재난", "방재", "홍수", "산사태", "지진", "감염병", "재해", "위기"]
  },
  {
    key: "행정·거버넌스·재정",
    terms: ["행정", "거버넌스", "재정", "예산", "조직", "제도", "규제", "협력", "정책", "성과", "민원", "공공"]
  },
  {
    key: "농림·해양",
    terms: ["농업", "농촌", "농산물", "축산", "스마트팜", "산림", "임업", "어업", "수산", "해양"]
  }
];

function themeOfTitle(title) {
  const t = normalizeText(title);
  const hits = [];
  for (const theme of THEMES) {
    for (const term of theme.terms) {
      if (t.includes(term)) {
        hits.push(theme.key);
        break;
      }
    }
  }
  return hits.length ? hits : ["기타"];
}

/* ---------------------- State ---------------------- */
let REPORTS = [];
let CHARTS = {
  kw: null,
  bg: null,
  theme: null,
  trend: null,
  vol: null,
  inst: null,
  rise: null,
  burst: null
};

let LAST_STATE = { rows: [], counters: null };

function uniq(arr) {
  return Array.from(new Set(arr));
}

function sortKo(a, b) {
  return String(a).localeCompare(String(b), "ko");
}

function download(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------------- Data loading ---------------------- */
async function loadReports() {
  const apiUrl = (window.__TRENDS_BOOT__ && window.__TRENDS_BOOT__.api && window.__TRENDS_BOOT__.api.reports) || "./api/national_reports.php";
  const res = await fetch(apiUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`데이터 로드 실패 (${res.status})`);
  const arr = await res.json();
  // 예상 스키마: {id,year,title,authors,institute,url}
  return Array.isArray(arr) ? arr : [];
}

function initFilters() {
  const years = uniq(REPORTS.map(r => Number(r.year)).filter(Boolean)).sort((a, b) => a - b);
  const institutes = uniq(REPORTS.map(r => normalizeText(r.institute)).filter(Boolean)).sort(sortKo);

  // institute
  for (const name of institutes) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    els.institute.appendChild(opt);
  }

  // years range (fallback if empty)
  const minY = years[0] ?? 2000;
  const maxY = years[years.length - 1] ?? new Date().getFullYear();

  els.yearFrom.innerHTML = "";
  els.yearTo.innerHTML = "";
  for (let y = minY; y <= maxY; y++) {
    const o1 = document.createElement("option");
    o1.value = String(y);
    o1.textContent = String(y);
    els.yearFrom.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = String(y);
    o2.textContent = String(y);
    els.yearTo.appendChild(o2);
  }
  els.yearFrom.value = String(minY);
  els.yearTo.value = String(maxY);

  els.hint.textContent = `데이터 ${REPORTS.length.toLocaleString()}건 · 연도 ${minY}–${maxY}`;
}

function getFilters() {
  const q = normalizeText(els.q.value);
  const institute = els.institute.value || "ALL";
  const yFrom = Number(els.yearFrom.value);
  const yTo = Number(els.yearTo.value);
  const yearFrom = Math.min(yFrom, yTo);
  const yearTo = Math.max(yFrom, yTo);
  return { q, institute, yearFrom, yearTo };
}

function filterReports() {
  const { q, institute, yearFrom, yearTo } = getFilters();
  return REPORTS.filter(r => {
    const y = Number(r.year) || 0;
    if (y && (y < yearFrom || y > yearTo)) return false;
    if (institute !== "ALL" && normalizeText(r.institute) !== institute) return false;
    if (q) {
      const t = normalizeText(r.title);
      if (!t.includes(q)) return false;
    }
    return true;
  });
}

/* ---------------------- Aggregations ---------------------- */
function topN(counter, n) {
  const arr = Array.from(counter.entries()).sort((a, b) => b[1] - a[1]);
  return arr.slice(0, n);
}

function buildCounters(rows) {
  const kw = new Map();
  const bg = new Map();
  const theme = new Map();
  const byYearCount = new Map();
  const kwByYear = new Map(); // kw -> Map(year->count)
  const byInstituteCount = new Map();

  for (const r of rows) {
    const title = normalizeText(r.title);
    const y = Number(r.year) || 0;
    if (y) byYearCount.set(y, (byYearCount.get(y) || 0) + 1);

    const inst = (r.institute || "").toString().trim();
    if (inst) byInstituteCount.set(inst, (byInstituteCount.get(inst) || 0) + 1);

    const toks = tokenize(title);
    for (const t of toks) {
      // 지역 단어는 기본 키워드에서 제외(별도 분석하고 싶으면 여기에서 주석 처리)
      if (isRegionToken(t)) continue;
      kw.set(t, (kw.get(t) || 0) + 1);
      if (y) {
        if (!kwByYear.has(t)) kwByYear.set(t, new Map());
        const m = kwByYear.get(t);
        m.set(y, (m.get(y) || 0) + 1);
      }
    }

    const bgs = bigrams(toks)
      .filter(x => {
        const [a, b] = x.split(" ");
        return !(isRegionToken(a) || isRegionToken(b));
      });
    for (const b of bgs) bg.set(b, (bg.get(b) || 0) + 1);

    const themes = themeOfTitle(title);
    for (const th of themes) theme.set(th, (theme.get(th) || 0) + 1);
  }

  return { kw, bg, theme, byYearCount, kwByYear, byInstituteCount };
}

function yearsInRange(rows) {
  const ys = uniq(rows.map(r => Number(r.year)).filter(Boolean)).sort((a, b) => a - b);
  return ys;
}

/* ---------------------- Rendering ---------------------- */
function setKPIs(rows, counters) {
  const ys = yearsInRange(rows);
  const yRange = ys.length ? `${ys[0]}–${ys[ys.length - 1]}` : "-";
  els.kpiCount.textContent = `${rows.length.toLocaleString()}건`;
  els.kpiRange.textContent = `연도 ${yRange}`;

  const topKw = topN(counters.kw, 1)[0];
  if (topKw) {
    els.kpiTopKeyword.textContent = topKw[0];
    els.kpiTopKeywordSub.textContent = `${topKw[1].toLocaleString()}회`;
  } else {
    els.kpiTopKeyword.textContent = "-";
    els.kpiTopKeywordSub.textContent = "-";
  }

  const topTheme = topN(counters.theme, 1)[0];
  if (topTheme) {
    const pct = rows.length ? Math.round((topTheme[1] / rows.length) * 100) : 0;
    els.kpiTopTheme.textContent = topTheme[0];
    els.kpiTopThemeSub.textContent = `${topTheme[1].toLocaleString()}건 (${pct}%)`;
  } else {
    els.kpiTopTheme.textContent = "-";
    els.kpiTopThemeSub.textContent = "-";
  }
}

function destroyCharts() {
  for (const k of Object.keys(CHARTS)) {
    if (CHARTS[k]) {
      CHARTS[k].destroy();
      CHARTS[k] = null;
    }
  }
}

function makeBarChart(canvas, labels, values, { title = "", onClick } = {}) {
  const ctx = canvas.getContext("2d");
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: title,
        data: values,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true }
      },
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: true },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          grid: { display: true }
        }
      },
      onClick: (evt, elements) => {
        if (!onClick || !elements?.length) return;
        const idx = elements[0].index;
        const label = labels[idx];
        onClick(label);
      }
    }
  });
}

function makeDoughnut(canvas, labels, values) {
  const ctx = canvas.getContext("2d");
  return new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values, borderWidth: 1 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });
}

function makeTrendLine(canvas, years, series) {
  // series: [{label, values: number[]}]
  const ctx = canvas.getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: years.map(String),
      datasets: series.map(s => ({
        label: s.label,
        data: s.values,
        tension: 0.2,
        pointRadius: 2
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: { enabled: true }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "100건당 등장" }
        }
      }
    }
  });

}

function makeCountLine(canvas, years, values, { label = "보고서 수", yTitle = "보고서 수" } = {}) {
  const ctx = canvas.getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: years.map(String),
      datasets: [{
        label,
        data: values,
        tension: 0.2,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: { enabled: true }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: yTitle }
        }
      }
    }
  });
}

function buildRisingKeywords(rows, yearFrom, yearTo) {
  const yf = Number(yearFrom) || 0;
  const yt = Number(yearTo) || 0;
  if (!yf || !yt || yf >= yt) {
    return { meta: "연도 범위가 너무 짧아 급상승 분석을 할 수 없습니다", items: [] };
  }

  const mid = Math.floor((yf + yt) / 2);
  const aStart = yf, aEnd = mid;
  const bStart = mid + 1, bEnd = yt;
  if (bStart > bEnd) {
    return { meta: "연도 범위가 너무 짧아 급상승 분석을 할 수 없습니다", items: [] };
  }

  const a = new Map();
  const b = new Map();

  for (const r of rows) {
    const y = Number(r.year) || 0;
    if (!y) continue;
    const title = normalizeText(r.title);
    const toks = tokenize(title);
    const target = (y <= mid) ? a : b;

    for (const t of toks) {
      if (isRegionToken(t)) continue;
      target.set(t, (target.get(t) || 0) + 1);
    }
  }

  const keys = new Set([...a.keys(), ...b.keys()]);
  const out = [];
  for (const k of keys) {
    const ca = a.get(k) || 0;
    const cb = b.get(k) || 0;
    // 최근(후반)에서 최소 등장횟수 기준으로 노이즈 제거
    if (cb < 5) continue;

    const delta = cb - ca;
    const ratio = (cb + 1) / (ca + 1);
    // 증가가 거의 없는 항목 제외
    if (delta <= 0) continue;

    out.push({ k, delta, ratio, ca, cb });
  }

  out.sort((x, y) => (y.ratio - x.ratio) || (y.delta - x.delta));

  const meta = `전반(${aStart}–${aEnd}) 대비 후반(${bStart}–${bEnd}) 증가분(후반-전반)`;
  return { meta, items: out.slice(0, 20) };
}


function escapeHtml(str) {
  return (str || "").toString().replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

function highlight(text, keyword) {
  if (!keyword) return escapeHtml(text);
  const safe = escapeHtml(text);
  // keyword is label (already normalized); do a simple replace (case-insensitive for latin)
  try {
    const re = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return safe.replace(re, (m) => `<mark class="hl">${m}</mark>`);
  } catch {
    return safe;
  }
}

function renderTitles(rows, { keyword = "" } = {}) {
  const kw = normalizeText(keyword);
  const filtered = kw
    ? rows.filter(r => normalizeText(r.title).includes(kw))
    : rows;
  const head = kw ? `관련 제목 (키워드: “${kw}”)` : "관련 제목";
  els.titlesHead.textContent = head;
  els.titlesMeta.textContent = `${filtered.length.toLocaleString()}건`;

  if (!filtered.length) {
    els.titles.innerHTML = `<div class="empty">표시할 제목이 없습니다.</div>`;
    return;
  }

  // 최신 연도 우선, 같은 연도는 제목 오름차순
  const sorted = [...filtered].sort((a, b) => {
    const ya = Number(a.year) || 0;
    const yb = Number(b.year) || 0;
    if (ya !== yb) return yb - ya;
    return String(a.title).localeCompare(String(b.title), "ko");
  });

  const limit = 200;
  const show = sorted.slice(0, limit);
  const more = sorted.length - show.length;
  els.titles.innerHTML = show.map(r => {
    const y = Number(r.year) || "-";
    const inst = escapeHtml(r.institute || "-");
    const url = r.url ? `<a class="link" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">열기 ↗</a>` : "";
    return `
      <div class="title-row">
        <div class="title-main">
          <div class="title-top">
            <span class="badge">${y}</span>
            <span class="badge">${inst}</span>
          </div>
          <div class="title-text">${highlight(r.title || "", kw)}</div>
        </div>
        <div class="title-actions">${url}</div>
      </div>
    `;
  }).join("") + (more > 0 ? `<div class="empty">… 외 ${more.toLocaleString()}건(최대 ${limit}건만 표시)</div>` : "");
}

function renderAll() {
  const rows = filterReports();
  const counters = buildCounters(rows);
  setKPIs(rows, counters);

  LAST_STATE = { rows, counters };

  // Charts
  destroyCharts();

  // 1) keywords
  const topKeywords = topN(counters.kw, 20);
  const kwLabels = topKeywords.map(([k]) => k);
  const kwValues = topKeywords.map(([, v]) => v);
  CHARTS.kw = makeBarChart(els.kwChart, kwLabels, kwValues, {
    onClick: (kw) => renderTitles(rows, { keyword: kw })
  });

  // 2) bigrams
  const topBigrams = topN(counters.bg, 20);
  CHARTS.bg = makeBarChart(
    els.bgChart,
    topBigrams.map(([k]) => k),
    topBigrams.map(([, v]) => v)
  );

  // 3) themes
  const themeSorted = topN(counters.theme, 12);
  CHARTS.theme = makeDoughnut(
    els.themeChart,
    themeSorted.map(([k]) => k),
    themeSorted.map(([, v]) => v)
  );

  // 4) trends for top 5 keywords
  const years = yearsInRange(rows);
  const yearBase = new Map();
  for (const y of years) yearBase.set(y, counters.byYearCount.get(y) || 0);

  const top5 = topN(counters.kw, 5).map(([k]) => k);
  const series = top5.map((k) => {
    const m = counters.kwByYear.get(k) || new Map();
    const values = years.map((y) => {
      const base = yearBase.get(y) || 0;
      if (!base) return 0;
      return Math.round(((m.get(y) || 0) / base) * 100 * 10) / 10; // 100건당, 소수 1자리
    });
    return { label: k, values };
  });

  if (years.length) {
    CHARTS.trend = makeTrendLine(els.trendChart, years, series);
  } else {
    els.trendChart.replaceWith(els.trendChart.cloneNode(true));
  }


  // 5) volume by year
  if (years.length) {
    const counts = years.map(y => counters.byYearCount.get(y) || 0);
    CHARTS.vol = makeCountLine(els.volChart, years, counts, { label: "보고서 수", yTitle: "보고서 수" });
    if (els.volMeta) els.volMeta.textContent = `선택한 조건에서 연도별 보고서 수 (총 ${rows.length.toLocaleString()}건)`;
  } else {
    els.volChart.replaceWith(els.volChart.cloneNode(true));
  }

  // 6) volume by institute
  const instTop = topN(counters.byInstituteCount, 15);
  if (instTop.length) {
    CHARTS.inst = makeBarChart(
      els.instChart,
      instTop.map(([k]) => k),
      instTop.map(([, v]) => v),
      {
        onClick: (inst) => {
          if (els.institute) els.institute.value = inst;
          renderAll();
          toast(`기관 필터: ${inst}`);
        }
      }
    );
  } else {
    els.instChart.replaceWith(els.instChart.cloneNode(true));
  }

  // 7) rising keywords (split range into early vs late)
  const rk = buildRisingKeywords(rows, els.yearFrom.value, els.yearTo.value);
  if (els.riseMeta) els.riseMeta.textContent = rk.meta;
  if (rk.items.length) {
    CHARTS.rise = makeBarChart(
      els.riseChart,
      rk.items.map(x => x.k),
      rk.items.map(x => x.delta),
      { title: "증가(후반-전반)" }
    );
  } else {
    els.riseChart.replaceWith(els.riseChart.cloneNode(true));
  }

  // 8) wordcloud
  renderWordCloud(rows);

  // 9) advanced analyses
  renderBurst(rows, counters);
  renderCoocNetwork(rows, counters);
  renderInstituteHeatmap(rows, counters);

  // Titles default: show top keyword
  renderTitles(rows, { keyword: topKeywords[0]?.[0] || "" });
}


/* ---------------------- Wordcloud ---------------------- */
function fiveYearStart(y) {
  // 2001 -> 2000 (2000–2004)
  return y - (y % 5);
}

function buildFiveYearBins(rows) {
  const bins = new Map();      // startYear -> Map(keyword -> count)
  const binCounts = new Map(); // startYear -> report count

  for (const r of rows) {
    const y = Number(r.year) || 0;
    if (!y) continue;
    const s = fiveYearStart(y);
    binCounts.set(s, (binCounts.get(s) || 0) + 1);

    if (!bins.has(s)) bins.set(s, new Map());
    const c = bins.get(s);
    const toks = tokenize(normalizeText(r.title));
    for (const t of toks) {
      if (isRegionToken(t)) continue;
      c.set(t, (c.get(t) || 0) + 1);
    }
  }

  const starts = Array.from(bins.keys()).sort((a, b) => a - b);
  return { bins, binCounts, starts };
}

function ensureCloudPeriodOptions(starts) {
  if (!els.cloudPeriod) return;
  const cur = els.cloudPeriod.value;
  const existing = Array.from(els.cloudPeriod.querySelectorAll("option")).map(o => o.value);
  const desired = starts.map(String);

  // options가 동일하면 유지
  const same = existing.length === desired.length && existing.every((v, i) => v === desired[i]);
  if (!same) {
    els.cloudPeriod.innerHTML = "";
    for (const s of starts) {
      const opt = document.createElement("option");
      opt.value = String(s);
      opt.textContent = `${s}–${s + 4}`;
      els.cloudPeriod.appendChild(opt);
    }
  }

  // 선택값 보정: 없으면 최신 구간으로
  const hasCur = desired.includes(cur);
  if (!hasCur && desired.length) els.cloudPeriod.value = desired[desired.length - 1];
}

function renderWordCloud(rows) {
  if (!els.cloud || !els.cloudMeta) return;

  if (!rows || !rows.length) {
    els.cloud.innerHTML = `<div class="empty">표시할 데이터가 없습니다.</div>`;
    els.cloudMeta.textContent = "-";
    return;
  }

  // 현재 조회 조건(연도 범위) 기준 Top N
  const { yearFrom, yearTo } = getFilters();
  const counters = buildCounters(rows);
  const n = clampInt(els.cloudTopN ? els.cloudTopN.value : null, 10, 200, 50);
  if (els.cloudTopN) els.cloudTopN.value = String(n);

  const top = topN(counters.kw, n);

  const total = rows.length;
  const rangeLabel = (yearFrom && yearTo) ? `${yearFrom}–${yearTo}` : "전체 기간";
  els.cloudMeta.textContent = `${rangeLabel} · ${total.toLocaleString()}건 · Top ${n}`;
  if (els.cloudTitle) els.cloudTitle.textContent = `워드클라우드 (Top ${n} 키워드)`;

  // 라이브러리 로드 실패 시 텍스트 배지로 대체
  if (!window.d3 || !d3.layout || !d3.layout.cloud) {
    els.cloud.innerHTML = `
      <div class="empty">워드클라우드 라이브러리를 불러오지 못했습니다. (네트워크/차단 여부 확인)</div>
      <div style="padding:10px; line-height:1.9;">
        ${top.map(([k, v]) => `<span class="badge" style="margin:4px 6px 0 0;">${escapeHtml(k)} (${v})</span>`).join("")}
      </div>
    `;
    return;
  }

  const rect = els.cloud.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width || 800));
  const height = Math.max(220, Math.floor(rect.height || 320));

  const maxV = Math.max(1, ...top.map(([, v]) => v));
  const minV = Math.min(...top.map(([, v]) => v));

  // count -> font size (12px ~ 64px)
  const size = d3.scaleSqrt()
    .domain([minV, maxV])
    .range([12, 64]);

  const words = top.map(([text, value]) => ({
    text,
    value,
    size: Math.round(size(value))
  }));

  // 컬러 팔레트 (d3 scheme 사용)
  const palette = (d3.schemeTableau10 || d3.schemeCategory10 || []).slice();
  const color = palette.length ? d3.scaleOrdinal(palette) : null;

  // clear
  els.cloud.innerHTML = "";

  const layout = d3.layout.cloud()
    .size([width, height])
    .words(words)
    .padding(2)
    .rotate(() => 0)
    .font("sans-serif")
    .fontSize(d => d.size)
    .on("end", (drawn) => {
      const svg = d3.select(els.cloud)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

      const g = svg.append("g")
        .attr("transform", `translate(${width / 2},${height / 2})`);

      g.selectAll("text")
        .data(drawn)
        .enter()
        .append("text")
        .style("font-size", d => `${d.size}px`)
        .style("font-family", "sans-serif")
        .style("fill", (d, i) => color ? color(d.text) : "currentColor")
        .attr("text-anchor", "middle")
        .attr("transform", d => `translate(${d.x},${d.y})rotate(${d.rotate})`)
        .text(d => d.text)
        .append("title")
        .text(d => `${d.text}: ${d.value}`);
    });

  layout.start();
}

/* ---------------------- Export ---------------------- */
function exportSnapshot() {
  const rows = filterReports();
  const counters = buildCounters(rows);
  const { q, institute, yearFrom, yearTo } = getFilters();

  const payload = {
    generatedAt: new Date().toISOString(),
    filters: { q, institute, yearFrom, yearTo },
    total: rows.length,
    topKeywords: topN(counters.kw, 50),
    topBigrams: topN(counters.bg, 50),
    themes: topN(counters.theme, 50),
    fiveYearTopKeywords: (() => {
      const { bins, starts } = buildFiveYearBins(rows);
      const out = {};
      for (const s of starts) out[`${s}-${s + 4}`] = topN(bins.get(s) || new Map(), 20);
      return out;
    })()
  };

  const name = `ri_trends_${yearFrom}-${yearTo}_${institute === "ALL" ? "ALL" : institute}.json`;
  download(name, JSON.stringify(payload, null, 2));
  toast("트렌드 요약을 내보냈습니다");
}

/* ---------------------- Events ---------------------- */
function bindEvents() {
  const rerender = () => {
    // 연도 범위가 뒤집히면 자동으로 보정
    const yf = Number(els.yearFrom.value);
    const yt = Number(els.yearTo.value);
    if (yf > yt) {
      els.yearTo.value = String(yf);
    }
    renderAll();
  };

  if (els.q) els.q.addEventListener("input", () => {
    window.clearTimeout(bindEvents._t);
    bindEvents._t = window.setTimeout(rerender, 180);
  });
  if (els.institute) els.institute.addEventListener("change", rerender);
  if (els.yearFrom) els.yearFrom.addEventListener("change", rerender);
  if (els.yearTo) els.yearTo.addEventListener("change", rerender);

  if (els.resetBtn) els.resetBtn.addEventListener("click", () => {
    els.q.value = "";
    els.institute.value = "ALL";
    // 초기 연도는 전체 범위
    const years = uniq(REPORTS.map(r => Number(r.year)).filter(Boolean)).sort((a, b) => a - b);
    els.yearFrom.value = String(years[0] ?? 2000);
    els.yearTo.value = String(years[years.length - 1] ?? new Date().getFullYear());
    renderAll();
    toast("초기화했습니다");
  });

  if (els.themeToggle) els.themeToggle.addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme || "dark";
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  if (els.cloudPeriod) {
    els.cloudPeriod.addEventListener("change", () => {
      // 기간만 바뀌면 워드클라우드만 업데이트
      renderWordCloud(filterReports());
    });
  }

  if (els.cloudTopN) {
    const update = () => {
      const n = clampInt(els.cloudTopN.value, 10, 200, 50);
      els.cloudTopN.value = String(n);
      renderWordCloud(filterReports());
    };
    // 입력 중에는 debounce
    els.cloudTopN.addEventListener("input", () => {
      window.clearTimeout(bindEvents._cloudT);
      bindEvents._cloudT = window.setTimeout(update, 240);
    });
    els.cloudTopN.addEventListener("change", update);
  }

  if (els.exportBtn) {
    els.exportBtn.addEventListener("click", (e) => {
      e.preventDefault();
      exportSnapshot();
    });
  }
}

/* ---------------------- Responsive reflow ---------------------- */
function bindResponsiveResize() {
  let t = null;
  const handler = () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => {
      if (!LAST_STATE || !LAST_STATE.rows || !LAST_STATE.rows.length) return;

      // Chart.js는 responsive지만, 일부 환경에서 수동 resize가 더 안정적
      for (const k of Object.keys(CHARTS)) {
        try { CHARTS[k]?.resize?.(); } catch {}
      }

      // 크기 의존 SVG/레이아웃은 다시 그리기
      try { renderWordCloud(LAST_STATE.rows); } catch {}
      try { renderCoocNetwork(LAST_STATE.rows, LAST_STATE.counters); } catch {}
      try { renderInstituteHeatmap(LAST_STATE.rows, LAST_STATE.counters); } catch {}
    }, 220);
  };

  window.addEventListener("resize", handler, { passive: true });
  window.addEventListener("orientationchange", handler, { passive: true });
}

/* ---------------------- Boot ---------------------- */
async function main() {
  initTheme();
  const auth = (window.__PORTAL_BOOT__ && window.__PORTAL_BOOT__.auth) || { logged_in: false };
  if (!auth.logged_in) {
    els.hint && (els.hint.textContent = "로그인 후 조회 가능합니다.");
    return;
  }
  try {
    REPORTS = await loadReports();
    initFilters();
    bindEvents();
    bindResponsiveResize();
    renderAll();
  } catch (e) {
    console.error(e);
    els.hint.textContent = `데이터를 불러오지 못했습니다: ${e?.message || e}`;
    toast("데이터 로드 실패");
  }
}

main();


/* ---------------------- Advanced: Burst keywords ---------------------- */
function renderBurst(rows, counters) {
  if (!els.burstChart || !els.burstMeta || !els.burstTable) return;

  // clear
  const tbody = els.burstTable.querySelector("tbody");
  if (tbody) tbody.innerHTML = "";

  if (!rows || !rows.length) {
    els.burstMeta.textContent = "-";
    if (els.burstChart) {
      els.burstChart.replaceWith(els.burstChart.cloneNode(true));
      els.burstChart = $("#burstChart"); // rebind
    }
    return;
  }

  const years = yearsInRange(rows);
  if (years.length < 2) {
    els.burstMeta.textContent = "연도 구간이 너무 짧아 버스트 분석이 어렵습니다.";
    return;
  }

  const yearBase = new Map();
  for (const y of years) yearBase.set(y, counters.byYearCount.get(y) || 0);

  const items = [];
  const minOverall = 4; // 노이즈 컷

  for (const [kw, byYear] of counters.kwByYear.entries()) {
    const overall = counters.kw.get(kw) || 0;
    if (overall < minOverall) continue;

    const rates = years.map((y) => {
      const base = yearBase.get(y) || 0;
      if (!base) return 0;
      return ((byYear.get(y) || 0) / base) * 100; // 100건당
    });

    let bestDelta = -Infinity;
    let bestYear = years[1];
    for (let i = 1; i < rates.length; i++) {
      const d = rates[i] - rates[i - 1];
      if (d > bestDelta) {
        bestDelta = d;
        bestYear = years[i];
      }
    }

    // 최근/초기
    const first = rates[0] || 0;
    const last = rates[rates.length - 1] || 0;

    // 의미 없는 변동 제거(아주 작은 변화)
    if (bestDelta <= 0.2) continue;

    items.push({
      kw,
      bestYear,
      bestDelta,
      first,
      last,
      rates
    });
  }

  items.sort((a, b) => b.bestDelta - a.bestDelta);
  const top20 = items.slice(0, 20);
  const top5 = items.slice(0, 5);

  const { yearFrom, yearTo } = getFilters();
  const rangeLabel = (yearFrom && yearTo) ? `${yearFrom}–${yearTo}` : `${years[0]}–${years[years.length - 1]}`;
  els.burstMeta.textContent = `${rangeLabel} · Top 20(증가폭 기준) · 단위: 100건당 등장`;

  // chart
  if (CHARTS.burst) CHARTS.burst.destroy();
  if (els.burstChart) {
    CHARTS.burst = makeTrendLine(
      els.burstChart,
      years,
      top5.map(it => ({ label: it.kw, values: it.rates.map(v => Math.round(v * 10) / 10) }))
    );
  }

  // table
  if (tbody) {
    tbody.innerHTML = top20.map((it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><span class="badge">${escapeHtml(it.kw)}</span></td>
        <td>${it.bestYear}</td>
        <td>${(Math.round(it.bestDelta * 10) / 10).toFixed(1)}</td>
        <td>${(Math.round(it.first * 10) / 10).toFixed(1)}</td>
        <td>${(Math.round(it.last * 10) / 10).toFixed(1)}</td>
      </tr>
    `).join("");
  }
}

/* ---------------------- Advanced: Co-occurrence network ---------------------- */
function renderCoocNetwork(rows, counters) {
  if (!els.cooc || !els.coocMeta) return;

  if (!rows || !rows.length) {
    els.cooc.innerHTML = `<div class="empty">표시할 데이터가 없습니다.</div>`;
    els.coocMeta.textContent = "-";
    return;
  }

  // d3 필요
  if (!window.d3) {
    els.cooc.innerHTML = `<div class="empty">네트워크 렌더링을 위해 d3가 필요합니다.</div>`;
    els.coocMeta.textContent = "-";
    return;
  }

  const top = topN(counters.kw, 30);
  const vocab = new Set(top.map(([k]) => k));
  const freq = new Map(top);

  const pair = new Map(); // "a|b" -> count
  for (const r of rows) {
    const toks = uniq(tokenize(r.title || "")).filter(t => vocab.has(t));
    if (toks.length < 2) continue;
    toks.sort();
    for (let i = 0; i < toks.length; i++) {
      for (let j = i + 1; j < toks.length; j++) {
        const key = `${toks[i]}|${toks[j]}`;
        pair.set(key, (pair.get(key) || 0) + 1);
      }
    }
  }

  const links = Array.from(pair.entries())
    .map(([k, v]) => {
      const [s, t] = k.split("|");
      return { source: s, target: t, value: v };
    })
    .filter(l => l.value >= 2)  // 너무 약한 연결 제거
    .sort((a, b) => b.value - a.value)
    .slice(0, 220); // 과밀 방지

  const nodes = Array.from(vocab.values()).map(k => ({ id: k, value: freq.get(k) || 0 }));

  els.coocMeta.textContent = `${rows.length.toLocaleString()}건 · 노드 ${nodes.length} · 링크 ${links.length} (Top 30 키워드, 2건 이상 동시출현)`;

  // render
  const wrap = els.cooc;
  wrap.innerHTML = "";
  const width = wrap.clientWidth || 900;
  const height = wrap.clientHeight || 420;

  const svg = d3.select(wrap).append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("max-width", "100%")
    .style("height", "100%");

  const palette = (d3.schemeTableau10 || d3.schemeCategory10 || []).slice();
  const color = d3.scaleOrdinal(palette.length ? palette : undefined);

  const linkScale = d3.scaleLinear()
    .domain([2, d3.max(links, d => d.value) || 2])
    .range([0.6, 3.2]);

  const rScale = d3.scaleSqrt()
    .domain([1, d3.max(nodes, d => d.value) || 1])
    .range([4, 14]);

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(d => 70 - Math.min(40, d.value * 2)))
    .force("charge", d3.forceManyBody().strength(-180))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(d => rScale(d.value) + 6));

  const gLink = svg.append("g").attr("stroke", "currentColor").attr("stroke-opacity", 0.18);

  const link = gLink.selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke-width", d => linkScale(d.value));

  const gNode = svg.append("g");

  const node = gNode.selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("r", d => rScale(d.value))
    .attr("fill", d => color(d.id))
    .attr("stroke", "rgba(0,0,0,0.15)")
    .attr("stroke-width", 1.0)
    .call(d3.drag()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.25).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x; d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      })
    );

  node.append("title").text(d => `${d.id} · ${d.value}회`);

  const label = svg.append("g")
    .selectAll("text")
    .data(nodes)
    .enter()
    .append("text")
    .text(d => d.id)
    .attr("font-size", "11px")
    .attr("fill", "currentColor")
    .attr("opacity", 0.8)
    .attr("pointer-events", "none");

  simulation.on("tick", () => {
    // keep nodes inside the viewport so circles/labels don't get clipped
    const pad = 48;
    nodes.forEach(d => {
      const m = (rScale(d.value) || 10) + pad;
      d.x = Math.max(m, Math.min(width - m, d.x));
      d.y = Math.max(m, Math.min(height - m, d.y));
    });

    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    label
      .attr("x", d => Math.min(width - 8, d.x + 8))
      .attr("y", d => d.y + 4);
  });
}

/* ---------------------- Advanced: Institute keyword heatmap ---------------------- */
function renderInstituteHeatmap(rows, counters) {
  if (!els.instHeatmap || !els.heatMeta) return;

  if (!rows || !rows.length) {
    els.instHeatmap.innerHTML = `<div class="empty">표시할 데이터가 없습니다.</div>`;
    els.heatMeta.textContent = "-";
    return;
  }

  if (!window.d3) {
    els.instHeatmap.innerHTML = `<div class="empty">히트맵 렌더링을 위해 d3가 필요합니다.</div>`;
    els.heatMeta.textContent = "-";
    return;
  }

  // Top institutes (by report count) and Top keywords (overall)
  const instCount = new Map();
  for (const r of rows) {
    const inst = normalizeText(r.institute);
    if (!inst) continue;
    instCount.set(inst, (instCount.get(inst) || 0) + 1);
  }
  const institutes = Array.from(instCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k]) => k);

  const keywords = topN(counters.kw, 20).map(([k]) => k);
  const kwSet = new Set(keywords);

  // matrix: rate per 100 reports in institute
  const matrix = [];
  const byInstKw = new Map(); // inst -> Map(kw -> count)
  for (const inst of institutes) byInstKw.set(inst, new Map());

  for (const r of rows) {
    const inst = normalizeText(r.institute);
    if (!byInstKw.has(inst)) continue;
    const toks = tokenize(r.title || "");
    const m = byInstKw.get(inst);
    for (const t of toks) {
      if (!kwSet.has(t)) continue;
      m.set(t, (m.get(t) || 0) + 1);
    }
  }

  let vmax = 0;
  for (const inst of institutes) {
    const base = instCount.get(inst) || 1;
    const m = byInstKw.get(inst);
    for (const kw of keywords) {
      const v = ((m.get(kw) || 0) / base) * 100;
      vmax = Math.max(vmax, v);
      matrix.push({ inst, kw, value: v });
    }
  }

  const { yearFrom, yearTo } = getFilters();
  const rangeLabel = (yearFrom && yearTo) ? `${yearFrom}–${yearTo}` : "전체 기간";
  els.heatMeta.textContent = `${rangeLabel} · Top 12 기관 × Top 20 키워드 · 단위: 100건당 등장`;

  // render
  const wrap = els.instHeatmap;
  wrap.innerHTML = "";

  const width = wrap.clientWidth || 980;
  const height = wrap.clientHeight || 420;

  const maxKwLen = Math.max(6, ...keywords.map(k => String(k ?? "").length));
  // Make keyword labels fit: smaller font + steeper rotation + enough top margin
  const labelFont = maxKwLen >= 14 ? 7 : (maxKwLen >= 10 ? 8 : 10);
  const labelRotate = maxKwLen >= 14 ? -75 : (maxKwLen >= 10 ? -65 : -45);
  const margin = { top: maxKwLen >= 14 ? 180 : (maxKwLen >= 10 ? 160 : 120), right: 16, bottom: 10, left: 140 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const cellW = Math.max(10, innerW / keywords.length);
  const cellH = Math.max(18, innerH / institutes.length);

  const svg = d3.select(wrap).append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMinYMin meet")
    .style("overflow", "visible");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(keywords).range([0, innerW]).padding(0.04);
  const y = d3.scaleBand().domain(institutes).range([0, innerH]).padding(0.06);

  const color = d3.scaleSequential(d3.interpolateBlues).domain([0, vmax || 1]);

  g.selectAll("rect")
    .data(matrix)
    .enter()
    .append("rect")
    .attr("x", d => x(d.kw))
    .attr("y", d => y(d.inst))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", 3)
    .attr("fill", d => color(d.value))
    .attr("stroke", "rgba(0,0,0,0.08)")
    .append("title")
    .text(d => `${d.inst}\n${d.kw}: ${(Math.round(d.value * 10) / 10).toFixed(1)} (100건당)`);

  // keyword labels (top):
  // IMPORTANT: do NOT set per-label x in both attribute and transform.
  // If x is set before a rotate transform, labels drift upward as x grows.
  const xLabels = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xTicks = xLabels.selectAll("g")
    .data(keywords)
    .enter()
    .append("g")
    // place each tick at its x position first, then rotate text around that local origin
    .attr("transform", d => `translate(${x(d) + x.bandwidth() / 2},0)`);

  xTicks.append("text")
    .attr("x", 0)
    .attr("y", -8)
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "central")
    .attr("transform", `rotate(${labelRotate})`)
    .attr("font-size", `${labelFont}px`)
    .attr("fill", "currentColor")
    .attr("opacity", 0.85)
    .text(d => d);

  svg.append("g")
    .attr("transform", `translate(${margin.left - 8},${margin.top})`)
    .selectAll("text")
    .data(institutes)
    .enter()
    .append("text")
    .attr("x", 0)
    .attr("y", d => (y(d) + y.bandwidth() / 2))
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "middle")
    .attr("font-size", "12px")
    .attr("fill", "currentColor")
    .attr("opacity", 0.9)
    .text(d => d);

  // mini legend
  const legendW = 160;
  const legendH = 10;
  const lg = svg.append("g").attr("transform", `translate(${width - legendW - 20},${20})`);
  const defs = svg.append("defs");
  const gradId = "heatGrad";
  const grad = defs.append("linearGradient").attr("id", gradId);
  grad.attr("x1", "0%").attr("x2", "100%").attr("y1", "0%").attr("y2", "0%");
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    grad.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", color(t * (vmax || 1)));
  }
  lg.append("rect").attr("width", legendW).attr("height", legendH).attr("rx", 3).attr("fill", `url(#${gradId})`).attr("stroke", "rgba(0,0,0,0.1)");
  lg.append("text").attr("x", 0).attr("y", -6).attr("font-size", "11px").attr("fill", "currentColor").attr("opacity", 0.8).text("0");
  lg.append("text").attr("x", legendW).attr("y", -6).attr("text-anchor", "end").attr("font-size", "11px").attr("fill", "currentColor").attr("opacity", 0.8).text((Math.round((vmax || 0) * 10) / 10).toFixed(1));
}

})();
