/* Miracurl boot script — everything that used to be inline in index.html lives here so the page can ship a
   strict Content-Security-Policy without 'unsafe-inline' for scripts. Loaded synchronously in <head>. */
(function () {
  // 1. PWA manifest switch: public guest pages install as "Miracurl Book", everything else as "Miracurl Partner".
  var p = window.location.pathname;
  var pub = ["/book", "/salon", "/demo-slot", "/review", "/order", "/rate", "/feedback", "/gift", "/membership", "/member", "/pay", "/loyalty", "/rewards"];
  var b = pub.some(function (r) { return p === r || p.indexOf(r + "/") === 0; });
  document.write(
    '<link rel="manifest" href="' + (b ? "/manifest.json" : "/manifest-admin.json") + '">' +
    '<link rel="apple-touch-icon" href="' + (b ? "/icon-192.png?v=8" : "/icon-admin-192.png?v=8") + '">' +
    '<link rel="apple-touch-icon" sizes="192x192" href="' + (b ? "/icon-192.png?v=8" : "/icon-admin-192.png?v=8") + '">' +
    '<meta name="apple-mobile-web-app-title" content="' + (b ? "Miracurl Book" : "Miracurl Partner") + '">' +
    '<meta name="application-name" content="' + (b ? "Miracurl Book" : "Miracurl Partner") + '">'
  );

  // 2. Swallow the harmless PerformanceServerTiming DataCloneError some extensions raise.
  window.addEventListener("error", function (e) {
    if (e.error instanceof DOMException && e.error.name === "DataCloneError" && e.message && e.message.includes("PerformanceServerTiming")) {
      e.stopImmediatePropagation(); e.preventDefault();
    }
  }, true);

  function meta(name) { var m = document.querySelector('meta[name="' + name + '"]'); return m ? m.getAttribute("content") : ""; }
  function load(src) { var s = document.createElement("script"); s.async = true; s.src = src; document.head.appendChild(s); }

  // 3. Google Analytics 4 (SPA page views are sent from App.js).
  var ga = meta("ga4-id");
  if (ga && ga.indexOf("%") < 0) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", ga, { send_page_view: false });
    load("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ga));
  }

  // 4. Microsoft Clarity.
  var cl = meta("clarity-project");
  if (cl && cl.indexOf("%") < 0) {
    window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    load("https://www.clarity.ms/tag/" + encodeURIComponent(cl));
  }
})();
