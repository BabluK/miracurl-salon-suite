import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { KeyRound, Search, Loader2, Unlock, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

const LEVEL = {
  ok: ["bg-emerald-50 border-emerald-200 text-emerald-800", CheckCircle2],
  warn: ["bg-amber-50 border-amber-200 text-amber-800", AlertTriangle],
  error: ["bg-rose-50 border-rose-200 text-rose-800", XCircle],
  info: ["bg-slate-50 border-slate-200 text-slate-700", Info],
};
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function Fact({ k, v }) {
  return <div className="flex justify-between gap-3 text-xs py-1 border-b border-slate-100 last:border-0"><span className="text-slate-500">{k}</span><span className="font-medium text-slate-800 text-right break-all">{String(v ?? "—")}</span></div>;
}

export function LoginCheckCard() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);

  const run = async (e) => {
    e?.preventDefault();
    if (q.trim().length < 3) return;
    setBusy(true);
    try { const { data } = await api.get("/super-admin/login-check", { params: { q: q.trim() } }); setRes(data); }
    catch (err) { toast.error(err.response?.data?.detail || "Check failed"); }
    finally { setBusy(false); }
  };
  const unlock = async () => {
    try { const { data } = await api.post("/super-admin/login-check/unlock", { q: q.trim() }); toast.success(`Unlocked — cleared ${data.cleared} lock record(s)`); run(); }
    catch (err) { toast.error(err.response?.data?.detail || "Couldn't unlock"); }
  };
  const locked = res?.lockouts?.some(l => l.locked);
  const a = res?.account, r = res?.registry, s = res?.staff;

  return (
    <div className="card-light mb-4" data-testid="login-check-card">
      <div className="flex items-center gap-2 mb-1"><KeyRound className="w-5 h-5 text-amber-500" /><h3 className="font-playfair text-xl text-slate-800">Staff login check</h3></div>
      <p className="text-xs text-slate-500 mb-3">"My staff can't log in" → paste their login <b>email</b> (salon /login) or their <b>10-digit mobile</b> (Employee Portal /employee) to see exactly what's blocking them.</p>
      <form onSubmit={run} className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="staff@salon.com or 98xxxxxxxx" data-testid="login-check-input"
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-200" />
        <button type="submit" disabled={busy || q.trim().length < 3} data-testid="login-check-run"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Check
        </button>
      </form>
      {res && (
        <div className="mt-4 space-y-3" data-testid="login-check-result">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{res.kind === "salon_login" ? "Salon / restaurant login (email)" : "Employee Portal (mobile + Aadhaar)"} · {res.queried}</div>
          <div className="space-y-2">
            {res.findings.map((f, i) => { const [cls, Icon] = LEVEL[f.level] || LEVEL.info; return (
              <div key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${cls}`} data-testid={`login-check-finding-${f.level}`}><Icon className="w-4 h-4 shrink-0 mt-0.5" /><span>{f.text}</span></div>); })}
          </div>
          {locked && <button onClick={unlock} data-testid="login-check-unlock" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-600 text-white text-xs font-bold"><Unlock className="w-3.5 h-3.5" /> Unlock now</button>}
          {a && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <Fact k="Name" v={a.name} /><Fact k="Role" v={a.role} /><Fact k="Business" v={a.tenant ? `${a.tenant} (${a.tenant_slug})` : "—"} />
              <Fact k="Disabled" v={a.disabled ? "YES" : "no"} /><Fact k="Temp password pending" v={a.must_change_password ? "YES" : "no"} />
              <Fact k="Last successful login" v={fmt(a.last_login_at)} /><Fact k="Password last changed" v={fmt(a.password_changed_at)} />
              {s && <Fact k="Staff record" v={`${s.name || ""} · ${s.active === false ? "inactive" : "active"} · personal email ${s.personal_email ? "set" : "missing"}`} />}
            </div>
          )}
          {r && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <Fact k="Registry" v={`${r.name} · ${r.staff_code}`} /><Fact k="Mobile" v={r.phone} /><Fact k="Email on file" v={r.email || "missing"} />
              <Fact k="Aadhaar on file" v={r.has_aadhaar ? "yes" : "MISSING"} /><Fact k="Employment active" v={r.employment_active ? "yes" : "NO"} />
              <Fact k="Portal account" v={res.account ? `created ${fmt(res.account.created_at)}` : "not registered yet"} />
            </div>
          )}
          {res.lockouts?.length > 0 && <div className="text-[11px] text-slate-500">Failed-attempt records: {res.lockouts.map(l => `${l.count}× (${l.locked ? "locked till " + fmt(l.locked_until) : "not locked"})`).join(" · ")}</div>}
        </div>
      )}
    </div>
  );
}
