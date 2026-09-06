import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { TrendingUp, Loader2, Search, Store, IndianRupee, Wallet, CalendarClock, Settings2, ChevronDown, Plus, Trash2, Video } from "lucide-react";
import { AdvisoryTracker } from "@/components/AdvisoryTracker";

const inp = "border border-white/10 rounded-lg px-2.5 py-1.5 text-xs !bg-white/5 !text-slate-200 w-full";
const lbl = "text-[10px] text-slate-500 uppercase tracking-wide";
const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function GoldSwitch({ on, onChange, testId, size = "md" }) {
  const w = size === "lg" ? "w-14 h-8" : "w-11 h-6";
  const k = size === "lg" ? "w-6 h-6" : "w-5 h-5";
  const tx = size === "lg" ? "translate-x-7" : "translate-x-[22px]";
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onChange} data-testid={testId}
      className={`relative ${w} rounded-full transition-colors duration-300 shrink-0 ${on ? "bg-gradient-to-r from-[#F0D9A5] to-[#C89B52] shadow-[0_0_18px_rgba(212,175,55,.45)]" : "bg-white/10 border border-white/15"}`}>
      <span className={`absolute top-0.5 left-0.5 ${k} rounded-full bg-white shadow transition-transform duration-300 ${on ? tx : ""}`} />
    </button>
  );
}

function Stat({ icon: Icon, label, value, testId, accent }) {
  return (
    <div className="rounded-xl bg-white/[.04] border border-white/10 px-3.5 py-2.5 min-w-[130px]" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><Icon className="w-3 h-3" /> {label}</div>
      <div className={`text-lg font-bold leading-tight mt-0.5 ${accent || "text-[#F0D9A5]"}`}>{value}</div>
    </div>
  );
}

