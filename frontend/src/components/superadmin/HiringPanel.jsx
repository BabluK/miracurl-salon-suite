import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Briefcase, Search, Send, UserPlus, CalendarClock, Share2, IndianRupee } from "lucide-react";

const STATUS_CHIP = {
  applied: "bg-slate-100 text-slate-600",
  shortlisted: "bg-sky-100 text-sky-700",
  trial_scheduled: "bg-amber-100 text-amber-700",
  hired: "bg-emerald-100 text-emerald-700",
  rejected: "bg-slate-100 text-slate-400",
};
const URGENCY_LABEL = { immediate: "🔥 Immediate", two_weeks: "2 weeks", flexible: "Flexible" };

export function HiringPanel({ onNewCount }) {
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    api.get("/super-admin/hiring").then(r => {
      setData(r.data);
      onNewCount?.(r.data.new_applications);
      if (r.data.new_applications > 0) {
        api.post("/super-admin/hiring/mark-seen").then(() => onNewCount?.(0)).catch(() => {});
      }
    }).catch(e => toast.error(e.response?.data?.detail || "Couldn't load hiring data"));
  }, [onNewCount]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="text-slate-500 text-sm">Loading hiring pipeline…</div>;
  const open = data.requests.filter(r => r.status === "open");
  const closed = data.requests.filter(r => r.status !== "open");

  return (
    <div className="space-y-6" data-testid="hiring-panel">
      <div>
        <h1 className="font-playfair text-3xl flex items-center gap-3"><Briefcase className="w-7 h-7 text-indigo-500" /> Hiring Marketplace</h1>
        <p className="text-slate-500 text-sm mt-1">
          {data.open_requests} open request{data.open_requests === 1 ? "" : "s"} — you're the middleman: curate applicants, propose registry candidates, schedule trials.
        </p>
      </div>
      {open.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500" data-testid="hiring-empty">
          No open hiring requests. When a salon owner posts one from “Hire Staff”, it lands here.
        </div>
      )}
      {open.map(r => <RequestCard key={r.id} r={r} onChange={load} />)}
      {closed.length > 0 && (
        <details className="text-sm text-slate-500">
          <summary className="cursor-pointer font-medium">Closed requests ({closed.length})</summary>
          <div className="mt-3 space-y-3">{closed.map(r => <RequestCard key={r.id} r={r} onChange={load} closedView />)}</div>
        </details>
      )}
      <PlacementFees />
    </div>
  );
}

