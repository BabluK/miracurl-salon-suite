import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Sun, Moon, Sunset, Send, Plus, X, Loader2, Volume2 } from "lucide-react";

export function MorningBriefing() {
  const [brief, setBrief] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [sending, setSending] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [vForm, setVForm] = useState({ name: "", email: "", phone: "", contact_person: "", gst_number: "", address: "", notes: "" });
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceState, setVoiceState] = useState("idle"); // idle | loading | blocked | playing

  const todayKey = `mira_briefing_${new Date().toISOString().slice(0, 10)}`;
  const voiceKey = `mira_voice_${new Date().toISOString().slice(0, 10)}`;

  async function playGreeting(manual = false) {
    setVoiceState("loading");
    try {
      const { data } = await api.get("/reports/morning-briefing/audio");
      const audio = new Audio(`data:audio/mp3;base64,${data.audio_b64}`);
      audio.onended = () => setVoiceState("idle");
      await audio.play();
      setVoiceState("playing");
      localStorage.setItem(voiceKey, "1");
    } catch {
      // autoplay blocked or generation failed — offer manual play
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
      if (r.data.voice_greeting_enabled && !localStorage.getItem(`mira_voice_${new Date().toISOString().slice(0, 10)}`)) {
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

  if (dismissed || !brief) return null;
  const Icon = brief.salutation === "Good Morning" ? Sun : brief.salutation === "Good Afternoon" ? Sunset : Moon;
  const low = brief.low_stock || [];

  function dismiss() {
    localStorage.setItem(todayKey, "1");
    setDismissed(true);
  }

  async function addVendor(e) {
    e.preventDefault();
    try {
      const { data } = await api.post("/vendors", { ...vForm, email: vForm.email.trim() });
      setBrief(b => ({ ...b, vendors: [...b.vendors, data] }));
      setVendorId(data.id);
      setAddOpen(false);
      setVForm({ name: "", email: "", phone: "", contact_person: "", gst_number: "", address: "", notes: "" });
      toast.success(`Vendor ${data.name} added ✦`);
    } catch (err) {
      toast.error(err.response?.data?.detail?.[0]?.msg || err.response?.data?.detail || "Couldn't add vendor");
    }
  }

  async function sendMail() {
    if (!vendorId) { toast.info("Add a vendor first"); return; }
    setSending(true);
    try {
      const { data } = await api.post("/vendors/send-low-stock", { vendor_id: vendorId });
      toast.success(`Restock request for ${data.products} products emailed to ${data.sent_to} ✦`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Email failed");
    } finally { setSending(false); }
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

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none" data-testid="voice-greeting-toggle">
              <button type="button" role="switch" aria-checked={voiceOn} onClick={toggleVoice}
                className={`relative inline-flex h-5 w-9 rounded-full transition ${voiceOn ? "bg-amber-500" : "bg-slate-300"}`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition mt-0.5 ${voiceOn ? "translate-x-4.5 ml-4" : "ml-0.5"}`} />
              </button>
              <span className="text-[11px] text-slate-600 font-medium">Enable Mira AI voice greeting</span>
            </label>
            {voiceState === "loading" && <span className="text-[11px] text-amber-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Mira is warming up…</span>}
            {voiceState === "blocked" && (
              <button data-testid="voice-play-btn" onClick={() => playGreeting(true)}
                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-amber-500 text-white font-medium hover:bg-amber-600">
                <Volume2 className="w-3 h-3" /> Play Mira's greeting
              </button>
            )}
            {voiceState === "playing" && <span className="text-[11px] text-emerald-600 flex items-center gap-1"><Volume2 className="w-3 h-3" /> Mira is speaking…</span>}
          </div>

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

              <div className="flex flex-wrap items-center gap-2 mt-3">
                {brief.vendors.length > 0 && (
                  <select data-testid="briefing-vendor-select" value={vendorId} onChange={e => setVendorId(e.target.value)}
                    className="text-xs px-2 py-2 rounded-lg border border-slate-200 bg-white text-slate-700">
                    {brief.vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.email})</option>)}
                  </select>
                )}
                <button data-testid="briefing-send-mail-btn" onClick={sendMail} disabled={sending || !brief.vendors.length}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-medium disabled:opacity-50">
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Email restock list to vendor
                </button>
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
                  </div>
                );
              })()}

              {addOpen && (
                <form onSubmit={addVendor} className="mt-3 rounded-xl border border-slate-200 bg-white p-3" data-testid="vendor-add-form">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 block mb-0.5">Vendor name <span className="text-rose-500">*</span></label>
                      <input required minLength={2} placeholder="e.g. Beauty Supplies Co." value={vForm.name} onChange={e => setVForm({ ...vForm, name: e.target.value })}
                        data-testid="vendor-name-input" className="w-full text-xs px-2 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 block mb-0.5">Email <span className="text-rose-500">*</span></label>
                      <input required type="email" placeholder="orders@vendor.com" value={vForm.email} onChange={e => setVForm({ ...vForm, email: e.target.value })}
                        data-testid="vendor-email-input" className="w-full text-xs px-2 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 block mb-0.5">Phone</label>
                      <input placeholder="98765 43210" value={vForm.phone} onChange={e => setVForm({ ...vForm, phone: e.target.value })}
                        data-testid="vendor-phone-input" className="w-full text-xs px-2 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 block mb-0.5">Contact person</label>
                      <input placeholder="e.g. Suresh Kumar" value={vForm.contact_person} onChange={e => setVForm({ ...vForm, contact_person: e.target.value })}
                        data-testid="vendor-contact-input" className="w-full text-xs px-2 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 block mb-0.5">GST number</label>
                      <input maxLength={15} placeholder="29ABCDE1234F1Z5" value={vForm.gst_number} onChange={e => setVForm({ ...vForm, gst_number: e.target.value.toUpperCase() })}
                        data-testid="vendor-gst-input" className="w-full text-xs px-2 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 font-mono placeholder:text-slate-400 placeholder:font-sans" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 block mb-0.5">Address</label>
                      <input placeholder="Street, city" value={vForm.address} onChange={e => setVForm({ ...vForm, address: e.target.value })}
                        data-testid="vendor-address-input" className="w-full text-xs px-2 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400" />
                    </div>
                  </div>
                  <button type="submit" data-testid="vendor-save-btn" className="mt-3 text-xs px-4 py-2 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-700">Save vendor</button>
                  <span className="ml-2 text-[10px] text-slate-400">Manage all vendors in Settings → Vendor Details</span>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
