import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Mail, Send, Plus, X, Sparkles, History, BellRing, CheckCircle2, Trash2, RotateCw } from "lucide-react";
import { confirmAsync } from "@/components/ConfirmDialog";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function DemoCampaign() {
  const [pool, setPool] = useState({ leads: [] });
  const [selected, setSelected] = useState({});
  const [manual, setManual] = useState("");
  const [note, setNote] = useState("");
  const [currency, setCurrency] = useState("auto");
  const [vertical, setVertical] = useState("salon");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);
  const [invites, setInvites] = useState([]);
  const [nudging, setNudging] = useState(false);
  const [showAllInvites, setShowAllInvites] = useState(false);

  const loadHistory = () => api.get("/super-admin/demo-campaign/history").then(r => setHistory(r.data.campaigns)).catch(() => {});
  const loadInvites = () => api.get("/super-admin/demo-campaign/invites").then(r => setInvites(r.data.invites)).catch(() => {});
  useEffect(() => {
    api.get("/super-admin/demo-campaign/recipients").then(r => setPool(r.data)).catch(() => toast.error("Couldn't load recipients"));
    loadHistory();
    loadInvites();
    api.post("/super-admin/demo-campaign/mark-seen").catch(() => {});
  }, []);

  const toggle = (r) => setSelected(s => {
    const n = { ...s };
    if (n[r.email]) delete n[r.email]; else n[r.email] = r;
    return n;
  });
  const addManual = () => {
    const em = manual.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) return toast.error("Enter a valid email address");
    setSelected(s => ({ ...s, [em]: { email: em, name: "", salon_name: "" } }));
    setManual("");
  };
  const list = useMemo(() => Object.values(selected), [selected]);

  const send = async () => {
    if (!list.length) return toast.error("Select at least one recipient");
    setSending(true);
    try {
      const r = await api.post("/super-admin/demo-campaign/send", { recipients: list, note, currency, vertical });
      toast.success(`Demo invite sent to ${r.data.sent} owner${r.data.sent === 1 ? "" : "s"}${r.data.failed ? ` · ${r.data.failed} failed` : ""}`);
      if (r.data.failed) {
        const bad = r.data.results.filter(x => !x.sent).map(x => `${x.email}${x.error ? ` — ${x.error}` : ""}`).join(", ");
        toast.error(bad);
      }
      setSelected({}); setNote("");
      loadHistory();
      loadInvites();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't send campaign"); }
    setSending(false);
  };

  const runNudges = async () => {
    setNudging(true);
    try {
      const r = await api.post("/super-admin/demo-campaign/followups/run");
      const { sent, failed, converted_skipped } = r.data;
      toast.success(`Follow-ups: ${sent} reminder${sent === 1 ? "" : "s"} sent${failed ? ` · ${failed} failed` : ""}${converted_skipped ? ` · ${converted_skipped} already converted` : ""}`);
      loadInvites();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't run follow-ups"); }
    setNudging(false);
  };

  const markReplied = async (inv) => {
    try {
      await api.post(`/super-admin/demo-campaign/invites/${inv.id}/mark-replied`);
      loadInvites();
    } catch { toast.error("Couldn't update"); }
  };

  const deleteInvite = async (inv) => {
    if (!await confirmAsync(`Delete invite record for ${inv.email}?`)) return;
    try {
      await api.delete(`/super-admin/demo-campaign/invites/${inv.id}`);
      setInvites(l => l.filter(x => x.id !== inv.id));
      toast.success("Invite record deleted");
    } catch { toast.error("Couldn't delete"); }
  };

  const resendInvite = async (inv) => {
    try {
      await api.post(`/super-admin/demo-campaign/invites/${inv.id}/resend`);
      toast.success(`Invite re-sent to ${inv.email} ✦`);
      loadInvites();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't resend"); }
  };

  const sendSlotPicker = async (inv) => {
    try {
      await api.post(`/super-admin/demo-campaign/${inv.id}/send-slot-picker`);
      toast.success(`Time-picker sent to ${inv.email} — they'll choose a slot ✦`);
      loadInvites();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't send"); }
  };

  const Group = ({ title, icon: I, rows, kind }) => (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.18em] text-[#d4af37]/80 uppercase mb-1.5 flex items-center gap-1.5"><I className="w-3.5 h-3.5" /> {title} ({rows.length})</p>
      <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
        {rows.length === 0 && <p className="text-xs text-slate-500 italic">None found</p>}
        {rows.map(r => (
          <label key={r.email} className="flex items-center gap-2 text-xs text-slate-300 bg-white/5 hover:bg-[#d4af37]/10 border border-white/5 rounded-lg px-2.5 py-1.5 cursor-pointer transition-colors" data-testid={`demo-recipient-${kind}-${r.email}`}>
            <input type="checkbox" checked={!!selected[r.email]} onChange={() => toggle(r)} className="accent-[#d4af37]" />
            <span className="font-medium text-slate-200 truncate">{r.name || r.email}</span>
            <span className="text-slate-500 truncate">{r.email}</span>
            {r.salon_name && <span className="ml-auto text-[10px] text-[#d4af37] shrink-0">{r.salon_name}</span>}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="rounded-3xl p-6 space-y-5 bg-[#15151b] border border-[#d4af37]/25 shadow-[0_14px_44px_-14px_rgba(0,0,0,0.55)]" data-testid="demo-campaign-card">
      <div>
        <h3 className="font-playfair text-xl text-[#d4af37] flex items-center gap-2 tracking-wide"><Mail className="w-4 h-4" /> Demo Invite Campaign</h3>
        <div className="h-px w-16 bg-gradient-to-r from-[#d4af37] to-transparent mt-2 mb-2" />
        <p className="text-xs text-slate-400 leading-relaxed">{vertical === "restaurant"
          ? <>For restaurants <b className="text-slate-200">not yet on Miracurl</b> — a restaurant-flavoured invite (QR ordering, kitchen tickets, table billing, FREE first month) with restaurant pricing and the restaurant brochure attached. Existing partners are excluded automatically.</>
          : <>For salons <b className="text-slate-200">not yet on Miracurl</b> — send a beautifully designed, polite invitation explaining the suite and your 12-agent AI team, all 4 policy PDFs attached. Existing partners are excluded automatically. Replies come straight to your HQ inbox.</>}</p>
        <div className="flex gap-1 mt-3 p-1 rounded-xl bg-white/5 border border-white/10 w-fit" data-testid="demo-vertical-toggle">
          {[["salon", "💇 Salons"], ["restaurant", "🍽️ Restaurants"]].map(([k, l]) => (
            <button key={k} onClick={() => setVertical(k)} data-testid={`demo-vertical-${k}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${vertical === k ? "bg-[#d4af37] text-[#15151b]" : "text-slate-400 hover:text-slate-200"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <Group title="Prospects — Leads & Inquiries" icon={Sparkles} rows={pool.leads} kind="lead" />

      <div className="flex gap-2">
        <input value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => e.key === "Enter" && addManual()}
          placeholder="Add prospect email manually…" data-testid="demo-manual-email-input"
          className="flex-1 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#d4af37]/50 !bg-white/5 !text-slate-200 placeholder:text-slate-500" />
        <button onClick={addManual} data-testid="demo-manual-email-add" className="px-3 py-2 rounded-lg bg-white/10 text-slate-300 text-xs font-semibold flex items-center gap-1 hover:bg-[#d4af37]/20 hover:text-[#d4af37] transition-colors"><Plus className="w-3.5 h-3.5" /> Add</button>
      </div>

      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="demo-selected-chips">
          {list.map(r => (
            <span key={r.email} className="inline-flex items-center gap-1 bg-[#d4af37]/10 border border-[#d4af37]/40 text-[#d4af37] rounded-full px-2.5 py-1 text-[11px]">
              {r.email}
              <button onClick={() => toggle(r)} className="hover:text-rose-500"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}

      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={600}
        placeholder="Optional personal note (appears in a highlighted box inside the email)…" data-testid="demo-note-input"
        className="w-full border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#d4af37]/50 resize-none !bg-white/5 !text-slate-200 placeholder:text-slate-500" />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs text-slate-400">{list.length} recipient{list.length === 1 ? "" : "s"} selected</p>
          <div className="flex items-center gap-1 text-[11px]" data-testid="demo-currency-toggle">
            <span className="text-slate-500 mr-1">Pricing shown:</span>
            {[["auto", "🌐 Auto"], ["INR", "🇮🇳 ₹"], ["USD", "🌍 $"]].map(([k, l]) => (
              <button key={k} onClick={() => setCurrency(k)} data-testid={`demo-currency-${k}`}
                title={k === "auto" ? "Detects from email domain (.uk/.ae/.us… → USD)" : ""}
                className={`px-2.5 py-1 rounded-full border font-semibold transition-colors ${currency === k ? "bg-[#d4af37] text-[#15151b] border-[#d4af37]" : "bg-white/5 text-slate-400 border-white/10 hover:border-[#d4af37]/50"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <button onClick={send} disabled={sending || !list.length} data-testid="demo-campaign-send-btn"
          className="px-6 py-2.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-xs font-bold flex items-center gap-2 hover:brightness-110 shadow-[0_8px_24px_-8px_rgba(212,175,55,0.6)] disabled:opacity-40 transition">
          <Send className="w-3.5 h-3.5" /> {sending ? "Sending…" : "Send demo invites ✦"}
        </button>
      </div>

      {invites.length > 0 && (
        <div className="border-t border-white/10 pt-3 space-y-2" data-testid="demo-followup-section">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" data-testid="demo-funnel-strip">
            {[
              ["Invited", invites.length, "text-slate-100"],
              ["Opened", invites.filter(i => i.opened).length, "text-sky-400"],
              ["Demo requested", invites.filter(i => i.status === "demo_requested").length, "text-amber-400"],
              ["Trial started ✦", invites.filter(i => i.status === "trial_started").length, "text-violet-400"],
              ["Converted", invites.filter(i => i.status === "converted").length, "text-emerald-400"],
            ].map(([label, n, color]) => (
              <div key={label} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-center">
                <div className={`text-lg font-bold ${color}`}>{n}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-[#d4af37]/80 uppercase flex items-center gap-1.5"><BellRing className="w-3.5 h-3.5" /> Invitees & follow-ups</p>
            <button onClick={runNudges} disabled={nudging} data-testid="demo-run-nudges-btn"
              className="px-3 py-1.5 rounded-full bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#d4af37] text-[11px] font-semibold flex items-center gap-1.5 hover:bg-[#d4af37]/25 disabled:opacity-50 transition-colors">
              <BellRing className="w-3 h-3" /> {nudging ? "Sending…" : "Send due reminders now"}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">One gentle reminder is sent automatically 5 days after the invite, unless you mark them as replied. Only ever one nudge per invitee.</p>
          <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
            {(showAllInvites ? invites : invites.slice(0, 10)).map(inv => {
              const chip = {
                awaiting: ["Awaiting reply", "bg-white/10 text-slate-300"],
                reminded: ["Reminder sent", "bg-amber-400/15 text-amber-300"],
                demo_requested: ["Demo requested 🔥", "bg-amber-500 text-white"],
                replied: ["Replied ✓", "bg-emerald-400/15 text-emerald-300"],
                trial_started: ["Trial started ✦", "bg-violet-600 text-white"],
                converted: ["Converted 🎉", "bg-emerald-600 text-white"],
              }[inv.status] || ["—", "bg-white/10 text-slate-300"];
              return (
                <div key={inv.id} className="flex items-center gap-2 text-xs bg-white/5 border border-white/5 hover:bg-white/10 rounded-lg px-2.5 py-1.5 transition-colors" data-testid={`demo-invite-row-${inv.email}`}>
                  <span className="font-medium text-slate-200 truncate">{inv.name || inv.email}</span>
                  <span className="text-slate-500 truncate hidden sm:inline">{inv.email}</span>
                  <span className="text-[10px] text-slate-500 shrink-0">{(inv.first_sent_at || "").slice(0, 10)}</span>
                  {inv.opened && <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-sky-400/15 text-sky-300 text-[10px] font-semibold" title={`Opened ${(inv.opened_at || "").slice(0, 16).replace("T", " ")} — note: can be triggered by the recipient's email scanner`}>👀 Opened</span>}
                  {inv.clicked && !inv.preferred_slot?.date && <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-indigo-400/15 text-indigo-300 text-[10px] font-semibold" title={`Link fetched ${(inv.clicked_at || "").slice(0, 16).replace("T", " ")} — may be their email security scanner, not a person`}>🔗 Clicked</span>}
                  {inv.preferred_slot?.date && <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-violet-400/15 text-violet-300 text-[10px] font-semibold" title={`Phone: ${inv.preferred_slot.phone || "—"}`}>📅 {inv.preferred_slot.date} {inv.preferred_slot.time} IST{inv.preferred_slot.local_time ? ` · ${inv.preferred_slot.local_time} theirs` : ""}</span>}
                  {inv.signup && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-violet-400/15 text-violet-300 text-[10px] font-semibold"
                      data-testid={`demo-invite-signup-${inv.email}`}
                      title={`Signed up ${(inv.signup.signed_up_at || "").slice(0, 10)} · plan: ${inv.signup.plan || "trial"}${inv.signup.trial_end_date ? ` · trial ends ${String(inv.signup.trial_end_date).slice(0, 10)}` : ""}`}>
                      🏠 {inv.signup.salon || inv.signup.slug}{inv.signup.trial_end_date ? ` · trial ends ${String(inv.signup.trial_end_date).slice(5, 10)}` : ""}
                    </span>
                  )}
                  {!inv.preferred_slot?.date && inv.status !== "converted" && inv.status !== "trial_started" && (
                    <button onClick={() => sendSlotPicker(inv)} data-testid={`demo-invite-slot-picker-${inv.email}`}
                      title={inv.slot_picker_sent_at ? `Time-picker sent ${(inv.slot_picker_sent_at || "").slice(0, 10)} — send again` : "Email them a 'pick your demo time' link"}
                      className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${inv.slot_picker_sent_at ? "bg-white/10 text-slate-400 hover:bg-white/20" : "bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] hover:brightness-110"}`}>
                      📅 {inv.slot_picker_sent_at ? "Picker sent" : "Send time-picker"}
                    </button>
                  )}
                  <span className={`ml-auto shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${chip[1]}`}>{chip[0]}</span>
                  {inv.resend_suggested && (
                    <button onClick={() => resendInvite(inv)} data-testid={`demo-invite-resend-${inv.email}`}
                      title="Not opened in 5+ days — re-send the invite"
                      className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500 text-white text-[10px] font-semibold hover:bg-sky-600">
                      <RotateCw className="w-3 h-3" /> Re-send
                    </button>
                  )}
                  {inv.stale_no_reply && <span className="shrink-0 text-[9px] text-slate-500 italic hidden md:inline">seen, no reply</span>}
                  {inv.status !== "converted" && (
                    <button onClick={() => markReplied(inv)} data-testid={`demo-invite-mark-replied-${inv.email}`}
                      title={inv.responded ? "Mark as not replied" : "Mark as replied (stops the nudge)"}
                      className={`shrink-0 ${inv.responded ? "text-emerald-400" : "text-slate-600 hover:text-emerald-400"}`}>
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => deleteInvite(inv)} data-testid={`demo-invite-delete-${inv.email}`}
                    title="Delete this invite record"
                    className="shrink-0 text-slate-600 hover:text-rose-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          {invites.length > 10 && (
            <button onClick={() => setShowAllInvites(v => !v)} data-testid="demo-invites-show-all"
              className="text-[11px] text-slate-500 hover:text-[#d4af37] underline">
              {showAllInvites ? "Show latest 10 only" : `Show all ${invites.length} invitees`}
            </button>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="border-t border-white/10 pt-3">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#d4af37]/80 uppercase mb-1.5 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Recent campaigns</p>
          <div className="space-y-1" data-testid="demo-campaign-history">
            {history.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center gap-2 text-xs text-slate-400">
                <span className="text-slate-500">{(c.created_at || "").slice(0, 10)}</span>
                <span className="text-emerald-400 font-semibold">{c.sent_count}/{c.recipient_count} sent</span>
                <span className="truncate">{c.subject}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
