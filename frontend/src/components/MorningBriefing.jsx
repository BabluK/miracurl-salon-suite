import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { openWhatsApp } from "@/lib/share";
import { Sun, Moon, Sunset, Send, Plus, X, Loader2, Volume2, Mic, MessageCircle, Mail, Bell } from "lucide-react";
import { VendorAddForm } from "@/components/briefing/VendorAddForm";

export function MorningBriefing() {
  const [brief, setBrief] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [sending, setSending] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceState, setVoiceState] = useState("idle"); // idle | loading | blocked | playing | listening
  const [lang, setLang] = useState(() => localStorage.getItem("mira_lang") || "en");
  const recRef = useRef(null);
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

  async function playGreeting(manual = false, useLang = lang) {
    setVoiceState("loading");
    try {
      const endpoint = isEvening ? "/reports/evening-briefing/audio" : "/reports/morning-briefing/audio";
      const { data } = await api.get(`${endpoint}?lang=${useLang}`);
      const audio = new Audio(`data:audio/mp3;base64,${data.audio_b64}`);
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
    }
  }

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
    try {
      await api.put("/settings/voice-greeting", { enabled: next });
      toast.success(next ? "Mira will greet you aloud on your first login each day ✦" : "Voice greeting turned off");
      if (next) playGreeting(true);
    } catch {
      setVoiceOn(!next);
      toast.error("Couldn't save the preference");
    }
  }

  function switchLang(l) {
    setLang(l);
    localStorage.setItem("mira_lang", l);
    if (voiceOn) playGreeting(true, l);
    else toast.success(l === "hi" ? "मीरा अब हिंदी में बोलेगी ✦" : "Mira will speak in English ✦");
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

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 p-5 relative" data-testid="morning-briefing-card">
      <button onClick={dismiss} data-testid="briefing-dismiss-btn" className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-playfair text-xl text-slate-800" data-testid="briefing-greeting">
            {brief.salutation}, {brief.name} ✦
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {brief.date_label} · {brief.today_appointments} appointment{brief.today_appointments === 1 ? "" : "s"} today — Mira's daily briefing
          </p>
          <p className="text-sm mt-2" data-testid="briefing-yesterday-revenue">
            {brief.yesterday_revenue > 0 ? (
              <span className="text-slate-700">💰 Yesterday's revenue: <b className="text-emerald-700">₹{Number(brief.yesterday_revenue).toLocaleString("en-IN")}</b> — great work!</span>
            ) : (
              <span className="text-slate-600">Yesterday was quiet on billing — today is a fresh chance to shine ✦</span>
            )}
          </p>

          {/* voice + language controls */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none" data-testid="voice-greeting-toggle">
              <button type="button" role="switch" aria-checked={voiceOn} onClick={toggleVoice}
                className={`relative inline-flex h-5 w-9 rounded-full transition ${voiceOn ? "bg-amber-500" : "bg-slate-300"}`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition mt-0.5 ${voiceOn ? "translate-x-4.5 ml-4" : "ml-0.5"}`} />
              </button>
              <span className="text-[11px] text-slate-600 font-medium">Enable Mira AI voice greeting</span>
            </label>
            <div className="inline-flex rounded-full border border-amber-300 overflow-hidden" data-testid="mira-lang-toggle">
              <button onClick={() => switchLang("en")} data-testid="mira-lang-en"
                className={`text-[11px] px-2.5 py-1 font-medium ${lang === "en" ? "bg-amber-500 text-white" : "text-amber-700 hover:bg-amber-100"}`}>English</button>
              <button onClick={() => switchLang("hi")} data-testid="mira-lang-hi"
                className={`text-[11px] px-2.5 py-1 font-medium ${lang === "hi" ? "bg-amber-500 text-white" : "text-amber-700 hover:bg-amber-100"}`}>हिंदी</button>
            </div>
            {voiceState === "loading" && <span className="text-[11px] text-amber-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Mira is warming up…</span>}
            {voiceState === "blocked" && (
              <button data-testid="voice-play-btn" onClick={() => playGreeting(true)}
                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-amber-500 text-white font-medium hover:bg-amber-600">
                <Volume2 className="w-3 h-3" /> {isEvening ? "Play Mira's evening reflection" : "Play Mira's greeting"}
              </button>
            )}
            {voiceState === "playing" && <span className="text-[11px] text-emerald-600 flex items-center gap-1"><Volume2 className="w-3 h-3" /> Mira is speaking…</span>}
            {voiceState === "listening" && (
              <span className="text-[11px] text-rose-600 flex items-center gap-1 animate-pulse" data-testid="mira-listening">
                <Mic className="w-3 h-3" /> {lang === "hi" ? "मीरा सुन रही है — बोलिए 'मेल' या 'व्हाट्सएप'" : "Mira is listening — say 'Mail' or 'WhatsApp'"}
              </span>
            )}
          </div>

          {/* staff today */}
          {(st.checked_in.length + st.not_checked_in.length + st.on_leave.length) > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3" data-testid="briefing-staff-status">
              {st.checked_in.length > 0 && (
                <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700" title={st.checked_in.join(", ")}>
                  ✅ {st.checked_in.length} checked in
                </span>
              )}
              {st.not_checked_in.length > 0 && (
                <span className="text-[11px] px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700" title={st.not_checked_in.join(", ")}>
                  ⏳ {st.not_checked_in.length} not in yet{st.not_checked_in.length <= 3 ? `: ${st.not_checked_in.join(", ")}` : ""}
                </span>
              )}
              {st.on_leave.length > 0 && (
                <span className="text-[11px] px-2 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-700">
                  🌴 On leave: {st.on_leave.join(", ")}
                </span>
              )}
            </div>
          )}

          {/* notifications Mira detected */}
          {hasNotifs && (
            <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2.5" data-testid="briefing-notifications">
              <div className="text-[11px] font-semibold text-sky-800 flex items-center gap-1.5 mb-1"><Bell className="w-3 h-3" /> Mira noticed for you:</div>
              <div className="space-y-1 text-xs text-slate-700">
                {notif.pending_leaves.length > 0 && (
                  <div data-testid="notif-pending-leaves">
                    📋 {notif.pending_leaves.length} leave request{notif.pending_leaves.length > 1 ? "s" : ""} waiting for approval — {notif.pending_leaves.slice(0, 3).map(p => p.staff_name).join(", ")}
                    <Link to="/staff" className="ml-1.5 text-sky-600 font-medium hover:underline">Review →</Link>
                  </div>
                )}
                {notif.new_bookings_today > 0 && (
                  <div data-testid="notif-new-bookings">📅 {notif.new_bookings_today} new booking{notif.new_bookings_today > 1 ? "s" : ""} came in today
                    <Link to="/appointments" className="ml-1.5 text-sky-600 font-medium hover:underline">View →</Link>
                  </div>
                )}
                {notif.new_reviews_today > 0 && (
                  <div data-testid="notif-new-reviews">⭐ {notif.new_reviews_today} new review{notif.new_reviews_today > 1 ? "s" : ""} today
                    <Link to="/reviews" className="ml-1.5 text-sky-600 font-medium hover:underline">Read →</Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {low.length === 0 ? (
            <p className="text-sm text-emerald-700 mt-3" data-testid="briefing-stock-ok">✅ Inventory looks healthy — no product is below {brief.low_stock_limit} units.</p>
          ) : (
            <div className="mt-3" data-testid="briefing-low-stock">
              <p className="text-sm text-slate-700">
                <b className="text-rose-600">⚠ {low.length} product{low.length === 1 ? " is" : "s are"} running low</b> (below {brief.low_stock_limit} units) — consider reordering today:
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {low.slice(0, 8).map(p => (
                  <span key={p.id} className="text-[11px] px-2 py-1 rounded-full bg-white border border-rose-200 text-rose-700" data-testid={`low-stock-chip-${p.id}`}>
                    {p.name} · {p.stock} left
                  </span>
                ))}
                {low.length > 8 && <span className="text-[11px] text-slate-400 self-center">+{low.length - 8} more</span>}
              </div>

              {/* Mira asks */}
              <div className="mt-3 rounded-xl border border-amber-300 bg-white/70 px-3 py-2.5" data-testid="mira-ask-panel">
                <div className="text-xs text-slate-700 mb-2">
                  <b className="text-amber-700">🎙 Mira asks:</b> {lang === "hi" ? "क्या मैं यह रीस्टॉक लिस्ट वेंडर को भेज दूं — मेल या व्हाट्सएप?" : "Should I send this restock list to your vendor — by Mail or WhatsApp?"}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {brief.vendors.length > 0 && (
                    <select data-testid="briefing-vendor-select" value={vendorId} onChange={e => setVendorId(e.target.value)}
                      className="text-xs px-2 py-2 rounded-lg border border-slate-200 bg-white text-slate-700">
                      {brief.vendors.map(v => <option key={v.id} value={v.id}>{`${v.name} (${v.email})`}</option>)}
                    </select>
                  )}
                  <button data-testid="briefing-send-mail-btn" onClick={doSendMail} disabled={sending || !brief.vendors.length}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-medium disabled:opacity-50">
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Mail
                  </button>
                  <button data-testid="briefing-send-whatsapp-btn" onClick={doSendWhatsApp} disabled={!low.length}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium disabled:opacity-50">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </button>
                  <button data-testid="mira-mic-btn" onClick={() => startListening(lang)} disabled={voiceState === "listening"}
                    title="Answer Mira by voice — say Mail or WhatsApp"
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-amber-400 text-amber-700 hover:bg-amber-50 font-medium disabled:opacity-50">
                    <Mic className="w-3.5 h-3.5" /> {voiceState === "listening" ? "Listening…" : "Answer by voice"}
                  </button>
                  {brief.vendors.length > 1 && (
                    <button data-testid="briefing-send-all-btn" onClick={async () => {
                      setSending(true);
                      try {
                        const { data } = await api.post("/vendors/send-low-stock-all");
                        toast.success(`Restock lists sent: ${data.sent.map(s => `${s.vendor} (${s.products})`).join(", ")}${data.unassigned_products ? ` · ${data.unassigned_products} untagged` : ""}`);
                      } catch (e) { toast.error(e.response?.data?.detail || "Couldn't send"); }
                      finally { setSending(false); }
                    }} disabled={sending}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium disabled:opacity-50">
                      <Send className="w-3.5 h-3.5" /> Email all vendors
                    </button>
                  )}
                  <button data-testid="briefing-add-vendor-btn" onClick={() => setAddOpen(!addOpen)}
                    className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-white">
                    <Plus className="w-3.5 h-3.5" /> Add vendor
                  </button>
                </div>

                {(() => {
                  const sel = brief.vendors.find(v => v.id === vendorId);
                  if (!sel) return null;
                  return (
                    <div className="mt-2 text-[11px] text-slate-500 flex flex-wrap gap-x-4 gap-y-0.5" data-testid="briefing-vendor-details">
                      {sel.contact_person && <span>👤 {sel.contact_person}</span>}
                      {sel.phone && <span>📞 {sel.phone}</span>}
                      {sel.gst_number && <span className="font-mono">GST: {sel.gst_number}</span>}
                      {sel.address && <span>📍 {sel.address}</span>}
                      {!sel.phone && <span className="text-amber-600">⚠ Add the vendor's phone in Settings to enable WhatsApp</span>}
                    </div>
                  );
                })()}
              </div>

              {addOpen && (
                <VendorAddForm
                  onCreated={(v) => { setBrief(b => ({ ...b, vendors: [...b.vendors, v] })); setVendorId(v.id); setAddOpen(false); }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
