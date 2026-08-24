import { useEffect, useState } from "react";
import log from "@/lib/log";
import { Download, X, Share, Smartphone } from "lucide-react";

const RESHOW_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // dismissed banners return after 3 days

const THEMES = {
  customer: {
    appName: "Miracurl Book",
    title: "Install Miracurl Book",
    subtitle: "Book faster next time, get reminders, and skip the browser bar. Free ✦",
    banner: "bg-gradient-to-br from-violet-500 to-purple-800",
    installBtn: "bg-white text-violet-700 hover:bg-white/95",
    guideIcon: "bg-gradient-to-br from-violet-500 to-purple-800 text-white",
    guideBtn: "bg-violet-600 hover:bg-violet-700",
  },
  app: {
    appName: "Miracurl Partner",
    title: "Install Miracurl Partner",
    subtitle: "Your salon dashboard in one tap — no browser bar, faster startup.",
    banner: "bg-gradient-to-br from-emerald-600 to-emerald-950",
    installBtn: "bg-amber-300 text-emerald-950 hover:bg-amber-200",
    guideIcon: "bg-gradient-to-br from-emerald-600 to-emerald-950 text-amber-300",
    guideBtn: "bg-emerald-700 hover:bg-emerald-800",
  },
};

/**
 * Smart PWA install banner — auto-shows on iPhone AND Android.
 * - Android/Chrome: uses the native install prompt when available, otherwise
 *   shows "Add to Home screen" steps.
 * - iOS Safari: shows the Share → Add to Home Screen tutorial.
 * - Auto-appears 4s after page load on mobile; on desktop only when the
 *   browser says the app is installable.
 * - "Not now" hides it for 3 days (per app), not forever.
 *
 * Props: variant "customer" (booking app) | "app" (business app)
 */
export default function InstallAppPrompt({ variant = "customer" }) {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const t = THEMES[variant] || THEMES.customer;
  const dismissKey = `miracurl_pwa_dismiss_${variant}`;
  const installedKey = `miracurl_pwa_installed_${variant}`;

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true;
    if (isStandalone) return;

    let recentlyDismissed = false;
    let alreadyInstalled = false;
    try {
      const at = parseInt(localStorage.getItem(dismissKey) || "0", 10);
      recentlyDismissed = at > 0 && Date.now() - at < RESHOW_AFTER_MS;
      alreadyInstalled = localStorage.getItem(installedKey) === "1";
    } catch (e) { log.warn("[InstallAppPrompt]", e); }

    const isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent);

    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
      // beforeinstallprompt firing means the browser does NOT have this app
      // installed anymore — clear a stale installed flag.
      try { localStorage.removeItem(installedKey); } catch { /* ignore */ }
      if (!recentlyDismissed && !alreadyInstalled) setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Once installed, remember it — never auto-show this app's banner again.
    const installedHandler = () => {
      try { localStorage.setItem(installedKey, "1"); } catch { /* ignore */ }
      setVisible(false);
    };
    window.addEventListener("appinstalled", installedHandler);

    // Manual trigger (header/profile menu button) — always forces banner up
    const openHandler = () => setVisible(true);
    window.addEventListener("miracurl:open-install", openHandler);

    // Auto-show on every mobile device — don't wait for beforeinstallprompt
    let timer;
    if (isMobile && !recentlyDismissed && !alreadyInstalled) {
      timer = setTimeout(() => setVisible(true), 4000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
      window.removeEventListener("miracurl:open-install", openHandler);
      if (timer) clearTimeout(timer);
    };
  }, [dismissKey, installedKey]);

  function dismiss() {
    try { localStorage.setItem(dismissKey, String(Date.now())); } catch (e) { log.warn(e); }
    setVisible(false);
  }

  async function install() {
    if (!deferred) {
      setShowGuide(true);
      return;
    }
    deferred.prompt();
    const result = await deferred.userChoice;
    if (result.outcome === "accepted") {
      try { localStorage.setItem(installedKey, "1"); } catch { /* ignore */ }
      dismiss();
    }
    setDeferred(null);
    setVisible(false);
  }

  if (!visible) return null;

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <>
      <div
        className={`fixed bottom-4 left-4 right-4 z-40 rounded-2xl shadow-2xl ${t.banner} text-white p-4 sm:max-w-sm sm:left-auto sm:right-4 animate-slide-up`}
        data-testid="pwa-install-banner"
      >
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold leading-tight">{t.title}</div>
            <p className="text-[11px] text-white/85 mt-1 leading-snug">{t.subtitle}</p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={install}
                data-testid="pwa-install-btn"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm ${t.installBtn}`}
              >
                <Download className="w-3.5 h-3.5" /> {isIos ? "Add to Home Screen" : "Install app"}
              </button>
              <button
                onClick={dismiss}
                data-testid="pwa-install-dismiss"
                className="text-[11px] text-white/70 hover:text-white underline underline-offset-2"
              >
                Not now
              </button>
            </div>
          </div>
          <button onClick={dismiss} className="text-white/60 hover:text-white flex-shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowGuide(false)}
          data-testid="pwa-ios-guide"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-2xl font-bold mb-3 ${t.guideIcon}`}>M</div>
            {isIos ? (
              <>
                <h3 className="text-center text-lg font-semibold text-slate-900">Install {t.appName} on iPhone</h3>
                <ol className="mt-4 space-y-3 text-sm text-slate-700">
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">1</span>
                    <span>Tap the <Share className="inline w-4 h-4 mx-1 -mt-1 text-sky-500" /> <b>Share</b> button in Safari&apos;s toolbar</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">2</span>
                    <span>Scroll down and tap <b>&quot;Add to Home Screen&quot;</b></span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">3</span>
                    <span>Tap <b>Add</b> — you&apos;re done! ✨</span>
                  </li>
                </ol>
              </>
            ) : (
              <>
                <h3 className="text-center text-lg font-semibold text-slate-900">Install {t.appName} on Android</h3>
                <ol className="mt-4 space-y-3 text-sm text-slate-700">
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">1</span>
                    <span>Tap the <b>⋮ menu</b> (three dots) in Chrome&apos;s top-right corner</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">2</span>
                    <span>Tap <b>&quot;Add to Home screen&quot;</b> or <b>&quot;Install app&quot;</b></span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">3</span>
                    <span>Tap <b>Install</b> — you&apos;re done! ✨</span>
                  </li>
                </ol>
              </>
            )}
            <button
              onClick={() => { setShowGuide(false); dismiss(); }}
              className={`mt-6 w-full py-2.5 rounded-lg text-white text-sm font-semibold ${t.guideBtn}`}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
