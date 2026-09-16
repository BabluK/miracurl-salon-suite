import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { openWhatsApp } from "@/lib/share";
import { Sun, Moon, Sunset, Send, Plus, X, Loader2, Volume2, Mic, MessageCircle, Mail, Bell, Music, CalendarDays, IndianRupee, Package, ClipboardCheck, Play, CheckCircle2, AlertTriangle, ArrowRight, Lightbulb, UserRound, Phone, MapPin } from "lucide-react";
import { MiraAvatar } from "@/components/mira/MiraAvatar";
import { BriefKpi, BriefCard, InitialAvatar, Script, PILL, BTN } from "@/components/briefing/BriefingBits";
import { VendorAddForm } from "@/components/briefing/VendorAddForm";
import { useAuth } from "@/context/AuthContext";

export function MorningBriefing() {
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const [brief, setBrief] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [sending, setSending] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceState, setVoiceState] = useState("idle"); // idle | loading | blocked | playing | listening
  const [lang, setLang] = useState(() => localStorage.getItem("mira_lang") || "en");
  const recRef = useRef(null);
  const audioRef = useRef(null);
  const playLockRef = useRef(false);
  const briefRef = useRef(null);
  const vendorIdRef = useRef("");

  const todayIso = new Date().toISOString().slice(0, 10);
  const isEvening = new Date().getHours() >= 19;
  const todayKey = `mira_briefing_${isEvening ? "eve_" : ""}${todayIso}`;
  const voiceKey = `mira_voice_${isEvening ? "eve_" : ""}${todayIso}`;

  useEffect(() => { briefRef.current = brief; }, [brief]);
  useEffect(() => { vendorIdRef.current = vendorId; }, [vendorId]);

  async function doSendMail() {
    const vid = vendorIdRef.current;
    if (!vid) { toast.info("Add a vendor first"); return; }
    setSending(true);
    try {
      const { data } = await api.post("/vendors/send-low-stock", { vendor_id: vid });
      toast.success(`✅ Mira sent the restock list (${data.products} items) to ${data.sent_to}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Email failed");
    } finally { setSending(false); }
  }

  function doSendWhatsApp() {
    const b = briefRef.current;
    const vendor = b?.vendors?.find(v => v.id === vendorIdRef.current) || b?.vendors?.[0];
    const low = b?.low_stock || [];
    if (!low.length) return;
    const items = low.map(p => `• ${p.name}${p.brand ? ` (${p.brand})` : ""} — only ${p.stock} left`).join("\n");
    const msg = `*Restock request*\n\nHello${vendor?.contact_person ? ` ${vendor.contact_person}` : ""}, the following products are running low. Kindly arrange a fresh supply:\n\n${items}\n\nPlease confirm availability and delivery timeline.\nThank you!`;
    openWhatsApp(msg, vendor?.phone?.replace(/\D/g, "") || "");
    toast.success("✅ Mira opened WhatsApp with the restock list — just hit send");
  }

  function startListening(currentLang) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.info("Voice replies need Chrome — use the Mail / WhatsApp buttons instead"); return; }
    try {
      const rec = new SR();
      recRef.current = rec;
      rec.lang = currentLang === "hi" ? "hi-IN" : "en-IN";
      rec.interimResults = false;
      rec.maxAlternatives = 3;
      setVoiceState("listening");
      const stopAll = () => { setVoiceState("idle"); try { rec.stop(); } catch { /* done */ } };
      const timer = setTimeout(stopAll, 8000);
      rec.onresult = (ev) => {
        clearTimeout(timer);
        const heard = Array.from(ev.results[0]).map(a => a.transcript.toLowerCase()).join(" ");
        setVoiceState("idle");
        if (/whatsapp|whats app|वॉट्स|व्हाट्स/.test(heard)) doSendWhatsApp();
        else if (/mail|email|मेल|ईमेल/.test(heard)) doSendMail();
        else toast.info(`Mira heard "${heard}" — tap Mail or WhatsApp below`);
      };
      rec.onerror = () => { clearTimeout(timer); setVoiceState("idle"); };
      rec.onend = () => { clearTimeout(timer); setVoiceState(s => (s === "listening" ? "idle" : s)); };
      rec.start();
    } catch { setVoiceState("idle"); }
  }

  function stopVoice() {
    try { audioRef.current?.pause(); audioRef.current = null; } catch { /* gone */ }
    try { recRef.current?.abort?.(); recRef.current?.stop?.(); } catch { /* gone */ }
    setVoiceState("idle");
  }

  async function playGreeting(manual = false, useLang = lang) {
    if (playLockRef.current) return; // ignore rapid double-taps
    playLockRef.current = true;
    stopVoice(); // never stack two voices
    setVoiceState("loading");
    try {
      const endpoint = isEvening ? "/reports/evening-briefing/audio" : "/reports/morning-briefing/audio";
      const { data } = await api.get(`${endpoint}?lang=${useLang}`);
      const audio = new Audio(`data:audio/mp3;base64,${data.audio_b64}`);
      audioRef.current = audio;
      audio.onended = () => {
        if (data.ask_restock) startListening(useLang);
        else setVoiceState("idle");
      };
      await audio.play();
      setVoiceState("playing");
      localStorage.setItem(voiceKey, "1");
    } catch {
      setVoiceState(manual ? "idle" : "blocked");
      if (manual) toast.error("Couldn't play the greeting");
    } finally {
      playLockRef.current = false;
    }
  }

  // Stop Mira's voice + mic the moment this component unmounts (e.g. on logout)
  useEffect(() => () => {
    try { audioRef.current?.pause(); audioRef.current = null; } catch { /* gone */ }
    try { recRef.current?.abort?.(); recRef.current?.stop?.(); } catch { /* gone */ }
    try { window.speechSynthesis?.cancel(); } catch { /* n/a */ }
  }, []);

  useEffect(() => {
    if (localStorage.getItem(todayKey)) { setDismissed(true); return; }
    api.get("/reports/morning-briefing").then(r => {
      setBrief(r.data);
      setVoiceOn(!!r.data.voice_greeting_enabled);
      if (r.data.vendors?.length) setVendorId(r.data.vendors[0].id);
      if (r.data.voice_greeting_enabled && !localStorage.getItem(voiceKey)) {
        playGreeting(false);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey]);

  async function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    if (!next) stopVoice(); // turning OFF silences Mira immediately
    try {
      await api.put("/settings/voice-greeting", { enabled: next });
      toast.success(next ? "Mira will greet you aloud on your first login each day ✦" : "Voice greeting turned off");
      // No replay here — she speaks once at login only (localStorage voiceKey guard)
    } catch {
      setVoiceOn(!next);
      toast.error("Couldn't save the preference");
    }
  }

  function switchLang(l) {
    setLang(l);
    localStorage.setItem("mira_lang", l);
    stopVoice();
    toast.success(l === "hi" ? "मीरा अब हिंदी में बोलेगी ✦" : "Mira will speak in English ✦");
  }

  if (dismissed || !brief) return null;
  const Icon = brief.salutation === "Good Morning" ? Sun : brief.salutation === "Good Afternoon" ? Sunset : Moon;
  const low = brief.low_stock || [];
  const st = brief.staff_today || { checked_in: [], not_checked_in: [], on_leave: [] };
  const notif = brief.notifications || { pending_leaves: [], new_bookings_today: 0, new_reviews_today: 0 };
  const hasNotifs = notif.pending_leaves.length > 0 || notif.new_bookings_today > 0 || notif.new_reviews_today > 0;

  function dismiss() {
    localStorage.setItem(todayKey, "1");
    setDismissed(true);
  }

  const pendingCount = notif.pending_leaves.length + notif.new_bookings_today + notif.new_reviews_today;
  const sel = brief.vendors.find(v => v.id === vendorId);
  const voiceControls = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-full border border-amber-300 overflow-hidden bg-white" data-testid="mira-lang-toggle">
        <button onClick={() => switchLang("en")} data-testid="mira-lang-en" className={`text-xs px-4 py-2 font-semibold ${lang === "en" ? "bg-[#c99a2e] text-white" : "text-amber-800 hover:bg-amber-50"}`}>English</button>
        <button onClick={() => switchLang("hi")} data-testid="mira-lang-hi" className={`text-xs px-4 py-2 font-semibold ${lang === "hi" ? "bg-[#c99a2e] text-white" : "text-amber-800 hover:bg-amber-50"}`}>हिंदी</button>
      </div>
      {voiceState === "loading" && <span className="text-xs text-amber-600 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mira is warming up…</span>}
      {voiceState === "blocked" && (
        <button data-testid="voice-play-btn" onClick={() => playGreeting(true)} className={`${PILL} bg-[#c99a2e] text-white hover:brightness-110`}>
          <Volume2 className="w-3.5 h-3.5" /> {isEvening ? "Play Mira's evening reflection" : "Play Mira's greeting"}
        </button>
      )}
      {voiceState === "idle" && (
        <button data-testid="voice-replay-btn" onClick={() => playGreeting(true)} title={isEvening ? "Replay Mira's evening reflection" : "Replay Mira's greeting"}
          className={`${PILL} border border-amber-300 bg-white text-amber-800 hover:bg-amber-50`}>
          <Volume2 className="w-3.5 h-3.5" /> Hear it again
        </button>
      )}
      {voiceState === "playing" && (
        <span className="text-xs text-emerald-600 flex items-center gap-1">
          <Volume2 className="w-3.5 h-3.5" /> Mira is speaking…
          <button data-testid="voice-stop-btn" onClick={stopVoice} title="Stop Mira" className="ml-1 text-[10px] px-2 py-0.5 rounded-full border border-emerald-300 text-emerald-700 hover:bg-emerald-50">■ Stop</button>
        </span>
      )}
      {voiceState === "listening" && (
        <span className="text-xs text-rose-600 flex items-center gap-1 animate-pulse" data-testid="mira-listening">
          <Mic className="w-3.5 h-3.5" /> {lang === "hi" ? "मीरा सुन रही है — बोलिए 'मेल' या 'व्हाट्सएप'" : "Mira is listening — say 'Mail' or 'WhatsApp'"}
        </span>
      )}
    </div>
  );

  return (
    <div className="relative overflow-hidden rounded-3xl border border-amber-100 bg-[radial-gradient(120%_120%_at_0%_0%,#fff8ea_0%,#fdf6f2_45%,#fbf0e6_100%)] p-5 sm:p-6 shadow-[0_30px_60px_-40px_rgba(120,80,20,.45)]" data-testid="morning-briefing-card">
      <div className="pointer-events-none absolute -right-24 -bottom-24 w-72 h-72 rounded-full bg-amber-200/30 blur-3xl" />
      <button onClick={dismiss} data-testid="briefing-dismiss-btn" className="absolute top-4 right-4 w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-white/70 flex items-center justify-center z-10"><X className="w-4 h-4" /></button>

      {/* header */}
      <div className="relative flex items-start gap-4">
        <span className="w-16 h-16 rounded-full bg-amber-100/80 text-amber-500 flex items-center justify-center shrink-0 shadow-inner"><Icon className="w-8 h-8" strokeWidth={1.6} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-playfair text-2xl sm:text-4xl text-slate-900 leading-tight" data-testid="briefing-greeting">{brief.salutation}, {brief.name} <span className="text-[#c99a2e]">✦</span></div>
          <p className="text-sm sm:text-base text-slate-500 mt-1">{brief.date_label} <span className="mx-1.5 text-slate-300">•</span> {brief.today_appointments} appointment{brief.today_appointments === 1 ? "" : "s"} today — Here&apos;s your daily briefing.</p>
        </div>
        <Script className="hidden lg:block text-right text-xl xl:text-2xl mr-10 rotate-[-4deg]">“Beautiful Businesses<br />Create Happier People” <span className="not-italic">♡</span></Script>
      </div>

      {/* KPI tiles */}
      <div className="relative mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <BriefKpi icon={CalendarDays} tone="green" to="/appointments" testid="briefing-kpi-appointments" label="Today's Appointments" value={brief.today_appointments} sub={brief.today_appointments ? "Tap to see the day" : "No bookings yet"} />
        <BriefKpi icon={IndianRupee} tone="blue" to="/reports" testid="briefing-kpi-revenue" label="Yesterday's Revenue" value={`₹${Number(brief.yesterday_revenue || 0).toLocaleString("en-IN")}`} sub={brief.yesterday_revenue > 0 ? "Great work!" : "Quiet day — fresh chance today ✦"} />
        <BriefKpi icon={Package} tone="violet" to="/inventory" testid="briefing-kpi-low-stock" label="Low Stock Items" value={low.length} sub={low.length ? "Needs your attention" : "Inventory looks healthy"}
          extra={low.length > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 ring-4 ring-rose-100" />} />
        <BriefKpi icon={ClipboardCheck} tone="rose" to="/staff" testid="briefing-kpi-pending" label="Pending Requests" value={pendingCount} sub="Staff / Approvals" />
      </div>

      {/* Mira suggests + voice */}
      <div className="relative mt-4 grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        {!isEvening ? (
          <BriefCard tone="violet" className="p-4 sm:p-5 flex flex-wrap items-center gap-4" testid="mira-bhakti-suggestion">
            <span className="w-16 h-16 shrink-0"><MiraAvatar size={64} /></span>
            <span className="w-14 h-14 rounded-2xl bg-violet-100 text-violet-600 hidden sm:flex items-center justify-center shrink-0"><Music className="w-6 h-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-playfair text-xl text-slate-900">Mira AI Suggests</span>
              <span className="block text-sm text-slate-700 mt-0.5">{lang === "hi" ? "दिन की शुभ शुरुआत के लिए 30 मिनट भक्ति संगीत?" : "Start the day with 30 minutes of Bhakti songs?"}</span>
              <span className="block text-xs text-slate-400 mt-0.5">A little positivity goes a long way!</span>
            </span>
            <Link to="/entertainment?play=bhakti&timer=30" data-testid="mira-play-bhakti-btn" className={`${BTN} bg-violet-500 hover:bg-violet-600 text-white shadow-[0_10px_24px_-10px_rgba(139,92,246,.9)]`}>
              <Play className="w-4 h-4 fill-current" /> {lang === "hi" ? "अभी चलाओ" : "Play Now"}
            </Link>
          </BriefCard>
        ) : <div className="hidden xl:block" />}
        <BriefCard className="p-4 sm:p-5 flex flex-col justify-center gap-3" testid="briefing-voice-card">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700"><Volume2 className="w-4 h-4 text-violet-500" /> Enable Mira AI voice greeting</span>
            {!isManager && (
              <label className="inline-flex items-center cursor-pointer select-none" data-testid="voice-greeting-toggle">
                <button type="button" role="switch" aria-checked={voiceOn} onClick={toggleVoice} className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${voiceOn ? "bg-[#c99a2e]" : "bg-slate-300"}`}>
                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${voiceOn ? "translate-x-5 ml-0.5" : "ml-0.5"}`} />
                </button>
              </label>
            )}
          </div>
          {voiceControls}
        </BriefCard>
      </div>

      {/* Low stock + checked in */}
      <div className="relative mt-4 grid gap-3 xl:grid-cols-2">
        {low.length === 0 ? (
          <BriefCard tone="green" className="p-4 sm:p-5 flex items-center gap-4" testid="briefing-stock-ok">
            <span className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><CheckCircle2 className="w-6 h-6" /></span>
            <span className="text-sm text-emerald-800">Inventory looks healthy — no product is below its reorder level.</span>
          </BriefCard>
        ) : (
          <BriefCard tone="rose" className="p-4 sm:p-5" testid="briefing-low-stock">
            <div className="flex items-start gap-3">
              <span className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-500 flex items-center justify-center shrink-0"><AlertTriangle className="w-6 h-6" /></span>
              <div className="min-w-0 flex-1">
                <div className="font-playfair text-xl text-rose-600">{low.length} Product{low.length === 1 ? " is" : "s are"} running low</div>
                <p className="text-xs text-slate-600 mt-0.5">Items are at or below their reorder level — consider reordering today.</p>
              </div>
              <Link to="/inventory" data-testid="briefing-view-inventory-btn" className={`${PILL} border border-rose-300 bg-white text-rose-600 hover:bg-rose-50 shrink-0`}>View Inventory <ArrowRight className="w-3.5 h-3.5" /></Link>
            </div>
            <div className="mt-3 grid sm:grid-cols-2 gap-2">
              {low.slice(0, 8).map(p => (
                <div key={p.id} className="rounded-xl bg-white border border-rose-100 px-3 py-2.5 flex items-center gap-3" data-testid={`low-stock-chip-${p.id}`}>
                  <span className="w-9 h-9 rounded-lg bg-rose-50 text-rose-400 flex items-center justify-center shrink-0"><Package className="w-4 h-4" /></span>
                  <span className="min-w-0"><span className="block text-xs font-semibold text-slate-800 uppercase truncate">{p.name}</span><span className="block text-xs text-rose-600 font-medium">{p.stock} left</span></span>
                </div>
              ))}
              {low.length > 8 && <span className="text-xs text-slate-400 self-center px-2">+{low.length - 8} more</span>}
            </div>
          </BriefCard>
        )}

        <BriefCard tone="green" className="p-4 sm:p-5" testid="briefing-staff-status">
          <div className="flex items-start gap-3">
            <span className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0"><CheckCircle2 className="w-6 h-6" /></span>
            <div className="min-w-0 flex-1">
              <div className="font-playfair text-xl text-slate-900">{st.checked_in.length} Checked In</div>
              <p className="text-xs text-slate-600 mt-0.5">{st.checked_in.length ? "Your team has arrived at the salon." : "Nobody has checked in yet."}</p>
            </div>
            <Link to="/attendance" data-testid="briefing-view-attendance-btn" className={`${PILL} border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 shrink-0`}>View All <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          {st.checked_in.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {(st.checked_in_staff?.length ? st.checked_in_staff : st.checked_in.map(n => ({ id: n, name: n }))).slice(0, 8).map((p, i) => (
                <span key={p.id} className="flex items-center gap-2 rounded-xl bg-white border border-emerald-100 px-2.5 py-2" data-testid={`briefing-checked-in-${p.id}`}>
                  {p.photo_url ? <img src={p.photo_url} alt="" className="w-9 h-9 rounded-full object-cover border border-emerald-200 shrink-0" /> : <InitialAvatar name={p.name} i={i} />}
                  <span className="text-xs font-medium text-slate-700 max-w-[90px] truncate">{p.name}</span>
                </span>
              ))}
            </div>
          )}
          {(st.not_checked_in.length > 0 || st.on_leave.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {st.not_checked_in.length > 0 && <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700" title={st.not_checked_in.join(", ")}>⏳ {st.not_checked_in.length} not in yet{st.not_checked_in.length <= 3 ? `: ${st.not_checked_in.join(", ")}` : ""}</span>}
              {st.on_leave.length > 0 && <span className="text-[11px] px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-700">🌴 On leave: {st.on_leave.join(", ")}</span>}
            </div>
          )}
        </BriefCard>
      </div>

      {hasNotifs && (
        <BriefCard tone="sky" className="relative mt-4 px-4 py-3" testid="briefing-notifications">
          <div className="text-xs font-semibold text-sky-800 flex items-center gap-1.5 mb-1"><Bell className="w-3.5 h-3.5" /> Mira noticed for you:</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-700">
            {notif.pending_leaves.length > 0 && <div data-testid="notif-pending-leaves">📋 {notif.pending_leaves.length} leave request{notif.pending_leaves.length > 1 ? "s" : ""} waiting — {notif.pending_leaves.slice(0, 3).map(p => p.staff_name).join(", ")} <Link to="/staff" className="ml-1 text-sky-600 font-medium hover:underline">Review →</Link></div>}
            {notif.new_bookings_today > 0 && <div data-testid="notif-new-bookings">📅 {notif.new_bookings_today} new booking{notif.new_bookings_today > 1 ? "s" : ""} today <Link to="/appointments" className="ml-1 text-sky-600 font-medium hover:underline">View →</Link></div>}
            {notif.new_reviews_today > 0 && <div data-testid="notif-new-reviews">⭐ {notif.new_reviews_today} new review{notif.new_reviews_today > 1 ? "s" : ""} today <Link to="/reviews" className="ml-1 text-sky-600 font-medium hover:underline">Read →</Link></div>}
          </div>
        </BriefCard>
      )}

      {/* Mira asks */}
      {low.length > 0 && (
        <BriefCard tone="amber" className="relative mt-4 p-4 sm:p-5" testid="mira-ask-panel">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0"><Lightbulb className="w-6 h-6" /></span>
            <p className="text-sm text-slate-700 flex-1 min-w-[200px]"><b className="text-amber-700">Mira asks:</b> {lang === "hi" ? "क्या मैं यह रीस्टॉक लिस्ट वेंडर को भेज दूं — मेल या व्हाट्सएप?" : "Should I send this restock list to your vendor — by Mail or WhatsApp?"}</p>
            <Link to="/settings#vendors" data-testid="briefing-manage-vendors-btn" className={`${PILL} border border-amber-300 bg-white text-amber-800 hover:bg-amber-50`}>Manage Vendors <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {brief.vendors.length > 0 && (
              <select data-testid="briefing-vendor-select" value={vendorId} onChange={e => setVendorId(e.target.value)}
                className="flex-1 min-w-[220px] text-sm px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-amber-200">
                {brief.vendors.map(v => <option key={v.id} value={v.id}>{`${v.name} (${v.email})`}</option>)}
              </select>
            )}
            <button data-testid="briefing-send-mail-btn" onClick={doSendMail} disabled={sending || !brief.vendors.length} className={`${BTN} bg-rose-500 hover:bg-rose-600 text-white shadow-[0_10px_24px_-10px_rgba(244,63,94,.8)]`}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send Email
            </button>
            {!isManager && (
              <button data-testid="briefing-send-whatsapp-btn" onClick={doSendWhatsApp} disabled={!low.length} className={`${BTN} bg-[#16a34a] hover:bg-emerald-700 text-white shadow-[0_10px_24px_-10px_rgba(22,163,74,.8)]`}>
                <MessageCircle className="w-4 h-4" /> Send WhatsApp
              </button>
            )}
            {!isManager && (
              <button data-testid="mira-mic-btn" onClick={() => startListening(lang)} disabled={voiceState === "listening"} title="Answer Mira by voice — say Mail or WhatsApp"
                className={`${BTN} border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100`}>
                <Mic className="w-4 h-4" /> {voiceState === "listening" ? "Listening…" : "Answer by voice"}
              </button>
            )}
            {brief.vendors.length > 1 && (
              <button data-testid="briefing-send-all-btn" onClick={async () => {
                setSending(true);
                try {
                  const { data } = await api.post("/vendors/send-low-stock-all");
                  toast.success(`Restock lists sent: ${data.sent.map(x => `${x.vendor} (${x.products})`).join(", ")}${data.unassigned_products ? ` · ${data.unassigned_products} untagged` : ""}`);
                } catch (e) { toast.error(e.response?.data?.detail || "Couldn't send"); }
                finally { setSending(false); }
              }} disabled={sending} className={`${BTN} bg-slate-800 hover:bg-slate-700 text-white`}>
                <Send className="w-4 h-4" /> Email all vendors
              </button>
            )}
            <button data-testid="briefing-add-vendor-btn" onClick={() => setAddOpen(!addOpen)} className={`${BTN} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
              <Plus className="w-4 h-4" /> Add Vendor
            </button>
          </div>
          {addOpen && <VendorAddForm onCreated={(v) => { setBrief(b => ({ ...b, vendors: [...b.vendors, v] })); setVendorId(v.id); setAddOpen(false); }} />}
        </BriefCard>
      )}

      {/* footer strip */}
      <div className="relative mt-4 pt-3 border-t border-amber-100 flex flex-wrap items-center justify-between gap-3">
        {sel && low.length > 0 ? (
          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="briefing-vendor-details">
            {sel.contact_person && <span className="inline-flex items-center gap-1.5"><UserRound className="w-3.5 h-3.5 text-[#c99a2e]" /> {sel.contact_person}</span>}
            {sel.phone && <><span className="text-slate-300">|</span><span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-[#c99a2e]" /> {sel.phone}</span></>}
            {sel.gst_number && <><span className="text-slate-300">|</span><span>GST: <span className="font-mono">{sel.gst_number}</span></span></>}
            {sel.address && <><span className="text-slate-300">|</span><span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-[#c99a2e]" /> {sel.address}</span></>}
            {!sel.phone && <span className="text-amber-600">⚠ Add the vendor&apos;s phone in Settings to enable WhatsApp</span>}
          </div>
        ) : <span />}
        <Script className="text-lg sm:text-xl ml-auto">Salon Growth. Simplified. <span className="not-italic">♡</span></Script>
      </div>
    </div>
  );
}