function ScheduleForm({ b, onDone }) {
  const [f, setF] = useState({ slot_at: b.session?.slot_at?.slice(0, 16) || "", duration_min: b.session?.duration_min || 60, meet_link: b.session?.meet_link || "", note: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.slot_at) return toast.error("Pick a date & time");
    setBusy(true);
    try {
      await api.post(`/super-admin/growth-advisory/bookings/${b.id}/schedule`, { ...f, duration_min: Number(f.duration_min) });
      toast.success(`Slot emailed to ${b.owner_email}`); onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't schedule"); }
    setBusy(false);
  };
  return (
    <div className="grid sm:grid-cols-[1fr_90px_1fr_auto] gap-2 items-end mt-2" data-testid={`advisory-schedule-form-${b.id}`}>
      <label className={lbl}>Session slot<input type="datetime-local" value={f.slot_at} onChange={e => setF({ ...f, slot_at: e.target.value })} className={inp} data-testid={`advisory-slot-${b.id}`} /></label>
      <label className={lbl}>Minutes<input type="number" min={15} step={15} value={f.duration_min} onChange={e => setF({ ...f, duration_min: e.target.value })} className={inp} /></label>
      <label className={lbl}>Meet link<input value={f.meet_link} onChange={e => setF({ ...f, meet_link: e.target.value })} placeholder="https://meet.google.com/…" className={inp + " normal-case"} data-testid={`advisory-meet-${b.id}`} /></label>
      <button onClick={submit} disabled={busy} data-testid={`advisory-schedule-btn-${b.id}`} className="h-8 px-4 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">{busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarClock className="w-3 h-3" />} {b.status === "scheduled" ? "Reschedule" : "Confirm slot"}</button>
      <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="Note to the owner (optional) — e.g. please have last 3 months' sales ready" className={inp + " sm:col-span-4"} data-testid={`advisory-note-${b.id}`} />
    </div>
  );
}

const ST = { paid: "bg-amber-500/15 text-amber-300", scheduled: "bg-emerald-500/15 text-emerald-300", completed: "bg-white/10 text-slate-300", refunded: "bg-rose-500/15 text-rose-300" };

function BookingCard({ b, reload }) {
  const [open, setOpen] = useState(b.status === "paid");
  const setStatus = async (status) => {
    try { await api.post(`/super-admin/growth-advisory/bookings/${b.id}/status`, { status }); toast.success(`Marked ${status}`); reload(); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't update"); }
  };
  const when = b.session?.slot_at ? new Date(b.session.slot_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : null;
  return (
    <div className={`rounded-2xl border p-3.5 ${b.status === "paid" ? "border-amber-400/40 bg-amber-500/[.05]" : "border-white/10 bg-white/[.025]"}`} data-testid={`advisory-hq-booking-${b.id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100">{b.tenant_name} <span className="text-slate-500 font-normal">· {b.tier_name}</span></div>
          <div className="text-[11px] text-slate-400 mt-0.5">{b.owner_name || "Owner"} · {b.owner_email} · paid {new Date(b.paid_at || b.created_at).toLocaleDateString("en-IN")}</div>
          {b.goal && <div className="text-[11px] text-slate-300 mt-1 italic">“{b.goal}”</div>}
          {when && <div className="text-[11px] text-emerald-300 mt-1 inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {when} · {b.session.duration_min} min {b.session.meet_link && <a href={b.session.meet_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline"><Video className="w-3 h-3" /> link</a>}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="font-playfair text-xl text-[#F0D9A5]">{fmt(b.amount)}</div>
          <div className="text-[10px] text-slate-500">Miracurl {fmt(b.platform_cut)} · payout {fmt(b.advisor_payout)}</div>
          <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${ST[b.status]}`} data-testid={`advisory-hq-status-${b.id}`}>{b.status}</span>
        </div>
      </div>
      {(b.status === "paid" || b.status === "scheduled") && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <button onClick={() => setOpen(o => !o)} className="text-[11px] text-[#F0D9A5] hover:underline" data-testid={`advisory-hq-toggle-${b.id}`}>{open ? "Hide" : b.status === "paid" ? "Pick a slot" : "Reschedule"}</button>
          {b.status === "scheduled" && <button onClick={() => setStatus("completed")} className="text-[11px] text-emerald-300 hover:underline" data-testid={`advisory-hq-complete-${b.id}`}>Mark completed</button>}
          <button onClick={() => window.confirm("Mark as refunded? Refund the payment in Razorpay first.") && setStatus("refunded")} className="text-[11px] text-rose-300 hover:underline" data-testid={`advisory-hq-refund-${b.id}`}>Refunded</button>
        </div>
      )}
      {open && (b.status === "paid" || b.status === "scheduled") && <ScheduleForm b={b} onDone={() => { setOpen(false); reload(); }} />}
      <AdvisoryTracker booking={b} progress={b.progress} editable onSaved={reload} />
    </div>
  );
}

export function GrowthAdvisoryPanel() {
  const [d, setD] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showCfg, setShowCfg] = useState(false);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState("");
  const load = () => api.get("/super-admin/growth-advisory").then(r => { setD(r.data); setCfg(r.data.config); }).catch(() => {});
  useEffect(() => { load(); }, []);
  const tenants = useMemo(() => (d?.tenants || []).filter(t => !q || `${t.name} ${t.slug}`.toLowerCase().includes(q.toLowerCase())), [d, q]);
  if (!d || !cfg) return null;

  const save = async (patch = {}) => {
    setSaving(true);
    try {
      const body = { ...cfg, ...patch, platform_cut_pct: Number(cfg.platform_cut_pct), tiers: cfg.tiers.map(t => ({ ...t, price: Number(t.price), includes: (t.includes || []).filter(Boolean) })) };
      const { data } = await api.put("/super-admin/growth-advisory", body);
      setCfg(data); setD(s => ({ ...s, config: data })); toast.success(data.enabled ? "Growth Advisory is ON" : "Growth Advisory saved (OFF)");
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    setSaving(false);
  };
  const opt = async (t) => {
    setBusyId(t.id);
    try {
      await api.post(`/super-admin/growth-advisory/tenants/${t.id}/opt-in`, { opted: !t.opted });
      setD(s => ({ ...s, tenants: s.tenants.map(x => (x.id === t.id ? { ...x, opted: !t.opted } : x)) }));
      toast.success(`${t.name} ${!t.opted ? "opted in ✦" : "removed"}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't update"); }
    setBusyId("");
  };
  const setTier = (i, k, v) => setCfg(c => ({ ...c, tiers: c.tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));
  const s = d.stats;
  const opted = d.tenants.filter(t => t.opted).length;

  return (
    <div className="space-y-6" data-testid="growth-advisory-panel">
      <div>
        <h1 className="font-playfair text-3xl flex items-center gap-3"><TrendingUp className="w-7 h-7 text-amber-500" /> Growth Advisory</h1>
        <p className="text-slate-500 text-sm mt-1">Chargeable strategy service delivered by the Miracurl team. Opt salons in, they buy from Settings, you schedule the session here.</p>
      </div>

      <div className="relative rounded-3xl border border-[#d4af37]/30 bg-[#15151b] overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#d4af37]/10 blur-3xl" />
        <div className="relative p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[3px] text-[#d4af37]/80">Revenue stream</div>
              <h3 className="font-playfair text-2xl text-[#F0D9A5]">{cfg.headline}</h3>
              <p className="text-[11px] text-slate-400 mt-1">{cfg.tiers.map(t => `${t.name} ${fmt(t.price)}`).join(" · ")} · Miracurl keeps {cfg.platform_cut_pct}%</p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-white/[.04] border border-white/10 px-4 py-2.5">
              <div className="text-right"><div className="text-[10px] uppercase tracking-wider text-slate-500">Service</div><div className={`text-sm font-bold ${cfg.enabled ? "text-emerald-300" : "text-slate-400"}`} data-testid="advisory-master-state">{cfg.enabled ? "● ON" : "○ OFF"}</div></div>
              {saving ? <Loader2 className="w-6 h-6 animate-spin text-[#d4af37]" /> : <GoldSwitch size="lg" on={!!cfg.enabled} onChange={() => save({ enabled: !cfg.enabled })} testId="advisory-enabled" />}
            </div>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            <Stat icon={Store} label="Salons opted in" value={cfg.opt_in_mode === "all" ? "All" : `${opted} / ${d.tenants.length}`} testId="advisory-stat-opted" />
            <Stat icon={Wallet} label="Bookings" value={s.count} testId="advisory-stat-count" />
            <Stat icon={IndianRupee} label="Gross" value={fmt(s.gross)} testId="advisory-stat-gross" />
            <Stat icon={TrendingUp} label={`Miracurl ${cfg.platform_cut_pct}%`} value={fmt(s.platform_cut)} testId="advisory-stat-cut" accent="text-emerald-300" />
            <Stat icon={Wallet} label="Advisor payout" value={fmt(s.advisor_payout)} testId="advisory-stat-payout" />
            {s.pending_schedule > 0 && <Stat icon={CalendarClock} label="Awaiting slot" value={s.pending_schedule} testId="advisory-stat-pending" accent="text-amber-300" />}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <Store className="w-3.5 h-3.5 text-[#d4af37]" /> Who sees the offer:
              {[["selected", "Opted-in salons only"], ["all", "Every active salon"]].map(([k, l]) => (
                <button key={k} onClick={() => save({ opt_in_mode: k })} data-testid={`advisory-mode-${k}`} className={`px-2.5 py-1 rounded-full border text-[11px] ${cfg.opt_in_mode === k ? "bg-[#d4af37] text-[#15151b] border-[#d4af37]" : "border-white/15 text-slate-400 hover:border-white/30"}`}>{l}</button>
              ))}
            </div>
            <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search salons…" className={inp + " !pl-8 !w-52"} data-testid="advisory-tenant-search" /></div>
          </div>
          <div className={`grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[360px] overflow-y-auto pr-1 ${cfg.opt_in_mode === "all" ? "opacity-50" : ""}`} data-testid="advisory-tenant-grid">
            {tenants.map(t => (
              <div key={t.id} data-testid={`advisory-tenant-${t.slug}`} className={`rounded-2xl border p-3.5 flex items-center gap-3 transition-all ${t.opted ? "border-[#d4af37]/40 bg-gradient-to-br from-[#d4af37]/[.10] to-transparent" : "border-white/[.07] bg-white/[.025]"}`}>
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-[#F0D9A5] font-playfair shrink-0">{(t.name || "?")[0]}</div>
                <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-100 truncate">{t.name}</div><div className="text-[11px] text-slate-500 truncate">{t.slug} · {t.plan}</div></div>
                {busyId === t.id ? <Loader2 className="w-5 h-5 animate-spin text-[#d4af37]" /> : <GoldSwitch on={!!t.opted} onChange={() => opt(t)} testId={`advisory-tenant-${t.slug}-switch`} />}
              </div>
            ))}
          </div>

          <button onClick={() => setShowCfg(v => !v)} data-testid="advisory-cfg-toggle" className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.03] px-4 py-3 text-xs text-slate-300 hover:border-[#d4af37]/40">
            <span className="inline-flex items-center gap-2 font-semibold"><Settings2 className="w-4 h-4 text-[#d4af37]" /> Packages & pricing, platform cut, headline</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showCfg ? "rotate-180" : ""}`} />
          </button>
          {showCfg && (
            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[.02] p-4" data-testid="advisory-cfg-panel">
              <div className="grid sm:grid-cols-[1fr_140px] gap-3">
                <label className={lbl}>Headline<input value={cfg.headline} onChange={e => setCfg({ ...cfg, headline: e.target.value })} className={inp + " normal-case"} data-testid="advisory-cfg-headline" /></label>
                <label className={lbl}>Miracurl cut (%)<input type="number" min={0} max={50} value={cfg.platform_cut_pct} onChange={e => setCfg({ ...cfg, platform_cut_pct: e.target.value })} className={inp} data-testid="advisory-cfg-cut" /></label>
              </div>
              <label className={`block ${lbl}`}>Pitch<textarea rows={2} value={cfg.pitch} onChange={e => setCfg({ ...cfg, pitch: e.target.value })} className={inp + " normal-case"} data-testid="advisory-cfg-pitch" /></label>
              <div className="grid md:grid-cols-3 gap-3">
                {cfg.tiers.map((t, i) => (
                  <div key={i} className="rounded-xl border border-white/10 p-3 space-y-2" data-testid={`advisory-cfg-tier-${i}`}>
                    <div className="flex gap-2"><input value={t.name} onChange={e => setTier(i, "name", e.target.value)} className={inp} placeholder="Package name" /><button onClick={() => setCfg(c => ({ ...c, tiers: c.tiers.filter((_, j) => j !== i) }))} className="text-slate-500 hover:text-rose-400" title="Remove"><Trash2 className="w-4 h-4" /></button></div>
                    <div className="flex gap-2"><input type="number" value={t.price} onChange={e => setTier(i, "price", e.target.value)} className={inp} data-testid={`advisory-cfg-price-${i}`} /><input value={t.badge} onChange={e => setTier(i, "badge", e.target.value)} className={inp} placeholder="Badge" /></div>
                    <input value={t.tagline} onChange={e => setTier(i, "tagline", e.target.value)} className={inp} placeholder="One-line tagline" />
                    <textarea rows={5} value={(t.includes || []).join("\n")} onChange={e => setTier(i, "includes", e.target.value.split("\n"))} className={inp} placeholder="What's included — one per line" />
                  </div>
                ))}
                {cfg.tiers.length < 5 && <button onClick={() => setCfg(c => ({ ...c, tiers: [...c.tiers, { id: `tier${Date.now().toString(36)}`, name: "New package", price: 9999, badge: "", tagline: "", includes: [] }] }))} className="rounded-xl border border-dashed border-white/20 text-slate-400 text-xs hover:border-[#d4af37]/50 hover:text-[#F0D9A5] inline-flex items-center justify-center gap-1 min-h-[80px]"><Plus className="w-4 h-4" /> Add package</button>}
              </div>
              <button onClick={() => save()} disabled={saving} data-testid="advisory-save-btn" className="px-5 py-2 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-xs font-bold hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-1.5">{saving && <Loader2 className="w-3 h-3 animate-spin" />} Save packages</button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3" data-testid="advisory-bookings">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><CalendarClock className="w-5 h-5 text-amber-500" /> Bookings & payout ledger</h2>
        {d.bookings.length === 0 && <p className="text-sm text-slate-500 italic">No advisory bookings yet. Opt a salon in — the offer appears in their Settings page.</p>}
        {d.bookings.length > 0 && <div className="rounded-3xl bg-[#15151b] border border-white/10 p-4 grid lg:grid-cols-2 gap-3">{d.bookings.map(b => <BookingCard key={b.id} b={b} reload={load} />)}</div>}
      </div>
    </div>
  );
}
