import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Download, Send, RefreshCw, CheckCircle2, Loader2, Gift } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const AUDIENCES = [
  { key: "men", label: "For Men 💈" },
  { key: "women", label: "For Women 💄" },
  { key: "family", label: "Family / Couples 👨‍👩‍👧" },
];

export const MiraPackagesCard = () => {
  const [pkg, setPkg] = useState(null);
  const [busy, setBusy] = useState("");
  const [pct, setPct] = useState("");
  const [validDays, setValidDays] = useState("7");

  useEffect(() => {
    api.get("/mira-packages").then(r => setPkg(r.data.packages[0] || null)).catch(() => {});
  }, []);

  const suggest = async (audience) => {
    setBusy(audience);
    try {
      const { data } = await api.post("/mira-packages/suggest", {
        audience,
        ...(pct ? { discount_pct: Number(pct) } : {}),
        ...(validDays ? { valid_days: Number(validDays) } : {}),
      });
      setPkg(data.package);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Mira couldn't design that — try again");
    } finally { setBusy(""); }
  };

  const publish = async () => {
    setBusy("publish");
    try {
      const { data } = await api.post("/mira-packages/publish", { package_id: pkg.id });
      setPkg(data.package);
      toast.success(data.package.google_post?.ok ? "Poster ready & posted on Google 🎉" : "Poster ready — download & share it 🎉");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't publish — try again");
    } finally { setBusy(""); }
  };

  const shareWA = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(pkg.caption)}`, "_blank", "noopener,noreferrer");
  };

  const published = pkg?.status === "published";
  const savings = pkg ? Math.max(0, pkg.total_value - pkg.package_price) : 0;

  return (
    <div className="bg-gradient-to-br from-[#17141c] to-[#26202b] rounded-2xl border border-fuchsia-300/30 p-5 text-white" data-testid="mira-packages-card">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-fuchsia-300/15 border border-fuchsia-300/40 flex items-center justify-center">
            <Gift className="w-4.5 h-4.5 text-fuchsia-300" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">Mira · Package Builder</div>
            <div className="font-playfair text-lg leading-tight">AI packages for Men & Women ✦</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={validDays} onChange={(e) => setValidDays(e.target.value)} data-testid="package-validity-select"
            className="bg-white/5 border border-white/15 text-white/80 text-xs rounded-full px-3 py-2 focus:outline-none focus:border-fuchsia-300/50 [&>option]:bg-[#17141c]">
            <option value="">No time limit</option>
            {[3, 4, 7, 15, 30].map(d => <option key={d} value={d}>Valid {d} days</option>)}
          </select>
          <select value={pct} onChange={(e) => setPct(e.target.value)} data-testid="package-pct-select"
            className="bg-white/5 border border-white/15 text-white/80 text-xs rounded-full px-3 py-2 focus:outline-none focus:border-fuchsia-300/50 [&>option]:bg-[#17141c]">
            <option value="">Mira decides %</option>
            {[10, 15, 20, 25, 30, 35, 40, 50].map(p => <option key={p} value={p}>{p}% off</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {AUDIENCES.map(a => (
          <button key={a.key} onClick={() => suggest(a.key)} disabled={!!busy} data-testid={`package-suggest-${a.key}-btn`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-fuchsia-300/40 text-sm font-semibold hover:bg-fuchsia-300/10 disabled:opacity-50">
            {busy === a.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-fuchsia-300" />} {a.label}
          </button>
        ))}
      </div>

      {pkg && (
        <div className="mt-4 bg-black/25 border border-white/10 rounded-xl p-4" data-testid="package-result">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="font-playfair text-xl text-fuchsia-200">{pkg.name}</div>
              <div className="text-sm text-white/85 mt-0.5">{pkg.tagline}</div>
              {(pkg.expires_at || pkg.valid_days) && (
                <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/10 border border-red-400/30 text-red-300" data-testid="package-validity-badge">
                  ⏳ {pkg.expires_at ? `Valid till ${new Date(pkg.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : `Valid ${pkg.valid_days} days from publish`}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs text-white/45 line-through">Worth ₹{Math.round(pkg.total_value)}</div>
              <div className="text-2xl font-bold text-fuchsia-200">₹{Math.round(pkg.package_price)}</div>
              {savings > 0 && <div className="text-[11px] text-emerald-300">You save ₹{Math.round(savings)} ({pkg.discount_pct}%)</div>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {pkg.services.map((s, i) => (
              <div key={i} className="text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                {s.name} · <span className="text-white/60">₹{Math.round(s.price)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            {!published ? (
              <button onClick={publish} disabled={!!busy} data-testid="package-publish-btn"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-fuchsia-400 to-pink-300 text-[#17141c] text-sm font-semibold hover:opacity-90 disabled:opacity-60">
                {busy === "publish" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {busy === "publish" ? "Creating poster (~1 min)…" : "Publish — poster + Google post ✦"}
              </button>
            ) : (
              <>
                <div className="inline-flex items-center gap-1.5 text-emerald-300 text-sm font-medium px-1">
                  <CheckCircle2 className="w-4 h-4" /> Published
                </div>
                {pkg.google_post?.ok && (
                  <div className="inline-flex items-center gap-1.5 text-sky-300 text-sm font-medium px-1" data-testid="package-google-posted">
                    <CheckCircle2 className="w-4 h-4" /> Posted on Google
                  </div>
                )}
                {pkg.meta_post?.instagram?.ok && (
                  <div className="inline-flex items-center gap-1.5 text-pink-300 text-sm font-medium px-1" data-testid="package-ig-posted">
                    <CheckCircle2 className="w-4 h-4" /> Instagram
                  </div>
                )}
                {pkg.meta_post?.facebook?.ok && (
                  <div className="inline-flex items-center gap-1.5 text-blue-300 text-sm font-medium px-1" data-testid="package-fb-posted">
                    <CheckCircle2 className="w-4 h-4" /> Facebook
                  </div>
                )}
                {pkg.google_post && !pkg.google_post.ok && (
                  <div className="inline-flex items-center text-white/40 text-xs px-1" title={pkg.google_post.error}>
                    Google post skipped — {String(pkg.google_post.error || "").slice(0, 60)}
                  </div>
                )}
                {pkg.flyer_url && (
                  <a href={`${BACKEND}${pkg.flyer_url}`} download target="_blank" rel="noopener noreferrer" data-testid="package-download-btn"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-fuchsia-400 to-pink-300 text-[#17141c] text-sm font-semibold hover:opacity-90">
                    <Download className="w-4 h-4" /> Download poster
                  </a>
                )}
              </>
            )}
            <button onClick={shareWA} data-testid="package-wa-btn"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#25D366]/15 border border-[#25D366]/40 text-[#4be588] text-sm font-medium hover:bg-[#25D366]/25">
              <Send className="w-4 h-4" /> Share on WhatsApp
            </button>
          </div>
          {published && (
            <p className="text-[11px] text-white/45 mt-2">Tip: download the poster, then open WhatsApp → <b>Status</b> → add the poster with the shared caption ✦</p>
          )}
        </div>
      )}
    </div>
  );
};
