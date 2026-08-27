import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Download, Send, RefreshCw, CheckCircle2, Loader2, Gift, Trash2, Radio } from "lucide-react";
import { POSTER_STYLES, FESTIVAL_STYLES } from "@/lib/posterStyles";
import { shareWithPoster } from "@/lib/sharePoster";
import { confirmAsync } from "@/components/ConfirmDialog";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const AUDIENCES = [
  { key: "men", label: "For Men 💈" },
  { key: "women", label: "For Women 💄" },
  { key: "family", label: "Family / Couples 👨‍👩‍👧" },
];
const RESTO_AUDIENCES = [
  { key: "todays_special", label: "Today's Special 🍽️" },
  { key: "family_combo", label: "Family Combo 👨‍👩‍👧" },
  { key: "happy_hours", label: "Happy Hours ⏰" },
];
const AUDIENCE_LABELS = {
  men: "Men", women: "Women", family: "Family",
  todays_special: "Today's Special", family_combo: "Family Combo", happy_hours: "Happy Hours",
};

export const MiraPackagesCard = ({ isResto = false }) => {
  const [pkg, setPkg] = useState(null);
  const [busy, setBusy] = useState("");
  const [pct, setPct] = useState("");
  const [adjPct, setAdjPct] = useState("");
  const [validDays, setValidDays] = useState("7");
  const [style, setStyle] = useState("");
  const [live, setLive] = useState({ packages: [], max_live: 4 });

  useEffect(() => setAdjPct(""), [pkg?.id, pkg?.status]);

  const loadLive = () => api.get("/mira-packages/live").then(r => setLive(r.data)).catch(() => {});

  useEffect(() => {
    api.get("/mira-packages").then(r => setPkg(r.data.packages[0] || null)).catch(() => {});
    loadLive();
  }, []);

  const removeLive = async (p) => {
    if (!await confirmAsync(`Remove "${p.name}" from your booking page?`)) return;
    setBusy(`remove-${p.id}`);
    try {
      await api.post(`/mira-packages/${p.id}/unpublish`);
      toast.success("Package removed from booking page");
      loadLive();
      if (pkg?.id === p.id) setPkg(null);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't remove — try again");
    } finally { setBusy(""); }
  };

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
      const { data } = await api.post("/mira-packages/publish", {
        package_id: pkg.id, template: style || null,
        ...(adjPct ? { discount_pct: Number(adjPct) } : {}),
      });
      setPkg(data.package);
      loadLive();
      toast.success(data.package.google_post?.ok ? "Poster ready & posted on Google 🎉" : "Poster ready — download & share it 🎉");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't publish — try again");
    } finally { setBusy(""); }
  };

  const shareWA = () => {
    if (pkg.flyer_url) shareWithPoster(`${BACKEND}${pkg.flyer_url}`, pkg.caption);
    else window.open(`https://wa.me/?text=${encodeURIComponent(pkg.caption)}`, "_blank", "noopener,noreferrer");
  };

  const published = pkg?.status === "published";
  const effPct = pkg ? (adjPct ? Number(adjPct) : (pkg.discount_pct || 0)) : 0;
  const effPrice = pkg ? (adjPct ? Math.round(pkg.total_value * (1 - Number(adjPct) / 100)) : Math.round(pkg.package_price)) : 0;
  const savings = pkg ? Math.max(0, Math.round(pkg.total_value) - effPrice) : 0;

  return (
    <div className="bg-gradient-to-br from-[#17141c] to-[#26202b] rounded-2xl border border-fuchsia-300/30 p-5 text-white" data-testid="mira-packages-card">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-fuchsia-300/15 border border-fuchsia-300/40 flex items-center justify-center">
            <Gift className="w-4.5 h-4.5 text-fuchsia-300" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">Mira · {isResto ? "Combo Builder" : "Package Builder"}</div>
            <div className="font-playfair text-lg leading-tight">{isResto ? "AI combos from your menu ✦" : "AI packages for Men & Women ✦"}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={style} onChange={(e) => setStyle(e.target.value)} data-testid="package-style-select"
            title="Poster design style"
            className="bg-white/5 border border-white/15 text-white/80 text-xs rounded-full px-3 py-2 focus:outline-none focus:border-fuchsia-300/50 [&_option]:bg-[#17141c] [&_optgroup]:bg-[#17141c]">
            <option value="">🎨 Poster style — surprise me</option>
            {POSTER_STYLES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            <optgroup label="✦ Festival specials">
              {FESTIVAL_STYLES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </optgroup>
          </select>
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
        {(isResto ? RESTO_AUDIENCES : AUDIENCES).map(a => (
          <button key={a.key} onClick={() => suggest(a.key)} disabled={!!busy} data-testid={`package-suggest-${a.key}-btn`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-fuchsia-300/40 text-sm font-semibold hover:bg-fuchsia-300/10 disabled:opacity-50">
            {busy === a.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-fuchsia-300" />} {a.label}
          </button>
        ))}
      </div>

      {pkg && (
        <div className="mt-4 bg-black/25 border border-white/10 rounded-xl p-4" data-testid="package-result">
          {pkg.auto_suggested && !published && (
            <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-fuchsia-400/10 border border-fuchsia-300/40 text-fuchsia-200" data-testid="package-auto-suggested-badge">
              <Sparkles className="w-3 h-3" /> Mira&apos;s Monday suggestion — approve &amp; publish when ready ✦
            </div>
          )}
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
              <div className="text-2xl font-bold text-fuchsia-200" data-testid="package-eff-price">₹{effPrice}</div>
              {savings > 0 && <div className="text-[11px] text-emerald-300" data-testid="package-savings">You save ₹{savings} ({effPct}%)</div>}
              {!published && (
                <select value={adjPct} onChange={(e) => setAdjPct(e.target.value)} data-testid="package-adjust-pct"
                  title="Change the package discount — price updates instantly"
                  className="mt-1.5 bg-white/5 border border-fuchsia-300/40 text-fuchsia-200/90 text-xs rounded-full px-3 py-1.5 focus:outline-none focus:border-fuchsia-300/70 [&>option]:bg-[#17141c]">
                  <option value="">✎ Adjust %{pkg.discount_pct ? ` (Mira: ${pkg.discount_pct}%)` : ""}</option>
                  {[5, 10, 15, 20, 25, 30, 35, 40, 50, 60].map(p => <option key={p} value={p}>{p}% off</option>)}
                </select>
              )}
            </div>
          </div>
          {!published && adjPct && (
            <p className="text-[11px] text-emerald-300/90 mt-2" data-testid="package-adjust-hint">
              ✓ Package price updated to {adjPct}% off — hit Publish to lock it in
            </p>
          )}
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

      {live.packages.length > 0 && (
        <div className="mt-5 border-t border-white/10 pt-4" data-testid="live-packages-panel">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
              <Radio className="w-4 h-4 text-emerald-300" /> Live on your booking page
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${live.packages.length >= live.max_live ? "bg-red-500/10 border-red-400/40 text-red-300" : "bg-emerald-500/10 border-emerald-400/30 text-emerald-300"}`} data-testid="live-packages-count">
              {live.packages.length}/{live.max_live} live
            </span>
          </div>
          {live.packages.length >= live.max_live && (
            <p className="text-[11px] text-red-300/80 mt-1.5">Limit reached — remove a package below to publish a new one.</p>
          )}
          <div className="mt-3 space-y-2">
            {live.packages.map(p => (
              <div key={p.id} className="flex items-center gap-3 bg-black/25 border border-white/10 rounded-xl px-3 py-2.5" data-testid={`live-package-row-${p.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[11px] text-white/50">
                    {AUDIENCE_LABELS[p.audience] || ""} · ₹{Math.round(p.package_price)}
                    {p.expires_at && <> · till {new Date(p.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</>}
                  </div>
                </div>
                <button onClick={() => removeLive(p)} disabled={!!busy} data-testid={`live-package-remove-${p.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-400/30 text-red-300 text-xs font-medium hover:bg-red-500/20 disabled:opacity-50">
                  {busy === `remove-${p.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
