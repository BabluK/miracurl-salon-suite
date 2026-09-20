import { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { MessageCircle, Users, Mail, Send, Clock, Sparkles, ImageIcon, X, ArrowRight, History, Loader2, Upload } from "lucide-react";
import { PhonePreview, CampaignHistory, Step, MiraDrafts, RepliesInbox } from "./WaCampaignBits";
import { useAuth } from "@/context/AuthContext";

const TEMPLATES = {
  festive: { label: "Festival Offer", offer_type: "festive", brief: "Festive season offer with a flat discount on hair, skin and nail services + special festive packages" },
  promo: { label: "General Promo", offer_type: "discount", brief: "Limited-period promo on our most popular services" },
  rebook: { label: "Rebooking", offer_type: "winback", brief: "Friendly reminder that it's time for their next visit; make rebooking effortless" },
  loyalty: { label: "Loyalty", offer_type: "general", brief: "Thank loyal guests and share a members-only perk" },
  thankyou: { label: "Thank You", offer_type: "thankyou", brief: "❤️ To our wonderful {salon} family, thank you for your trust, love and continued support. Every visit means so much to us. ✨ With gratitude, {salon}, {city}. No offer — pure gratitude; the sign-off line is the only thing to fill" },
  custom: { label: "Custom Message", offer_type: "general", brief: "" },
};

export default function WaCampaignPage({ selectedCustomers, onViewCustomers }) {
  const { tenant } = useAuth();
  const [status, setStatus] = useState(null);
  const [counts, setCounts] = useState({ all: 0, loyal: 0 });
  const [audience, setAudience] = useState(selectedCustomers.length ? "selected" : "all");
  const [autoBatch, setAutoBatch] = useState(true);
  const [batchMode, setBatchMode] = useState("hourly");
  const [batchTime, setBatchTime] = useState("23:00");
  const [batchTz, setBatchTz] = useState("Asia/Kolkata");
  const [advice, setAdvice] = useState(null);
  const [cta, setCta] = useState(null);
  const [ctaPhone, setCtaPhone] = useState("");
  const [ctaBusy, setCtaBusy] = useState(false);
  const saveCta = (mode) => {
    setCtaBusy(true);
    api.put("/whatsapp-link/cta", { mode, phone: ctaPhone || cta?.phone || "" })
      .then(r => { setCta(r.data); toast.success(mode === "call" ? (r.data.live ? "Campaign button is now Call now ✦" : "Call-now button submitted to Meta — usually approved within minutes. Book Now is used until then.") : "Campaign button is Book Now"); })
      .catch(e => toast.error(e.response?.data?.detail || "Couldn't update the button")).finally(() => setCtaBusy(false));
  };
  const audienceTotal = audience === "all" ? counts.all_total : audience === "loyal" ? counts.loyal_total : audience === "fresh" ? counts.fresh_total : 0;
  const canBatch = ["all", "loyal", "fresh"].includes(audience) && audienceTotal > (counts.per_send_limit || 500);
  const [tpl, setTpl] = useState("festive");
  const [brief, setBrief] = useState(TEMPLATES.festive.brief);
  const [discount, setDiscount] = useState(20);
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [cands, setCands] = useState([]);
  const [when, setWhen] = useState("now");
  const [schedAt, setSchedAt] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [busy, setBusy] = useState("");
  const [camps, setCamps] = useState(null);
  const [fest, setFest] = useState(null);
  const [festPick, setFestPick] = useState("");
  const [meta, setMeta] = useState({ festival: "", offer: "", valid_till: "" });
  const [showHistory, setShowHistory] = useState(false);
  const [showInbox, setShowInbox] = useState(() => new URLSearchParams(window.location.search).get("inbox") === "1");

  const loadCamps = () => api.get("/whatsapp-link/campaigns").then(r => setCamps(r.data)).catch(() => {});
  useEffect(() => {
    api.get("/whatsapp-link/status").then(r => setStatus(r.data)).catch(() => setStatus({ available: false }));
    api.get("/whatsapp-link/audience-counts").then(r => setCounts(r.data))
      .catch(e => toast.error(`Couldn't load your guest counts: ${e.response?.data?.detail || e.message}`));
    api.get("/whatsapp-link/festivals").then(r => { const d = { ...r.data, today: r.data.today && (r.data.today.day || 1) <= 1 ? r.data.today : null }; setFest(d); const f = d.today || d.upcoming?.[0] || d.next; if (f) setFestPick(f.name); }).catch(() => {});
    api.get("/whatsapp-link/batch-settings").then(r => { setBatchMode(r.data.batch_mode); setBatchTime(r.data.batch_time); setBatchTz(r.data.timezone); setAdvice(r.data.advice || null); setCta(r.data.cta || null); setCtaPhone(r.data.cta?.phone || ""); }).catch(() => {});
    loadCamps();
    const id = setInterval(loadCamps, 15000);
    return () => clearInterval(id);
  }, []);

  const recipients = audience === "selected" ? selectedCustomers.length : counts[audience] || 0;
  const usage = camps?.usage;
  const sentToday = usage?.sent ?? 0;
  const linked = !!status?.connected;
  const firstName = useMemo(() => (selectedCustomers[0]?.name || "Priya").split(" ")[0], [selectedCustomers]);

  const pickTemplate = (k) => { setTpl(k); setBrief(TEMPLATES[k].brief); };

  const compose = async (uploaded) => {
    if (!recipients) return toast.error("Pick recipients first");
    const own = uploaded || (image?.id?.startsWith("upload:") ? image : null);
    setBusy("mira");
    if (own) toast.message("Mira is reading your image ✦", { description: "She'll write the message to match what's in it." });
    try {
      const { data } = await api.post("/whatsapp-link/campaigns/compose", {
        audience, customer_ids: selectedCustomers.map(c => c.id), brief: tpl === "festive" && festPick ? `${brief} — festival: ${festPick}` : brief,
        offer_type: TEMPLATES[tpl].offer_type, discount_pct: TEMPLATES[tpl].offer_type === "discount" || tpl === "festive" ? discount : null,
        image_url: own?.url || undefined,
      });
      setText(data.text);
      setMeta({ festival: data.festival || "", offer: data.offer || "", valid_till: data.valid_till || "" });
      setCands(c => [...c.filter(x => x.id.startsWith("mira:") || x.id.startsWith("upload:")), ...(data.candidates || []).filter(x => !x.id.startsWith("upload:"))]);
      if (own) setImage(own); else if (!image?.id?.startsWith("mira:")) setImage(data.image); // keep uploads / painted posters
      toast.success(data.why ? `Mira: ${data.why}` : "Mira drafted your campaign ✦");
    } catch (e) { toast.error(e.response?.data?.detail || "Mira couldn't draft this"); }
    finally { setBusy(""); }
  };

  const fileRef = useRef(null);
  const uploadOwn = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) return toast.error("Image too large — max 3 MB");
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/uploads/image?kind=promo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const own = { id: `upload:${data.url}`, label: "Your uploaded image", url: data.url };
      setCands(c => [own, ...c.filter(x => x.id !== own.id)]);
      setImage(own);
      toast.success("Image uploaded ✦");
      if (recipients) await compose(own);
    } catch (err) { toast.error(err.response?.data?.detail || "Upload failed"); }
    finally { setBusy(b => (b === "upload" ? "" : b)); }
  };

  const paintPoster = async () => {
    setBusy("poster");
    toast.message("Mira is painting your poster ✦", { description: "Takes about 20 seconds — the preview updates automatically." });
    try {
      const { data } = await api.post("/whatsapp-link/campaigns/poster", {
        festival: tpl === "festive" ? festPick : "", offer_type: TEMPLATES[tpl].offer_type,
        discount_pct: tpl === "festive" || tpl === "promo" ? discount : null, service_ids: [],
      });
      setImage(data); setCands(c => [data, ...c.filter(x => x.id !== data.id)]);
      toast.success(`Mira painted your ${data.festival || "campaign"} poster ✦`);
    } catch (e) { toast.error(e.response?.data?.detail || "Mira couldn't paint right now"); }
    finally { setBusy(""); }
  };

  const sendTest = async () => {
    if (!text.trim()) return toast.error("Write or generate the message first");
    setBusy("test");
    try {
      const { data } = await api.post("/whatsapp-link/test-send", { phone: testPhone, festival: meta.festival, offer: meta.offer, valid_till: meta.valid_till, image_url: image?.url || null });
      toast.success(data.with_image ? "Test handed to WhatsApp with the image ✦ watching delivery…" : "Test handed to WhatsApp ✦ watching delivery…");
      if (data.message_id) watchDelivery(data.message_id);
    } catch (e) { toast.error(e.response?.data?.detail || "Test failed"); }
    finally { setBusy(""); }
  };

  // Meta reports delivery a few seconds later via webhook — surface it so "sent" never hides a silent skip.
  const watchDelivery = (id) => {
    let tries = 0;
    const tick = async () => {
      tries += 1;
      try {
        const { data } = await api.get(`/whatsapp-link/message-status/${id}`);
        if (data.status === "failed") return toast.error(`WhatsApp did NOT deliver the test (Meta #${data.code}). ${data.hint || ""}`, { duration: 20000 });
        if (data.status === "delivered" || data.status === "read") return toast.success(`Test ${data.status} on your phone ✓`);
      } catch { /* keep polling */ }
      if (tries < 8) setTimeout(tick, 3000);
    };
    setTimeout(tick, 3000);
  };

  const queue = async () => {
    if (!text.trim() || !recipients) return;
    if (when === "later" && !schedAt) return toast.error("Pick a date & time");
    if (!window.confirm(`${when === "later" ? "Schedule" : "Send"} this campaign to ${recipients} guest${recipients === 1 ? "" : "s"} from your salon WhatsApp? Mira sends one every 30–45 s.`)) return;
    setBusy("send");
    try {
      const { data } = await api.post("/whatsapp-link/campaigns", {
        audience, customer_ids: selectedCustomers.map(c => c.id), text, image_url: image?.url || null,
        name: `${TEMPLATES[tpl].label} · ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`,
        scheduled_at: when === "later" ? new Date(schedAt).toISOString() : null,
        auto_batch: canBatch && autoBatch && when !== "later", batch_mode: batchMode, batch_time: batchTime,
        festival: meta.festival || festPick, offer: meta.offer || brief.slice(0, 160), valid_till: meta.valid_till,
        offer_type: TEMPLATES[tpl].offer_type,
      });
      const n = data.auto_batches_scheduled;
      const how = { hourly: "one every hour", daily: `one per day at ${batchTime}`, manual: "waiting for you in Campaign History — release each with “Send this batch now”" }[data.batch_mode || batchMode];
      toast.success(when === "later" ? `Scheduled for ${data.total} guests ✦` : n ? `Queued ${data.total} now + ${n} more batch${n > 1 ? "es" : ""} of 500, ${how} — all ${audienceTotal.toLocaleString("en-IN")} guests covered ✦` : `Queued ${data.total} messages — sending gradually ✦`);
      setText(""); setImage(null); loadCamps(); setShowHistory(true);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't queue"); }
    finally { setBusy(""); }
  };

  return (
    <div className="space-y-5" data-testid="wa-campaign-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-200"><MessageCircle className="w-7 h-7" /></div>
          <div>
            <h1 className="font-playfair text-3xl sm:text-4xl text-slate-900">WhatsApp Campaign</h1>
            <p className="text-slate-500 text-sm mt-1">Connect with your customers. Share offers, updates and keep them coming back!</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:block font-playfair italic text-rose-600 text-lg leading-tight">Happy Clients<br />Beautiful Journeys ♡</div>
          <button onClick={() => setShowInbox(v => !v)} data-testid="wa-campaign-inbox-btn" className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium ${showInbox ? "bg-emerald-600 text-white border-emerald-600" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}><MessageCircle className="w-4 h-4" /> Replies</button>
          <button onClick={() => setShowHistory(v => !v)} data-testid="wa-campaign-history-btn" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"><History className="w-4 h-4" /> {showHistory ? "Hide" : "View"} Campaign History</button>
        </div>
      </div>

      {!linked && status && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800" data-testid="wa-campaign-not-linked">
          WhatsApp messaging isn't available right now — <a href="/settings" className="underline font-semibold">check Settings → WhatsApp messaging</a>.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="wa-campaign-kpis">
        {[
          [Users, "bg-rose-50 text-rose-500", recipients, "Recipients", audience === "selected" ? "Selected customers" : audience === "loyal" ? "Loyal guests (3+ visits)" : audience === "fresh" ? "Not yet messaged (30 days)" : "All customers"],
          [Mail, "bg-emerald-50 text-emerald-600", Math.min(recipients, Math.max(0, (usage?.remaining ?? 200))), "Ready to Send", usage ? `${usage.remaining} left in today's limit` : "…"],
          [Send, "bg-sky-50 text-sky-600", sentToday, "Sent today", usage ? `of ${usage.cap} daily limit` : "…"],
          [Clock, "bg-amber-50 text-amber-600", when === "later" && schedAt ? new Date(schedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Now", "Scheduled Time", when === "later" ? "Scheduled for later" : "Sends as soon as you confirm"],
        ].map(([Icon, tint, v, l, sub]) => (
          <div key={l} className="rounded-2xl bg-white border border-slate-200 p-4 flex items-center gap-3 shadow-sm" data-testid={`wa-kpi-${l.toLowerCase().replace(/\s+/g, "-")}`}>
            <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${tint}`}><Icon className="w-5 h-5" /></div>
            <div className="min-w-0"><div className="text-xl font-bold text-slate-900 truncate">{v}</div><div className="text-xs font-medium text-slate-700">{l}</div><div className="text-[11px] text-slate-400 truncate">{sub}</div></div>
          </div>
        ))}
      </div>

      <MiraDrafts camps={camps} onChange={loadCamps} />
      {camps?.credit_alert && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 text-sm" data-testid="wa-credit-alert">
          <div className="flex-1">
            <div className="font-semibold text-amber-900">⚠️ WhatsApp credits are running low — {camps.credit_alert.credits.toLocaleString("en-IN")} left, but {camps.credit_alert.needed.toLocaleString("en-IN")} guests are still waiting across {camps.credit_alert.pending_batches} batch{camps.credit_alert.pending_batches > 1 ? "es" : ""}.</div>
            <div className="text-xs text-amber-800 mt-0.5">
              {camps.credit_alert.next_batch.covered ? `The next batch (${camps.credit_alert.next_batch.size}) is covered, but later batches will pause.` : `The next batch needs ${camps.credit_alert.next_batch.size} credits and will pause mid-way.`} Top up {camps.credit_alert.short_by.toLocaleString("en-IN")}+ credits so the blast never stalls.
            </div>
          </div>
          <a href="/settings#credits" className="shrink-0 px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700" data-testid="wa-credit-alert-topup">Top up credits</a>
        </div>
      )}
      {showInbox && <RepliesInbox />}
      {showHistory && <CampaignHistory camps={camps} onChange={loadCamps} />}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
        <div className="space-y-4">
          <Step n={1} title={`Select Recipients (${recipients})`} right={<button onClick={onViewCustomers} className="text-xs text-rose-600 font-semibold inline-flex items-center gap-1 hover:underline" data-testid="wa-view-all-customers">View All Customers <ArrowRight className="w-3 h-3" /></button>}>
            <div className="flex gap-4 flex-wrap text-sm" data-testid="wa-audience">
              {[["all", counts.all_total > counts.all ? `All Customers (${counts.all} of ${counts.all_total.toLocaleString("en-IN")} per send)` : `All Customers (${counts.all})`],
                ["fresh", counts.fresh_total > counts.fresh ? `Ready to send — next ${counts.fresh} not yet messaged (${counts.fresh_total.toLocaleString("en-IN")} left)` : `Ready to send — not yet messaged (${counts.fresh ?? 0})`],
                ["loyal", counts.loyal_total > counts.loyal ? `Loyal Customers (${counts.loyal} of ${counts.loyal_total.toLocaleString("en-IN")} per send)` : `Loyal Customers (${counts.loyal})`], ["selected", `Selected Customers (${selectedCustomers.length})`]].map(([k, l]) => (
                <label key={k} className={`inline-flex items-center gap-2 cursor-pointer ${k === "selected" && !selectedCustomers.length ? "opacity-40" : ""}`}>
                  <input type="radio" name="aud" value={k} checked={audience === k} disabled={k === "selected" && !selectedCustomers.length} onChange={() => setAudience(k)} data-testid={`wa-audience-${k}`} className="accent-rose-600 w-4 h-4" /> {l}
                </label>
              ))}
            </div>
            {canBatch && (
              <div className="mt-3 rounded-xl border border-[#b8863b]/25 bg-[#fbf7ee] p-3" data-testid="wa-auto-batch-box">
                <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer" data-testid="wa-auto-batch">
                  <input type="checkbox" checked={autoBatch} onChange={e => setAutoBatch(e.target.checked)} className="mt-0.5 accent-[#b8863b]" />
                  <span><b className="text-slate-800">Auto-batch the rest</b> — send 500 now, then the remaining {(audienceTotal - (counts.per_send_limit || 500)).toLocaleString("en-IN")} guests in batches of 500 until all {audienceTotal.toLocaleString("en-IN")} are covered (needs ≈{audienceTotal.toLocaleString("en-IN")} credits).</span>
                </label>
                {autoBatch && (
                  <div className="mt-2.5 ml-6 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Release the next batches:</span>
                    <select value={batchMode} onChange={e => setBatchMode(e.target.value)} data-testid="wa-batch-mode"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 [&_option]:bg-white [&_option]:text-slate-800">
                      <option value="hourly">Every hour (automatic)</option>
                      <option value="daily">Daily at a fixed time (automatic)</option>
                      <option value="manual">Manually — I'll release each batch</option>
                    </select>
                    {batchMode === "daily" && (
                      <>
                        <input type="time" value={batchTime} onChange={e => setBatchTime(e.target.value)} data-testid="wa-batch-time"
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800" />
                        <span className="text-slate-400">{batchTz.replace("_", " ")} · 500 guests per day{batchTime >= "21:00" || batchTime < "08:00" ? " · tip: 10–11 AM or 6–8 PM gets more opens" : ""}</span>
                      </>
                    )}
                    {batchMode === "manual" && <span className="text-slate-400">Each batch waits in Campaign History with a “Send this batch now” button</span>}
                  </div>
                )}
                {autoBatch && batchMode === "daily" && advice && (
                  <div className="mt-2 ml-6 flex flex-wrap items-center gap-2 text-xs" data-testid="wa-send-time-advice">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 font-semibold"><Sparkles className="w-3 h-3" /> Mira suggests {advice.hour}</span>
                    <span className="text-slate-500">{advice.why}</span>
                    {batchTime !== advice.hour && <button type="button" onClick={() => setBatchTime(advice.hour)} data-testid="wa-use-advice" className="px-2 py-0.5 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700">Use {advice.hour}</button>}
                    {batchTime === advice.hour && <span className="text-emerald-700 font-semibold">✓ using Mira's pick</span>}
                  </div>
                )}
              </div>
            )}
            {audience === "selected" && selectedCustomers.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-slate-500 mb-1.5">Selected Customers</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {selectedCustomers.slice(0, 12).map(c => <span key={c.id} title={c.name} className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-200 to-amber-100 text-rose-800 text-xs font-bold flex items-center justify-center border-2 border-white shadow">{(c.name || "?")[0]}</span>)}
                  {selectedCustomers.length > 12 && <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-1">+{selectedCustomers.length - 12}</span>}
                </div>
              </div>
            )}
          </Step>

          <Step n={2} title="Choose Template or Create Message" right={<button onClick={() => compose()} disabled={!!busy || !linked || !recipients} data-testid="wa-campaign-mira" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50">{busy === "mira" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Let Mira write it</button>}>
            {cta && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 mb-3 flex items-center gap-2 flex-wrap text-xs" data-testid="wa-cta-box">
                <span className="font-semibold text-emerald-900">Message button:</span>
                <button type="button" onClick={() => saveCta("book")} disabled={ctaBusy} data-testid="wa-cta-book"
                  className={`px-2.5 py-1 rounded-full border font-semibold ${cta.mode === "book" ? "bg-emerald-700 text-white border-emerald-700" : "bg-white border-slate-200 text-slate-600"}`}>Book Now → booking page</button>
                <button type="button" onClick={() => (cta.mode === "call" ? null : saveCta("call"))} disabled={ctaBusy} data-testid="wa-cta-call"
                  className={`px-2.5 py-1 rounded-full border font-semibold ${cta.mode === "call" ? "bg-emerald-700 text-white border-emerald-700" : "bg-white border-slate-200 text-slate-600"}`}>Call now → salon number</button>
                {cta.mode !== "call" && <label className="inline-flex items-center gap-1.5 text-slate-600">salon phone
                  <input value={ctaPhone} onChange={e => setCtaPhone(e.target.value)} placeholder="+91 98765 43210" data-testid="wa-cta-phone"
                    className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800" /></label>}
                {cta.mode === "call" && <span className="text-emerald-800" data-testid="wa-cta-live">Guests see a “Call {tenant?.name || "us"}” button → rings {cta.phone}{cta.live ? " · live ✓" : " · awaiting Meta approval (minutes) — Book Now used until then"}</span>}
                <span className="basis-full text-[10px] text-slate-500">The number comes from your salon phone in Settings → Salon profile. Change it there (or here before switching) if a different line should ring.</span>
                {ctaBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />}
              </div>
            )}

            {fest && (fest.today || fest.upcoming?.length > 0) && (
              <div className="rounded-xl bg-gradient-to-r from-amber-50 via-rose-50 to-amber-50 border border-amber-200 px-3 py-2 mb-3 flex items-center gap-3 flex-wrap text-xs" data-testid="wa-festival-radar">
                <span className="font-semibold text-amber-800 inline-flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Mira's festival radar</span>
                {fest.today && <button onClick={() => { pickTemplate("festive"); setFestPick(fest.today.name); }} data-testid="wa-fest-today" className={`px-2.5 py-1 rounded-full border font-semibold ${festPick === fest.today.name && tpl === "festive" ? "bg-rose-600 text-white border-rose-600" : "bg-white border-amber-300 text-slate-700"}`}>{fest.today.emoji} Today · {fest.today.name}{fest.today.day > 1 ? ` (day ${fest.today.day})` : ""}</button>}
                {fest.upcoming?.slice(0, 3).map(f => <button key={f.date} onClick={() => { pickTemplate("festive"); setFestPick(f.name); }} data-testid={`wa-fest-${f.date}`} className={`px-2.5 py-1 rounded-full border ${festPick === f.name && tpl === "festive" ? "bg-rose-600 text-white border-rose-600" : "bg-white border-slate-200 text-slate-600 hover:border-amber-400"}`}>{f.emoji} {f.name} · in {f.days_away}d</button>)}
              </div>
            )}
            <div className="flex gap-2 flex-wrap mb-3" data-testid="wa-templates">
              {Object.entries(TEMPLATES).map(([k, v]) => <button key={k} onClick={() => pickTemplate(k)} data-testid={`wa-template-${k}`} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${tpl === k ? "bg-rose-50 border-rose-300 text-rose-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}>{v.label}</button>)}
              {(tpl === "festive" || tpl === "promo") && (
                <label className="inline-flex items-center gap-1 text-xs text-slate-600">Flat
                  <select value={discount} onChange={e => setDiscount(Number(e.target.value))} data-testid="wa-campaign-discount" className="border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-800 bg-white [&_option]:text-slate-800">{[10, 15, 20, 25, 30, 40, 50].map(v => <option key={v} value={v}>{v}% OFF</option>)}</select>
                </label>
              )}
            </div>
            <input value={brief} onChange={e => setBrief(e.target.value)} placeholder="Tell Mira what this campaign is about…" data-testid="wa-campaign-brief" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 mb-2" />
            <textarea value={text} onChange={e => setText(e.target.value.slice(0, 1024))} rows={7} data-testid="wa-campaign-text" placeholder="Your WhatsApp message will appear here — or type your own. Use {name} for the guest's name." className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 leading-relaxed" />
            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
              <div className="flex gap-3">
                <button onClick={() => setText(t => t + " {name}")} className="hover:text-slate-700">{"{ } Personalize"}</button>
                <button onClick={() => setText(t => t + " ✨")} className="hover:text-slate-700">☺ Emojis</button>
              </div>
              <span>{text.length}/1024</span>
            </div>
          </Step>

          <Step n={3} title="Add Image / Media (Optional)" right={<div className="flex items-center gap-2 flex-wrap justify-end">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={uploadOwn} data-testid="wa-campaign-upload-input" />
            <button onClick={() => fileRef.current?.click()} disabled={!!busy} data-testid="wa-campaign-upload" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:border-emerald-400 disabled:opacity-50">{busy === "upload" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {busy === "upload" ? "Uploading…" : "Upload your image"}</button>
            <button onClick={paintPoster} disabled={!!busy} data-testid="wa-campaign-paint" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#d4af37] to-[#8a6a1c] text-white text-xs font-semibold disabled:opacity-50">{busy === "poster" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />} {busy === "poster" ? "Mira is painting…" : `Paint ${tpl === "festive" && festPick ? festPick : "campaign"} poster`}</button>
          </div>}>
            <div className="flex gap-3 flex-wrap items-start">
              {busy === "poster" ? (
                <div className="w-44 h-64 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-rose-50 flex flex-col items-center justify-center text-center px-3 animate-pulse" data-testid="wa-campaign-painting">
                  <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
                  <div className="text-xs font-semibold text-slate-800 mt-2">Mira is painting your poster…</div>
                  <div className="text-[11px] text-slate-500 mt-1">Model, festive motifs, your offer & logo — about 20 seconds</div>
                </div>
              ) : image ? (
                <div className="relative w-44 rounded-xl overflow-hidden border border-slate-200 bg-slate-50" data-testid="wa-campaign-image">
                  <img src={image.url} alt="" className="w-full h-auto max-h-64 object-contain" />
                  <button onClick={() => setImage(null)} data-testid="wa-campaign-no-image" className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
                  {image.id.startsWith("upload:") && (
                    <button onClick={() => compose(image)} disabled={!!busy} data-testid="wa-campaign-mira-from-image" className="w-full py-1.5 text-[11px] font-semibold bg-emerald-600 text-white inline-flex items-center justify-center gap-1 disabled:opacity-50">
                      {busy === "mira" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Let Mira write from this image
                    </button>
                  )}
                </div>
              ) : (
                <div className="w-36 h-36 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 text-xs" data-testid="wa-campaign-image"><ImageIcon className="w-6 h-6 mb-1" />No image<span className="text-[10px] text-center px-2">Upload yours, let Mira paint, or choose →</span></div>
              )}
              <div className="flex gap-2 flex-wrap max-w-md">
                {cands.map(c => <button key={c.id} onClick={() => setImage(c)} title={c.label} data-testid={`wa-campaign-cand-${c.id.split(":")[0]}`} className={`w-16 h-16 rounded-lg overflow-hidden border-2 ${image?.id === c.id ? "border-emerald-500" : "border-transparent hover:border-slate-300"}`}><img src={c.url} alt="" className="w-full h-full object-cover" onError={() => { setCands(cs => cs.filter(x => x.id !== c.id)); setImage(im => (im?.id === c.id ? null : im)); }} /></button>)}
              </div>
            </div>
          </Step>

          <Step n={4} title="Schedule or Send Now">
            <div className="flex items-center gap-5 flex-wrap text-sm" data-testid="wa-when">
              <label className="inline-flex items-center gap-2 cursor-pointer"><input type="radio" checked={when === "now"} onChange={() => setWhen("now")} data-testid="wa-when-now" className="accent-rose-600 w-4 h-4" /> Send Now</label>
              <label className="inline-flex items-center gap-2 cursor-pointer"><input type="radio" checked={when === "later"} onChange={() => setWhen("later")} data-testid="wa-when-later" className="accent-rose-600 w-4 h-4" /> Schedule for Later</label>
              {when === "later" && <input type="datetime-local" value={schedAt} onChange={e => setSchedAt(e.target.value)} data-testid="wa-schedule-at" className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800" />}
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap mt-4 pt-4 border-t border-slate-100">
              <span className="text-xs text-slate-500">One message every 30–45 s · {usage ? `${usage.remaining} of ${usage.cap} left today` : ""}</span>
              <button onClick={queue} disabled={!!busy || !linked || !text.trim() || !recipients} data-testid="wa-campaign-send" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-md shadow-emerald-200">
                {busy === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {when === "later" ? "Schedule Campaign" : `Send to ${recipients} guest${recipients === 1 ? "" : "s"}`}
              </button>
            </div>
          </Step>
        </div>

        <PhonePreview salon={status?.push_name || "Your salon"} text={text} image={image} firstName={firstName} cta={cta}
          testPhone={testPhone} setTestPhone={setTestPhone} onTest={sendTest} busy={busy === "test"} disabled={!linked || !text.trim()} />
      </div>
    </div>
  );
}