function PlacementFees() {
  const [data, setData] = useState(null);
  const [feeInput, setFeeInput] = useState("");
  const load = useCallback(() => {
    api.get("/super-admin/hiring/placement-fees").then(r => { setData(r.data); setFeeInput(String(r.data.fee_per_hire)); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;

  const saveFee = async () => {
    const amt = parseFloat(feeInput);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    try { await api.put("/super-admin/hiring/placement-fee", { amount: amt }); toast.success(`Placement fee set to ₹${amt.toLocaleString("en-IN")}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
  };
  const sendLink = async (f) => {
    try {
      const { data: r } = await api.post(`/super-admin/hiring/placement-fees/${f.id}/send-link`);
      toast.success(r.emailed_to ? `Payment link emailed to ${r.emailed_to}` : "Link generated (no owner email on file)");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't send link"); }
  };
  const markPaid = async (f) => {
    try { await api.post(`/super-admin/hiring/placement-fees/${f.id}/mark-paid`); toast.success("Marked paid"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't update"); }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm" data-testid="placement-fees-section">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <div>
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><IndianRupee className="w-4 h-4 text-emerald-600" /> Placement fees</h3>
          <p className="text-xs text-slate-500 mt-0.5">Due ₹{Math.round(data.totals.due).toLocaleString("en-IN")} · Paid ₹{Math.round(data.totals.paid).toLocaleString("en-IN")} · {data.totals.hires} hires</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Fee per hire ₹</span>
          <input value={feeInput} onChange={e => setFeeInput(e.target.value)} inputMode="decimal"
            className="w-24 border border-slate-200 rounded-md px-2 py-1.5 text-sm" data-testid="placement-fee-amount-input" />
          <button onClick={saveFee} className="text-xs px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-700" data-testid="placement-fee-save-btn">Save</button>
        </div>
      </div>
      {data.items.length === 0 && <p className="text-xs text-slate-400 mt-3">No hires yet — fees appear here automatically when a candidate is hired.</p>}
      <div className="divide-y divide-slate-100 mt-2">
        {data.items.slice(0, 12).map(f => (
          <div key={f.id} className="py-2.5 flex items-center gap-3 flex-wrap" data-testid={`placement-fee-${f.id}`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-800 truncate"><b>{f.candidate_name || "Candidate"}</b> → {f.salon_name} <span className="text-slate-400">· {f.role}</span></p>
              <p className="text-[11px] text-slate-400">{(f.created_at || "").slice(0, 10)}{f.payment_link ? " · link ready" : ""}</p>
            </div>
            <span className="text-sm font-semibold text-slate-700">₹{Math.round(f.amount).toLocaleString("en-IN")}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${f.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{f.status}</span>
            {f.status === "due" && (
              <>
                <button onClick={() => sendLink(f)} className="text-xs px-2.5 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700" data-testid={`fee-send-link-${f.id}`}>Send payment link</button>
                <button onClick={() => markPaid(f)} className="text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" data-testid={`fee-mark-paid-${f.id}`}>Mark paid</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RequestCard({ r, onChange, closedView }) {
  const [showPropose, setShowPropose] = useState(false);
  return (
    <div className={`bg-white border rounded-2xl p-5 shadow-sm ${closedView ? "border-slate-100 opacity-70" : "border-slate-200"}`} data-testid={`hiring-request-${r.id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold text-slate-800 text-lg">{r.role} <span className="text-xs font-normal text-slate-400">· {URGENCY_LABEL[r.urgency]}</span></div>
          <div className="text-xs text-slate-500 mt-0.5">
            <b>{r.salon_name}</b> ({r.slug}) · {r.location || "—"} · {r.experience_years}+ yrs ·
            ₹{Math.round(r.salary_min).toLocaleString("en-IN")}–₹{Math.round(r.salary_max).toLocaleString("en-IN")}/mo
          </div>
          {r.notes && <div className="text-xs text-slate-500 mt-1 italic">"{r.notes}"</div>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${r.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{r.status}</span>
          {!closedView && (
            <button onClick={() => setShowPropose(!showPropose)} data-testid={`hiring-propose-toggle-${r.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold">
              <UserPlus className="w-3.5 h-3.5" /> Propose candidate
            </button>
          )}
        </div>
      </div>
      {showPropose && <ProposeBox requestId={r.id} onDone={() => { setShowPropose(false); onChange(); }} />}
      {r.applications.length > 0 && (
        <div className="mt-4 space-y-2">
          {r.applications.map(a => <ApplicationRow key={a.id} a={a} onChange={onChange} />)}
        </div>
      )}
    </div>
  );
}

function ProposeBox({ requestId, onDone }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("all");
  const [results, setResults] = useState([]);
  const [roles, setRoles] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/super-admin/hiring/candidates?q=${encodeURIComponent(q)}&role=${encodeURIComponent(role)}&status=${status}&request_id=${requestId}`)
        .then(r => { setResults(r.data.candidates); setRoles(r.data.roles || []); })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [q, role, status, requestId]);
  const propose = async (eid) => {
    try {
      await api.post("/super-admin/hiring/propose", { request_id: requestId, employee_id: eid });
      toast.success("Candidate proposed — salon owner can now see them");
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't propose"); }
  };
  return (
    <div className="mt-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3" data-testid="hiring-propose-box">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search registry by name or city…"
            className="flex-1 bg-white border border-slate-200 rounded-md px-3 py-2 text-sm" data-testid="hiring-candidate-search" />
        </div>
        <select value={role} onChange={e => setRole(e.target.value)}
          className="bg-white text-slate-800 [&_option]:bg-white [&_option]:text-slate-800 border border-slate-200 rounded-md px-2 py-2 text-xs" data-testid="hiring-role-filter">
          <option value="">All roles</option>
          {roles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <div className="flex gap-1">
          {[["all", "All"], ["left", "Available (left)"], ["active", "Working"]].map(([k, l]) => (
            <button key={k} onClick={() => setStatus(k)} data-testid={`hiring-status-${k}`}
              className={`text-[11px] px-2.5 py-1.5 rounded-full border transition ${status === k ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">This salon's own active staff are hidden automatically — propose people who left other salons or are open to move.</p>
      <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-slate-100">
        {results.map(c => (
          <div key={c.employee_id} className="flex items-center justify-between gap-2 py-2 text-sm flex-wrap">
            <div className="min-w-0">
              <span className="font-medium text-slate-800">{c.name}</span>
              <span className="text-xs text-slate-500"> · {c.designation || "—"} · {c.city}</span>
              {c.avg_rating != null && (
                <span className="ml-2 text-[11px] font-semibold text-amber-600" title={`${c.ratings_count} rating(s) from past salons`}>
                  ⭐ {c.avg_rating}
                </span>
              )}
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {c.employment_status === "left" ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">✓ Available{c.salon_name && ` · left ${c.salon_name}`}</span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Active @ {c.salon_name || "a salon"}</span>
                )}
              </div>
              {c.last_review && (
                <div className="text-[11px] text-slate-400 italic mt-0.5 truncate max-w-md" title={c.last_review.comment}>
                  "{c.last_review.comment}" — {c.last_review.salon_name} (⭐{c.last_review.rating})
                </div>
              )}
            </div>
            <button onClick={() => propose(c.employee_id)} className="text-xs px-2.5 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 shrink-0" data-testid={`hiring-propose-${c.employee_id}`}>
              Propose
            </button>
          </div>
        ))}
        {results.length === 0 && <div className="text-xs text-slate-400 py-3 text-center">No matching registry staff.</div>}
      </div>
    </div>
  );
}

function ApplicationRow({ a, onChange }) {
  const [trialOpen, setTrialOpen] = useState(false);
  const [trial, setTrial] = useState({ trial_date: "", trial_time: "10:00", trial_notes: "" });
  const patch = async (body) => {
    try {
      await api.patch(`/super-admin/hiring/applications/${a.id}`, body);
      toast.success("Updated");
      setTrialOpen(false);
      onChange();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't update"); }
  };
  const shareProfile = async () => {
    try {
      const { data } = await api.post(`/super-admin/hiring/applications/${a.id}/share-link`);
      try { await navigator.clipboard.writeText(data.url); } catch { /* clipboard blocked */ }
      if (data.wa_link) window.open(data.wa_link, "_blank", "noopener,noreferrer");
      toast.success("Profile link copied" + (data.wa_link ? " — WhatsApp opened" : ""));
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't create link"); }
  };
  const waLink = () => {
    const num = (a.candidate_phone || "").replace(/\D/g, "");
    const text = `Hi ${a.candidate_name} ✦ Miracurl HQ here. Your salon trial is scheduled on ${a.trial_date} at ${a.trial_time}. ${a.trial_notes || ""} Reply to confirm. — Team Miracurl`;
    return `https://wa.me/${num.length === 10 ? "91" + num : num}?text=${encodeURIComponent(text)}`;
  };
  return (
    <div className="border border-slate-100 rounded-xl px-3 py-2.5" data-testid={`hiring-app-${a.id}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <span className="font-medium text-slate-800">{a.candidate_name}</span>
          <span className="text-xs text-slate-500"> · {a.candidate_designation || "—"} · {a.candidate_city} · {a.candidate_phone}</span>
          {a.source === "hq_proposed" && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 font-medium">HQ pick</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_CHIP[a.status]}`}>{a.status.replace("_", " ")}</span>
          {a.owner_confirmed && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold" data-testid={`hiring-owner-confirmed-${a.id}`}>✓ owner confirmed</span>}
          {["shortlisted", "trial_scheduled"].includes(a.status) && (
            <button onClick={shareProfile} className="text-xs px-2 py-1 rounded-md bg-violet-600 text-white hover:bg-violet-700 inline-flex items-center gap-1" data-testid={`hiring-share-${a.id}`} title="Share verified profile with the salon owner">
              <Share2 className="w-3 h-3" /> Share
            </button>
          )}
          {a.status === "applied" && (
            <button onClick={() => patch({ status: "shortlisted" })} className="text-xs px-2 py-1 rounded-md bg-sky-600 text-white hover:bg-sky-700" data-testid={`hiring-shortlist-${a.id}`}>Shortlist</button>
          )}
          {["shortlisted", "trial_scheduled"].includes(a.status) && (
            <button onClick={() => setTrialOpen(!trialOpen)} className="text-xs px-2 py-1 rounded-md bg-amber-500 text-white hover:bg-amber-600 inline-flex items-center gap-1" data-testid={`hiring-trial-btn-${a.id}`}>
              <CalendarClock className="w-3 h-3" /> Trial
            </button>
          )}
          {a.status === "trial_scheduled" && (
            <>
              <a href={waLink()} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 inline-flex items-center gap-1" data-testid={`hiring-wa-${a.id}`}>
                <Send className="w-3 h-3" /> WhatsApp
              </a>
              <button onClick={() => patch({ status: "hired" })} className="text-xs px-2 py-1 rounded-md bg-emerald-700 text-white hover:bg-emerald-800" data-testid={`hiring-hire-${a.id}`}>Hired ✓</button>
            </>
          )}
          {!["hired", "rejected"].includes(a.status) && (
            <button onClick={() => patch({ status: "rejected" })} className="text-xs px-2 py-1 rounded-md bg-slate-200 text-slate-600 hover:bg-slate-300" data-testid={`hiring-reject-${a.id}`}>Reject</button>
          )}
        </div>
      </div>
      {a.status === "trial_scheduled" && a.trial_date && (
        <div className="text-xs text-amber-700 mt-1.5">📅 Trial: {a.trial_date} at {a.trial_time} {a.trial_notes && `· ${a.trial_notes}`}</div>
      )}
      {trialOpen && (
        <div className="mt-2 flex items-center gap-2 flex-wrap" data-testid={`hiring-trial-form-${a.id}`}>
          <input type="date" value={trial.trial_date} onChange={e => setTrial({ ...trial, trial_date: e.target.value })}
            className="border border-slate-200 rounded-md px-2 py-1.5 text-xs" data-testid={`hiring-trial-date-${a.id}`} />
          <input type="time" value={trial.trial_time} onChange={e => setTrial({ ...trial, trial_time: e.target.value })}
            className="border border-slate-200 rounded-md px-2 py-1.5 text-xs" data-testid={`hiring-trial-time-${a.id}`} />
          <input value={trial.trial_notes} onChange={e => setTrial({ ...trial, trial_notes: e.target.value })} placeholder="notes (e.g. carry your kit)"
            className="flex-1 min-w-[140px] border border-slate-200 rounded-md px-2 py-1.5 text-xs" data-testid={`hiring-trial-notes-${a.id}`} />
          <button onClick={() => trial.trial_date ? patch(trial) : toast.error("Pick a date")}
            className="text-xs px-3 py-1.5 rounded-md bg-amber-500 text-white hover:bg-amber-600" data-testid={`hiring-trial-save-${a.id}`}>
            Schedule
          </button>
        </div>
      )}
    </div>
  );
}
