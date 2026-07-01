import { useEffect, useState } from "react";
import { Download, X, Share, Smartphone } from "lucide-react";

/**
 * Smart PWA install banner shown on the customer booking page.
 * - On Chrome/Edge/Android: captures the browser's beforeinstallprompt event
 *   and shows a native install-app button.
 * - On iOS Safari: shows an "Add to Home Screen" mini-tutorial (Apple doesn't
 *   fire beforeinstallprompt, so we fall back to human instructions).
 * - Hides forever after user installs OR dismisses (localStorage flag).
 * - Never shown when the site is already opened as an installed PWA.
 */
export default function InstallAppPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    // If already installed / running in standalone mode → never show
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true;
    if (isStandalone) return;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem("miracurl_pwa_install_dismissed") === "1";
    } catch (e) {
      console.warn("[InstallAppPrompt] localStorage read failed:", e);
    }
    if (dismissed) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (isIos) {
      // Show iOS tutorial after 4 seconds so it doesn't feel intrusive
      const t = setTimeout(() => setVisible(true), 4000);
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        clearTimeout(t);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    try { localStorage.setItem("miracurl_pwa_install_dismissed", "1"); } catch (e) { console.warn(e); }
    setVisible(false);
  }

  async function install() {
    if (!deferred) {
      // iOS path — show the manual instructions overlay instead
      setShowIosGuide(true);
      return;
    }
    deferred.prompt();
    const result = await deferred.userChoice;
    if (result.outcome === "accepted") {
      dismiss(); // remember they installed so we don't nag
    }
    setDeferred(null);
  }

  if (!visible) return null;

  return (
    <>
      <div
        className="fixed bottom-4 left-4 right-4 z-40 rounded-2xl shadow-2xl bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white p-4 sm:max-w-sm sm:left-auto sm:right-4 animate-slide-up"
        data-testid="pwa-install-banner"
      >
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold leading-tight">Install Miracurl on your phone</div>
            <p className="text-[11px] text-white/85 mt-1 leading-snug">
              Book faster next time, get reminders, and skip the browser bar. Free ✦
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={install}
                data-testid="pwa-install-btn"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-rose-600 text-xs font-semibold shadow-sm hover:bg-white/95"
              >
                <Download className="w-3.5 h-3.5" /> Install app
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
          <button
            onClick={dismiss}
            className="text-white/60 hover:text-white flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showIosGuide && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowIosGuide(false)}
          data-testid="pwa-ios-guide"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-rose-500 to-fuchsia-600 flex items-center justify-center text-white text-2xl font-bold mb-3">M</div>
            <h3 className="text-center text-lg font-semibold text-slate-900">Install Miracurl on iPhone</h3>
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
            <button
              onClick={() => { setShowIosGuide(false); dismiss(); }}
              className="mt-6 w-full py-2.5 rounded-lg bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
