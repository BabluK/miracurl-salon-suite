import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Mail, Send, Plus, X, Building2, Sparkles, History, BellRing, CheckCircle2 } from "lucide-react";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function DemoCampaign() {
  const [pool, setPool] = useState({ tenants: [], leads: [] });
  const [selected, setSelected] = useState({});
  const [manual, setManual] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);
  const [invites, setInvites] = useState([]);
  const [nudging, setNudging] = useState(false);

  const loadHistory = () => api.get("/super-admin/demo-campaign/history").then(r => setHistory(r.data.campaigns)).catch(() => {});
  const loadInvites = () => api.get("/super-admin/demo-campaign/invites").then(r => setInvites(r.data.invites)).catch(() => {});
  useEffect(() => {
    api.get("/super-admin/demo-campaign/recipients").then(r => setPool(r.data)).catch(() => toast.error("Couldn't load recipients"));
    loadHistory();
    loadInvites();
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
      const r = await api.post("/super-admin/demo-campaign/send", { recipients: list, note });
      toast.success(`Demo invite sent to ${r.data.sent} owner${r.data.sent === 1 ? "" : "s"}${r.data.failed ? ` · ${r.data.failed} failed` : ""}`);
      if (r.data.failed) {
        const bad = r.data.results.filter(x => !x.sent).map(x => x.email).join(", ");
        toast.error(`Failed: ${bad}`);
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

  const Group = ({ title, icon: I, rows, kind }) => (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase mb-1.5 flex items-center gap-1.5"><I className="w-3.5 h-3.5" /> {title} ({rows.length})</p>
      <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
        {rows.length === 0 && <p className="text-xs text-slate-400 italic">None found</p>}
        {rows.map(r => (
          <label key={r.email} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 hover:bg-amber-50 rounded-lg px-2.5 py-1.5 cursor-pointer" data-testid={`demo-recipient-${kind}-${r.email}`}>
            <input type="checkbox" checked={!!selected[r.email]} onChange={() => toggle(r)} className="accent-amber-500" />
            <span className="font-medium text-slate-700 truncate">{r.name || r.email}</span>
            <span className="text-slate-400 truncate">{r.email}</span>
            {r.salon_name && <span className="ml-auto text-[10px] text-amber-600 shrink-0">{r.salon_name}</span>}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5" data-testid="demo-campaign-card">
      <div>
        <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Mail className="w-4 h-4 text-amber-500" /> Demo invite campaign</h3>
        <p className="text-xs text-slate-500 mt-1">Send a beautifully designed, polite invitation explaining the Miracurl Suite — all 4 policy PDFs attached. Replies come straight to your HQ inbox.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Group title="Leads & Inquiries" icon={Sparkles} rows={pool.leads} kind="lead" />
        <Group title="Existing salon owners" icon={Building2} rows={pool.tenants} kind="tenant" />
      </div>

      <div className="flex gap-2">
        <input value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => e.key === "Enter" && addManual()}
          placeholder="Add prospect email manually…" data-testid="demo-manual-email-input"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300 !bg-white !text-slate-700 placeholder:text-slate-400" />
        <button onClick={addManual} data-testid="demo-manual-email-add" className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold flex items-center gap-1 hover:bg-slate-200"><Plus className="w-3.5 h-3.5" /> Add</button>
      </div>

      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="demo-selected-chips">
          {list.map(r => (
            <span key={r.email} className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2.5 py-1 text-[11px]">
              {r.email}
              <button onClick={() => toggle(r)} className="hover:text-rose-500"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}

      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={600}
        placeholder="Optional personal note (appears in a highlighted box inside the email)…" data-testid="demo-note-input"
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none !bg-white !text-slate-700 placeholder:text-slate-400" />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-500">{list.length} recipient{list.length === 1 ? "" : "s"} selected</p>
        <button onClick={send} disabled={sending || !list.length} data-testid="demo-campaign-send-btn"
          className="px-5 py-2.5 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center gap-2 hover:bg-slate-700 disabled:opacity-40">
          <Send className="w-3.5 h-3.5" /> {sending ? "Sending…" : "Send demo invites"}
        </button>
      </div>

      {invites.length > 0 && (
        <div className="border-t border-slate-100 pt-3 space-y-2" data-testid="demo-followup-section">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase flex items-center gap-1.5"><BellRing className="w-3.5 h-3.5" /> Invitees & follow-ups</p>
            <button onClick={runNudges} disabled={nudging} data-testid="demo-run-nudges-btn"
              className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold flex items-center gap-1.5 hover:bg-amber-200 disabled:opacity-50">
              <BellRing className="w-3 h-3" /> {nudging ? "Sending…" : "Send due reminders now"}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">One gentle reminder is sent automatically 5 days after the invite, unless you mark them as replied. Only ever one nudge per invitee.</p>
          <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
            {invites.map(inv => {
              const chip = {
                awaiting: ["Awaiting reply", "bg-slate-100 text-slate-500"],
                reminded: ["Reminder sent", "bg-amber-100 text-amber-700"],
                replied: ["Replied ✓", "bg-emerald-100 text-emerald-700"],
                converted: ["Converted 🎉", "bg-emerald-600 text-white"],
              }[inv.status] || ["—", "bg-slate-100 text-slate-500"];
              return (
                <div key={inv.id} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2.5 py-1.5" data-testid={`demo-invite-row-${inv.email}`}>
                  <span className="font-medium text-slate-700 truncate">{inv.name || inv.email}</span>
                  <span className="text-slate-400 truncate hidden sm:inline">{inv.email}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">{(inv.first_sent_at || "").slice(0, 10)}</span>
                  <span className={`ml-auto shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${chip[1]}`}>{chip[0]}</span>
                  {inv.status !== "converted" && (
                    <button onClick={() => markReplied(inv)} data-testid={`demo-invite-mark-replied-${inv.email}`}
                      title={inv.responded ? "Mark as not replied" : "Mark as replied (stops the nudge)"}
                      className={`shrink-0 ${inv.responded ? "text-emerald-500" : "text-slate-300 hover:text-emerald-500"}`}>
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase mb-1.5 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Recent campaigns</p>
          <div className="space-y-1" data-testid="demo-campaign-history">
            {history.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center gap-2 text-xs text-slate-500">
                <span className="text-slate-400">{(c.created_at || "").slice(0, 10)}</span>
                <span className="text-emerald-600 font-semibold">{c.sent_count}/{c.recipient_count} sent</span>
                <span className="truncate">{c.subject}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
