import { useEffect, useRef, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Download, Send, RefreshCw, CheckCircle2, Zap, ExternalLink } from "lucide-react";
import { POSTER_STYLES, FESTIVAL_STYLES } from "@/lib/posterStyles";
import { useAuth } from "@/context/AuthContext";
import { shareWithPoster } from "@/lib/sharePoster";
import { confirmAsync } from "@/components/ConfirmDialog";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

function OfferBlock({ offer, busy, onAccept, onAnother, onUnlock, onReflyer, onSaveServices, bookingUrl, testPrefix, catalog = [] }) {
  const accepted = offer.status === "accepted";
  const [adjPct, setAdjPct] = useState("");
  const [svcList, setSvcList] = useState(offer.services || []);
  const [svcTouched, setSvcTouched] = useState(false);
  useEffect(() => { setAdjPct(""); setSvcList(offer.services || []); setSvcTouched(false); }, [offer.id, offer.status, offer.services]);
  const effPct = adjPct ? Number(adjPct) : (offer.discount_pct || 0);
  const priceFor = (s) => (adjPct || svcTouched)
    ? Math.max(0, Math.round(s.original_price * (1 - effPct / 100)))
    : Math.round(s.offer_price);
  const removeSvc = (i) => {
    if (svcList.length <= 1) return;
    setSvcList(l => l.filter((_, j) => j !== i));
    setSvcTouched(true);
  };
  const addSvc = (name) => {
    const m = catalog.find(c => c.name === name);
    if (!m || svcList.some(s => s.name === m.name)) return;
    setSvcList(l => [...l, { name: m.name, original_price: m.price, offer_price: m.price * (1 - effPct / 100) }]);
    setSvcTouched(true);
  };
  const shareWA = () => {
    const caption = offer.whatsapp_caption || offer.offer_text;
    if (offer.flyer_url) shareWithPoster(`${BACKEND}${offer.flyer_url}`, caption);
    else window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="mt-4 bg-black/25 border border-white/10 rounded-xl p-4" data-testid={`${testPrefix}-suggestion`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-playfair text-xl text-amber-200">{offer.title}</div>
          <div className="text-sm text-white/85 mt-0.5">{offer.offer_text}</div>
          {offer.tier && (
            <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 border border-white/15 text-white/60" data-testid={`${testPrefix}-tier-badge`}>
              {offer.tier === "premium" ? "✦ Premium strategy" : "✦ Crowd-puller"}{offer.tier_auto ? " · Mira's auto-pick" : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!accepted && offer.services?.length > 0 && (
            <select value={adjPct} onChange={(e) => setAdjPct(e.target.value)} data-testid={`${testPrefix}-adjust-pct`}
              title="Change the discount — prices update instantly"
              className="bg-white/5 border border-amber-300/30 text-amber-200/90 text-xs rounded-full px-3 py-1.5 focus:outline-none focus:border-amber-300/60 [&>option]:bg-[#17141c]">
              <option value="">✎ Adjust %{offer.discount_pct ? ` (Mira: ${offer.discount_pct}%)` : ""}</option>
              {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70].map(p => <option key={p} value={p}>{p}% off</option>)}
            </select>
          )}
          {effPct > 0 && (
            <div className="px-3 py-1.5 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-200 text-sm font-bold whitespace-nowrap" data-testid={`${testPrefix}-pct-badge`}>{effPct}% OFF</div>
          )}
        </div>
      </div>
      {svcList.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          {svcList.map((s, i) => (
            <div key={`${s.name}-${i}`} className="flex items-center gap-1.5 text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-1.5" data-testid={`${testPrefix}-service-price-${i}`}>
              <span>
                {s.name} · <span className="line-through text-white/40">₹{Math.round(s.original_price)}</span>{" "}
                <span className="text-amber-200 font-semibold">₹{priceFor(s)}</span>
              </span>
              {svcList.length > 1 && (
                <button onClick={() => removeSvc(i)} data-testid={`${testPrefix}-service-remove-${i}`}
                  title="Remove this service from the offer"
                  className="text-white/35 hover:text-rose-300 -mr-1 leading-none text-sm">✕</button>
              )}
            </div>
          ))}
          {catalog.length > 0 && svcList.length < 6 && (
            <select value="" onChange={(e) => e.target.value && addSvc(e.target.value)} data-testid={`${testPrefix}-service-add`}
              title="Pick any service from your menu to include in today's offer"
              className="text-xs bg-white/5 border border-dashed border-amber-300/40 text-amber-200/80 rounded-lg px-2.5 py-1.5 focus:outline-none max-w-[220px] [&>option]:bg-[#17141c]">
              <option value="">＋ Add service from menu ({catalog.filter(c => !svcList.some(s => s.name === c.name)).length})</option>
              {catalog.filter(c => !svcList.some(s => s.name === c.name)).map(c => (
                <option key={c.id || c.name} value={c.name}>{c.name} · ₹{Math.round(c.price)}</option>
              ))}
            </select>
          )}
        </div>
      )}
      {accepted && svcTouched && onSaveServices && (
        <div className="mt-2 flex items-center gap-3">
          <button onClick={() => onSaveServices(svcList.map(s => s.name))} disabled={!!busy} data-testid={`${testPrefix}-save-services-btn`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-400/15 border border-emerald-300/40 text-emerald-200 text-xs font-semibold hover:bg-emerald-400/25 disabled:opacity-50">
            {busy === "services" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Save services → booking page
          </button>
          <span className="text-[11px] text-white/45">Poster stays as is — tap "New poster" if you want it redrawn</span>
        </div>
      )}
      {!accepted && (adjPct || svcTouched) && (
        <p className="text-[11px] text-emerald-300/90 mt-2" data-testid={`${testPrefix}-adjust-hint`}>
          ✓ Offer tuned{adjPct ? ` — ${adjPct}% off` : ""}{svcTouched ? " · services updated" : ""} — tap "Yes — use this offer" to lock it in
        </p>
      )}
      <p className="text-xs text-white/55 mt-3 leading-relaxed"><span className="text-amber-300">Why:</span> {offer.reasoning}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {accepted ? (
          <>
            <div className="inline-flex items-center gap-1.5 text-emerald-300 text-sm font-medium px-1">
              <CheckCircle2 className="w-4 h-4" /> Locked in
            </div>
            {bookingUrl && (
              <a href={bookingUrl} target="_blank" rel="noopener noreferrer" data-testid={`${testPrefix}-live-link`}
                className="inline-flex items-center gap-1.5 text-sky-300 text-sm font-medium px-1 hover:underline" title="Open your public booking page — the offer banner shows at the top">
                <ExternalLink className="w-4 h-4" /> Live on booking page
              </a>
            )}
            {offer.google_post?.ok && (
              <div className="inline-flex items-center gap-1.5 text-sky-300 text-sm font-medium px-1" data-testid={`${testPrefix}-google-posted`}>
                <CheckCircle2 className="w-4 h-4" /> Posted on Google
              </div>
            )}
            {offer.meta_post?.instagram?.ok && (
              <div className="inline-flex items-center gap-1.5 text-pink-300 text-sm font-medium px-1" data-testid={`${testPrefix}-ig-posted`}>
                <CheckCircle2 className="w-4 h-4" /> Instagram
              </div>
            )}
            {offer.meta_post?.facebook?.ok && (
              <div className="inline-flex items-center gap-1.5 text-blue-300 text-sm font-medium px-1" data-testid={`${testPrefix}-fb-posted`}>
                <CheckCircle2 className="w-4 h-4" /> Facebook
              </div>
            )}
            {offer.google_post && !offer.google_post.ok && (
              <div className="inline-flex items-center text-white/40 text-xs px-1" title={offer.google_post.error} data-testid={`${testPrefix}-google-skipped`}>
                Google post skipped — {String(offer.google_post.error || "").slice(0, 60)}
              </div>
            )}
            {offer.flyer_url && (
              <a href={`${BACKEND}${offer.flyer_url}`} download target="_blank" rel="noopener noreferrer" data-testid={`${testPrefix}-download-btn`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-300 to-rose-200 text-[#17141c] text-sm font-semibold hover:opacity-90">
                <Download className="w-4 h-4" /> Download poster
              </a>
            )}
            <button onClick={shareWA} data-testid={`${testPrefix}-wa-btn`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#25D366]/15 border border-[#25D366]/40 text-[#4be588] text-sm font-medium hover:bg-[#25D366]/25">
              <Send className="w-4 h-4" /> Share caption
            </button>
            {onReflyer && (
              <button onClick={onReflyer} disabled={!!busy} data-testid={`${testPrefix}-reflyer-btn`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-amber-300/30 text-amber-200/80 text-sm hover:bg-white/10 disabled:opacity-50">
                <Sparkles className={`w-4 h-4 ${busy === "reflyer" ? "animate-spin" : ""}`} />
                {busy === "reflyer" ? "Designing (~1 min)…" : "New poster"}
              </button>
            )}
            {onUnlock && (
              <button onClick={onUnlock} disabled={!!busy} data-testid={`${testPrefix}-unlock-btn`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/15 text-white/70 text-sm hover:bg-white/10 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${busy === "unlock" ? "animate-spin" : ""}`} /> Change offer
              </button>
            )}
          </>
        ) : (
          <>
            <button onClick={() => onAccept(adjPct ? Number(adjPct) : null, svcTouched ? svcList.map(s => s.name) : null)} disabled={!!busy} data-testid={`${testPrefix}-accept-btn`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-300 to-rose-200 text-[#17141c] text-sm font-semibold hover:opacity-90 disabled:opacity-60">
              {busy === "accept" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {busy === "accept" ? "Creating poster (~1 min)…" : "Yes — use this offer ✦"}
            </button>
            {onAnother && (
              <button onClick={onAnother} disabled={!!busy} data-testid={`${testPrefix}-another-btn`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/15 text-white/80 text-sm hover:bg-white/10 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${busy === "another" ? "animate-spin" : ""}`} /> Suggest another
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function MiraDayOffer() {
  const { tenant } = useAuth();
  const isResto = tenant?.business_type === "restaurant";
  const bookingUrl = tenant?.slug ? `${window.location.origin}/book/${tenant.slug}` : null;
  const styleOptions = isResto
    ? POSTER_STYLES.filter(s => !["pink_glam", "bridal_blush", "mens_edge", "rose_wave"].includes(s.key))
    : POSTER_STYLES;
  const [offer, setOffer] = useState(null);
  const [flash, setFlash] = useState({ alert: null, offer: null });
  const [busy, setBusy] = useState("");
  const [pct, setPct] = useState("");
  const [tier, setTier] = useState("");
  const [style, setStyle] = useState("");
  const [svcCatalog, setSvcCatalog] = useState([]);
  const [fest, setFest] = useState(null);
  const autoAsked = useRef(false);

  useEffect(() => {
    api.get("/day-offers/today").then(r => {
      setOffer(r.data.offer);
      setFest(r.data.festival || null);
      if (!r.data.offer && !autoAsked.current) {
        autoAsked.current = true;
        setBusy("suggest");
        api.post("/day-offers/suggest", {})
          .then(res => setOffer(res.data.offer))
          .catch(() => {})
          .finally(() => setBusy(""));
      }
    }).catch(() => {});
    api.get("/day-offers/flash-alert").then(r => setFlash(r.data)).catch(() => {});
    api.get("/services").then(r => setSvcCatalog((r.data || []).filter(s => s.active !== false))).catch(() => {});
  }, []);

  const run = async (action, isFlash = false, pctOverride = null, serviceNames = null) => {
    setBusy(action);
    try {
      if (action === "accept") {
        const target = isFlash ? flash.offer : offer;
        const { data } = await api.post("/day-offers/accept", {
          offer_id: target.id, template: style || null,
          ...(pctOverride ? { discount_pct: pctOverride } : {}),
          ...(serviceNames ? { service_names: serviceNames } : {}),
        });
        if (isFlash) setFlash(f => ({ ...f, offer: data.offer }));
        else setOffer(data.offer);
        toast.success("Offer locked — poster ready! 🎉");
      } else if (action === "flash-suggest") {
        const { data } = await api.post("/day-offers/flash-suggest");
        setFlash(f => ({ ...f, offer: data.offer }));
      } else if (action === "services") {
        const { data } = await api.post("/day-offers/update-services", { service_names: serviceNames });
        setOffer(data.offer);
        toast.success("Offer services updated — live on your booking page ✓");
      } else if (action === "reflyer") {
        const { data } = await api.post("/day-offers/regenerate-flyer", { template: style || null });
        setOffer(data.offer);
        toast.success("Fresh poster ready 🎨");
      } else if (action === "unlock") {
        if (!await confirmAsync("Discard today's locked offer and ask Mira for a new one?")) { setBusy(""); return; }
        await api.post("/day-offers/unlock");
        setOffer(null);
        toast.success("Offer unlocked — ask Mira for a fresh one");
      } else {
        const path = action === "another" ? "/day-offers/suggest-another" : "/day-offers/suggest";
        const { data } = await api.post(path, { ...(pct ? { discount_pct: Number(pct) } : {}), ...(tier ? { tier } : {}) });
        setOffer(data.offer);
      }
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Mira couldn't do that — try again");
    } finally { setBusy(""); }
  };

  const dayName = new Date().toLocaleDateString("en-IN", { weekday: "long" });
  const festToday = fest?.today, festNext = fest?.upcoming;
  const showFlash = flash.alert && (flash.offer || flash.alert.status !== "accepted");

  return (
    <div className="bg-gradient-to-br from-[#17141c] to-[#26202b] rounded-2xl border border-amber-300/30 p-5 text-white shadow-sm" data-testid="mira-day-offer-card">
      {/* ⚡ CCTV flash alert */}
      {showFlash && (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4" data-testid="flash-offer-alert">
          <div className="flex items-center gap-2 text-rose-300 text-sm font-semibold">
            <Zap className="w-4 h-4 animate-pulse" /> Mira spotted {flash.alert.empty_chairs} empty chairs on CCTV
          </div>
          {!flash.offer ? (
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <p className="text-xs text-white/70">Chairs have been sitting idle — want a flash offer for the next 2 hours to pull walk-ins?</p>
              <button onClick={() => run("flash-suggest")} disabled={!!busy} data-testid="flash-offer-create-btn"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600 disabled:opacity-50">
                {busy === "flash-suggest" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {busy === "flash-suggest" ? "Mira is designing…" : "Create flash offer ⚡"}
              </button>
            </div>
          ) : (
            <OfferBlock offer={flash.offer} busy={busy} onAccept={(pct, names) => run("accept", true, pct, names)} catalog={svcCatalog} testPrefix="flash-offer" />
          )}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-300/15 border border-amber-300/40 flex items-center justify-center">
            <Sparkles className="w-4.5 h-4.5 text-amber-300" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">Mira · Offer of the day</div>
            <div className="font-playfair text-lg leading-tight" data-testid="day-offer-heading">
              {festToday ? (
                <>It's {dayName} · <span className="text-amber-300">{festToday.emoji} {festToday.name}{festToday.span > 1 ? ` (day ${festToday.day})` : ""}</span> — let's fill those chairs ✦</>
              ) : festNext ? (
                <>It's {dayName} — <span className="text-amber-300">{festNext.emoji} {festNext.name} {festNext.days_away === 1 ? "tomorrow" : `in ${festNext.days_away} days`}</span>, get them festival-ready ✦</>
              ) : (
                <>It's {dayName} — {["Friday", "Saturday", "Sunday"].includes(dayName) ? "busy day, let's upsell ✦" : "let's fill those chairs ✦"}</>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={style} onChange={(e) => setStyle(e.target.value)} data-testid="day-offer-style-select"
            title="Poster design style"
            className="bg-white/5 border border-white/15 text-white/80 text-xs rounded-full px-3 py-2 focus:outline-none focus:border-amber-300/50 [&_option]:bg-[#17141c] [&_optgroup]:bg-[#17141c]">
            <option value="">🎨 Poster style — surprise me</option>
            {styleOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            <optgroup label="✦ Festival specials">
              {FESTIVAL_STYLES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </optgroup>
          </select>
          {(!offer || offer.status !== "accepted") && (
            <>
              <select value={tier} onChange={(e) => setTier(e.target.value)} data-testid="day-offer-tier-select"
                className="bg-white/5 border border-white/15 text-white/80 text-xs rounded-full px-3 py-2 focus:outline-none focus:border-amber-300/50 [&>option]:bg-[#17141c]">
                <option value="">Mira picks services</option>
                <option value="premium">Premium (Color, Keratin, Botox…)</option>
                <option value="budget">Budget-friendly services</option>
              </select>
              <select value={pct} onChange={(e) => setPct(e.target.value)} data-testid="day-offer-pct-select"
                className="bg-white/5 border border-white/15 text-white/80 text-xs rounded-full px-3 py-2 focus:outline-none focus:border-amber-300/50 [&>option]:bg-[#17141c]">
                <option value="">Mira decides %</option>
                {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(p => <option key={p} value={p}>{`${p}% off`}</option>)}
              </select>
            </>
          )}
          {!offer && (
            <button onClick={() => run("suggest")} disabled={!!busy} data-testid="day-offer-ask-btn"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-300 to-rose-200 text-[#17141c] text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {busy === "suggest" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {busy === "suggest" ? "Mira is thinking…" : "Ask Mira for today's offer"}
            </button>
          )}
        </div>
      </div>

      {offer && <OfferBlock offer={offer} busy={busy} onAccept={(pct, names) => run("accept", false, pct, names)} onAnother={offer.status !== "accepted" ? () => run("another") : null} onUnlock={offer.status === "accepted" ? () => run("unlock") : null} onReflyer={offer.status === "accepted" ? () => run("reflyer") : null} onSaveServices={(names) => run("services", false, null, names)} bookingUrl={bookingUrl} catalog={svcCatalog} testPrefix="day-offer" />}
    </div>
  );
}
