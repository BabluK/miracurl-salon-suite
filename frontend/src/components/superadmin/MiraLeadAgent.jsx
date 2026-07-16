import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Bot, Search, Loader2, Send, X, ChevronDown, ChevronUp, Star, Globe, Mail, Trash2, CalendarCheck, Trophy } from "lucide-react";

const STATUS_STYLE = {
  drafted: "bg-amber-100 text-amber-700", no_email: "bg-slate-100 text-slate-500",
  sent: "bg-sky-100 text-sky-700", demo: "bg-violet-100 text-violet-700",
  customer: "bg-emerald-100 text-emerald-700", rejected: "bg-rose-100 text-rose-600",
  researched: "bg-slate-100 text-slate-600",
};

function FunnelCards({ stats }) {
  if (!stats) return null;
  const items = [
    { key: "target_leads", label: "Target Leads" }, { key: "qualified", label: "Qualified" },
    { key: "emails_sent", label: "Emails Sent" }, { key: "demos", label: "Demos" },
    { key: "customers", label: "Customers" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" data-testid="lead-funnel-cards">
      {items.map(it => (
        <div key={it.key} className="bg-white rounded-2xl border border-slate-200 p-4" data-testid={`funnel-${it.key}`}>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">{it.label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {stats.actual[it.key]}<span className="text-sm font-medium text-slate-400"> / {stats.targets[it.key]}</span>
          </p>
          <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-fuchsia-500 to-pink-500 rounded-full"
              style={{ width: `${Math.min(100, (stats.actual[it.key] / stats.targets[it.key]) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LeadRow({ lead, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState({ email: lead.email || "", email_subject: lead.email_subject || "", email_body: lead.email_body || "" });

  const act = async (fn, label) => {
    setBusy(label);
    try { await fn(); onRefresh(); }
    catch (e) { toast.error(e.response?.data?.detail || `${label} failed`); }
    finally { setBusy(""); }
  };

  const approve = () => act(async () => {
    if (draft.email !== (lead.email || "") || draft.email_subject !== (lead.email_subject || "") || draft.email_body !== (lead.email_body || "")) {
      await api.put(`/super-admin/mira-leads/${lead.id}`, draft);
    }
    const { data } = await api.post(`/super-admin/mira-leads/${lead.id}/approve`);
    toast.success(`Email sent to ${data.sent_to} 🚀`);
  }, "approve");

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" data-testid={`lead-row-${lead.id}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50" data-testid={`lead-toggle-${lead.id}`}>
        <span className={`shrink-0 w-11 h-8 rounded-lg text-xs font-bold inline-flex items-center justify-center ${lead.score >= 50 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{lead.score}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{lead.name} <span className="text-slate-400 font-normal">· {lead.city}</span></p>
          <p className="text-[11px] text-slate-400 truncate">
            {lead.rating ? <><Star className="w-3 h-3 inline text-amber-400 -mt-0.5" /> {lead.rating}{lead.reviews ? ` (${lead.reviews})` : ""} · </> : null}
            {lead.email || "no email found"} {lead.phone ? `· ${lead.phone}` : ""} {lead.branches > 1 ? `· ${lead.branches} branches` : ""}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_STYLE[lead.status] || "bg-slate-100 text-slate-500"}`}>{lead.status}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
            {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-600"><Globe className="w-3 h-3" /> Website</a>}
            {lead.instagram && <span>IG: {lead.instagram}</span>}
            {(lead.services || []).slice(0, 4).map(s => <span key={s} className="bg-slate-100 px-2 py-0.5 rounded-full">{s}</span>)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(lead.score_breakdown || []).map(b => <span key={b} className="text-[10px] bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 px-2 py-0.5 rounded-full">{b}</span>)}
          </div>
          {["drafted", "no_email", "researched"].includes(lead.status) && (
            <div className="space-y-2">
              <input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="owner@salon.com"
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm w-full max-w-sm" data-testid={`lead-email-input-${lead.id}`} />
              <input value={draft.email_subject} onChange={e => setDraft({ ...draft, email_subject: e.target.value })} placeholder="Email subject"
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm w-full" data-testid={`lead-subject-input-${lead.id}`} />
              <textarea value={draft.email_body} onChange={e => setDraft({ ...draft, email_body: e.target.value })} rows={6} placeholder="Personalized email body"
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm w-full" data-testid={`lead-body-input-${lead.id}`} />
            </div>
          )}
          {lead.status === "sent" && <p className="text-xs text-sky-600">✅ Sent {lead.sent_at?.slice(0, 16).replace("T", " ")} to {lead.email}</p>}
          <div className="flex flex-wrap gap-2">
            {["drafted", "no_email", "researched", "rejected"].includes(lead.status) && (
              <button onClick={approve} disabled={!!busy || !draft.email} data-testid={`lead-approve-${lead.id}`}
                className="text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                {busy === "approve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Approve & Send
              </button>
            )}
            {lead.status === "sent" && (
              <button onClick={() => act(() => api.post(`/super-admin/mira-leads/${lead.id}/stage`, { stage: "demo" }), "demo")} data-testid={`lead-demo-${lead.id}`}
                className="text-xs px-3 py-2 rounded-lg bg-violet-600 text-white font-semibold inline-flex items-center gap-1.5"><CalendarCheck className="w-3.5 h-3.5" /> Mark Demo booked</button>
            )}
            {["sent", "demo"].includes(lead.status) && (
              <button onClick={() => act(() => api.post(`/super-admin/mira-leads/${lead.id}/stage`, { stage: "customer" }), "customer")} data-testid={`lead-customer-${lead.id}`}
                className="text-xs px-3 py-2 rounded-lg bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Became Customer 🎉</button>
            )}
            {!["sent", "demo", "customer", "rejected"].includes(lead.status) && (
              <button onClick={() => act(() => api.post(`/super-admin/mira-leads/${lead.id}/reject`), "reject")} data-testid={`lead-reject-${lead.id}`}
                className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-500 inline-flex items-center gap-1.5"><X className="w-3.5 h-3.5" /> Reject</button>
            )}
            <button onClick={() => act(() => api.delete(`/super-admin/mira-leads/${lead.id}`), "delete")} data-testid={`lead-delete-${lead.id}`}
              className="text-xs px-2.5 py-2 rounded-lg text-rose-400 hover:bg-rose-50 ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MiraLeadAgent() {
  const [city, setCity] = useState("Bangalore");
  const [target, setTarget] = useState(10);
  const [runs, setRuns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef(null);

  const refresh = useCallback(async () => {
    const [r, l, s] = await Promise.all([
      api.get("/super-admin/mira-leads/runs"), api.get("/super-admin/mira-leads"), api.get("/super-admin/mira-leads/stats"),
    ]);
    setRuns(r.data); setLeads(l.data); setStats(s.data);
    return r.data;
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    return () => clearInterval(pollRef.current);
  }, [refresh]);

  const startPolling = useCallback(() => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const r = await refresh().catch(() => []);
      if (!r.some(x => x.status === "running")) clearInterval(pollRef.current);
    }, 6000);
  }, [refresh]);

  const startRun = async () => {
    setStarting(true);
    try {
      await api.post("/super-admin/mira-leads/run", { city, target: Number(target) });
      toast.success(`Mira is hunting for salons in ${city} ✦ (takes a few minutes)`);
      startPolling();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't start run"); }
    finally { setStarting(false); }
  };

  const activeRun = runs.find(r => r.status === "running");

  return (
    <div className="space-y-6" data-testid="mira-lead-agent-panel">
      <div>
        <h1 className="font-playfair text-3xl flex items-center gap-3"><Bot className="w-7 h-7 text-fuchsia-500" /> Lead Generation by Mira AI</h1>
        <p className="text-slate-500 text-sm mt-1">Find salons → research → score → personalized email → you approve → Mira sends.</p>
      </div>

      <FunnelCards stats={stats} />

      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-400">City</label>
          <input value={city} onChange={e => setCity(e.target.value)} className="block border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1" data-testid="lead-city-input" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-400">How many salons</label>
          <input type="number" min="1" max="25" value={target} onChange={e => setTarget(e.target.value)} className="block border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1 w-24" data-testid="lead-target-input" />
        </div>
        <button onClick={startRun} disabled={starting || !!activeRun} data-testid="lead-run-btn"
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50">
          {starting || activeRun ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {activeRun ? "Mira is working…" : "Find salons ✦"}
        </button>
      </div>

      {runs[0] && (runs[0].status === "running" || (runs[0].log || []).length > 0) && (
        <div className="bg-slate-900 rounded-2xl p-4 text-xs text-slate-300 font-mono max-h-44 overflow-y-auto" data-testid="lead-run-log">
          {(runs[0].log || []).slice(-14).map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}

      <div className="space-y-2">
        {leads.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No leads yet — run Mira above to find your first salons.</p>}
        {leads.map(l => <LeadRow key={l.id} lead={l} onRefresh={() => refresh().catch(() => {})} />)}
      </div>
    </div>
  );
}
