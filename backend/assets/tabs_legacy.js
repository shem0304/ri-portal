/* tabs_legacy.js
 * ES5-safe tab switching fallback for older browsers (e.g., IE11)
 * - Works even if assets/app.js fails to parse (modern syntax)
 * - Requires window.__PORTAL_BOOT__ injected before this script.
 */
(function () {
  function $(id) { return document.getElementById(id); }
  function hasClass(el, c) { return el && (" " + el.className + " ").indexOf(" " + c + " ") >= 0; }
  function addClass(el, c) { if (!el || hasClass(el, c)) return; el.className = (el.className ? el.className + " " : "") + c; }
  function removeClass(el, c) {
    if (!el) return;
    var s = (" " + el.className + " ").replace(new RegExp(" " + c + " ", "g"), " ");
    el.className = s.replace(/^\s+|\s+$/g, "");
  }
  function toggle(el, c, on) { if (on) addClass(el, c); else removeClass(el, c); }

  function getAuth() {
    var b = window.__PORTAL_BOOT__ || {};
    return b.auth || { logged_in: false };
  }

  function getTabFromUrl() {
    var q = window.location.search || "";
    var m = q.match(/[?&]tab=([^&]+)/);
    if (!m) return "institutes";
    try { return decodeURIComponent(m[1] || "institutes"); } catch (e) { return m[1] || "institutes"; }
  }

  function setUrlTab(tab) {
    var base = window.location.pathname + (window.location.search || "");
    if (base.indexOf("tab=") >= 0) {
      base = base.replace(/tab=[^&]*/g, "tab=" + encodeURIComponent(tab));
    } else {
      base = base + (base.indexOf("?") >= 0 ? "&" : "?") + "tab=" + encodeURIComponent(tab);
    }
    // replaceState가 있으면 URL만 업데이트
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, "", base);
    }
  }

  function guard(tab) {
    var auth = getAuth();
    if ((tab === "reports" || tab === "trends") && !auth.logged_in) {
      // 로그인 페이지로 이동
      var ret = window.location.pathname + (window.location.search || "");
      window.location.href = "./login.php?return=" + encodeURIComponent(ret.replace(/tab=[^&]*/g, "tab=" + encodeURIComponent(tab)));
      return false;
    }
    return true;
  }

  function apply(tab) {
    var isI = (tab === "institutes");
    var isR = (tab === "reports");
    var isT = (tab === "trends");

    toggle($("tabInstitutes"), "active", isI);
    toggle($("tabReports"), "active", isR);
    toggle($("tabTrends"), "active", isT);

    // hidden class
    toggle($("institutesView"), "hidden", !isI);
    toggle($("reportsView"), "hidden", !isR);
    toggle($("trendsView"), "hidden", !isT);

    // aria-selected
    var ti = $("tabInstitutes"), tr = $("tabReports"), tt = $("tabTrends");
    if (ti) ti.setAttribute("aria-selected", isI ? "true" : "false");
    if (tr) tr.setAttribute("aria-selected", isR ? "true" : "false");
    if (tt) tt.setAttribute("aria-selected", isT ? "true" : "false");
  }

  function onReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  onReady(function () {
    // initial apply
    var tab = getTabFromUrl();
    if (!guard(tab)) return;
    apply(tab);

    // wire clicks
    var btnI = $("tabInstitutes");
    var btnR = $("tabReports");
    var btnT = $("tabTrends");

    if (btnI) btnI.onclick = function () { var t = "institutes"; if (!guard(t)) return; setUrlTab(t); apply(t); };
    if (btnR) btnR.onclick = function () { var t = "reports"; if (!guard(t)) return; setUrlTab(t); apply(t); };
    if (btnT) btnT.onclick = function () { var t = "trends"; if (!guard(t)) return; setUrlTab(t); apply(t); };

    // If modern app.js is present and working, it will also bind handlers; that's OK.
  });
})();
