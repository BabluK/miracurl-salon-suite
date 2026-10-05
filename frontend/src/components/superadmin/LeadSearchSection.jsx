import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Search, Loader2, ChevronDown, ChevronUp, Trash2, CheckCircle2, XCircle, Eye } from "lucide-react";
import { confirmAsync } from "@/components/ConfirmDialog";

const Field = ({ label, children }) => (
  <div>
    <label className="text-[11px] uppercase tracking-wide text-slate-400">{label}</label>
    {children}
  </div>
);

// Step 1 — tell Mira what to find.
export function SearchPanel({ city, setCity, target, setTarget, vertical, setVertical, onRun, onStop, starting, activeRun }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid="lead-search-panel">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-full bg-fuchsia-600 text-white text-[11px] font-bold inline-flex items-center justify-center">1</span>
        <h2 className="text-base font-semibold text-slate-800">Find new leads</h2>
        <span className="text-xs text-slate-400">Mira searches Google Maps → researches each business → builds the full profile (owner · country · website · Instagram · current software · locations · team · booking link · email · WhatsApp) → scores intent 🔥 HOT / 🟠 WARM / 🔵 COLD → drafts the pitch</span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Business type">
          <div className="flex gap-1 mt-1 p-1 rounded-xl bg-slate-100 border border-slate-200" data-testid="lead-vertical-toggle">
            {[["salon", "💇 Salons"], ["restaurant", "🍽️ Restaurants"]].map(([k, l]) => (
              <button key={k} onClick={() => setVertical(k)} data-testid={`lead-vertical-${k}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${vertical === k ? "bg-white shadow text-fuchsia-600" : "text-slate-500 hover:text-slate-700"}`}>{l}</button>
            ))}
          </div>
        </Field>
        <Field label="City">
          <input value={city} onChange={e => setCity(e.target.value)} placeholder="Bangalore · London, UK · New York, US" className="block border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1 w-56" data-testid="lead-city-input" />
        </Field>
        <Field label="How many">
          <input type="number" min="1" max="50" value={target} onChange={e => setTarget(e.target.value)} className="block border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1 w-24" data-testid="lead-target-input" />
        </Field>
        <button onClick={onRun} disabled={starting || !!activeRun} data-testid="lead-run-btn"
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50">
          {starting || activeRun ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {activeRun ? "Mira is working…" : `Find ${vertical === "restaurant" ? "restaurants" : "salons"} ✦`}
        </button>
        {activeRun && (
          <button data-testid="lead-stop-run-btn" onClick={onStop} className="px-4 py-2.5 rounded-xl border border-rose-300 text-rose-600 text-sm font-semibold hover:bg-rose-50">⏹ Stop</button>
        )}
      </div>
    </div>
  );
}

const fmtAgo = (iso) => {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`;
};

// Step 2 — what happened in the latest search, in plain words (log stays one tap away).
export function LastRunCard({ run, leads, onShowLeads, showing }) {
  const [logOpen, setLogOpen] = useState(false);
  if (!run) return null;
  const mine = leads.filter(l => l.run_id === run.id);
  const withEmail = mine.filter(l => l.email).length;
  const noun = run.vertical === "restaurant" ? "Restaurants" : run.vertical === "salon" ? "Salons" : "Email hunt";
  const running = run.status === "running";
  const tone = running ? "border-fuchsia-300 bg-fuchsia-50/60" : run.status === "failed" ? "border-amber-300 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/50";
  const Icon = running ? Loader2 : run.status === "failed" ? XCircle : CheckCircle2;
  return (
    <div className={`rounded-2xl border p-4 ${tone}`} data-testid="lead-last-run">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-[11px] font-bold inline-flex items-center justify-center">2</span>
        <Icon className={`w-5 h-5 ${running ? "animate-spin text-fuchsia-600" : run.status === "failed" ? "text-amber-600" : "text-emerald-600"}`} />
        <div className="flex-1 min-w-[220px]">
          <div className="text-sm font-semibold text-slate-800" data-testid="lead-last-run-title">
            {running ? "Searching now: " : run.status === "failed" ? "Interrupted: " : "Latest search: "}{noun}{run.vertical ? ` in ${run.city}` : ""}
            <span className="text-slate-400 font-normal"> · {fmtAgo(run.created_at)}</span>
          </div>
          <div className="text-xs text-slate-600 mt-0.5" data-testid="lead-last-run-stats">
            {run.found || 0} found · {run.researched || 0} researched · <b>{withEmail} with email</b> (ready to pitch) · {mine.length - withEmail} without email
            {run.status === "failed" && <span className="text-amber-700"> · stopped early — leads found so far are saved</span>}
          </div>
        </div>
        {mine.length > 0 && (
          <button onClick={onShowLeads} data-testid="lead-last-run-show" className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${showing ? "bg-fuchsia-600 text-white" : "bg-white border border-slate-200 text-slate-700 hover:border-fuchsia-400"}`}>
            <Eye className="w-3.5 h-3.5" /> {showing ? "Showing these leads" : `Show these ${mine.length} leads`}
          </button>
        )}
        <button onClick={() => setLogOpen(o => !o)} data-testid="lead-run-log-toggle" className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 inline-flex items-center gap-1 hover:text-slate-800">
          {logOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Mira's log
        </button>
      </div>
      {(logOpen || running) && (run.log || []).length > 0 && (
        <div className="mt-3 bg-slate-900 rounded-xl p-3 text-[11px] text-slate-300 font-mono max-h-44 overflow-y-auto" data-testid="lead-run-log">
          {(run.log || []).slice(-14).map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}
    </div>
  );
}

const CLEAN_MODES = [
  ["keep_recent", "Old uncontacted leads (keep the latest search)", "Deletes every never-emailed lead except those from your latest search"],
  ["no_email", "Leads with no email", "Deletes leads where Mira never found an inbox"],
  ["rejected", "Rejected leads", "Deletes the ones you rejected"],
  ["uncontacted", "ALL uncontacted leads", "Deletes every lead that was never emailed or WhatsApped — contacted / replied / converted are always kept"],
];

// One-click housekeeping — never deletes contacted, replied, demo or converted leads.
export function CleanupMenu({ onDone }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const run = async (mode, label) => {
    if (!await confirmAsync(`${label}? Contacted, replied and converted leads are never touched.`)) return;
    setBusy(mode);
    try {
      const { data } = await api.post("/super-admin/mira-leads/cleanup", { mode });
      toast.success(`🧹 Deleted ${data.deleted} old lead${data.deleted === 1 ? "" : "s"}`);
      setOpen(false); onDone?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Cleanup failed"); }
    finally { setBusy(""); }
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} data-testid="lead-cleanup-btn" className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold inline-flex items-center gap-1.5 hover:border-rose-300 hover:text-rose-600">
        <Trash2 className="w-3.5 h-3.5" /> Clean up old leads <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 space-y-0.5" data-testid="lead-cleanup-menu">
          {CLEAN_MODES.map(([mode, label, hint]) => (
            <button key={mode} onClick={() => run(mode, label)} disabled={!!busy} data-testid={`lead-cleanup-${mode}`}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-50 disabled:opacity-50">
              <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">{busy === mode && <Loader2 className="w-3 h-3 animate-spin" />}{label}</div>
              <div className="text-[10px] text-slate-400">{hint}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
