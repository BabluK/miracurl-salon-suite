import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Gift, Loader2, Trophy, ExternalLink, Settings2, ChevronDown, Search, Users, Store, Sparkles, Share2, Download } from "lucide-react";
import { fetchCardBlob, downloadBlob, shareWinnerCard, whatsappShareText } from "@/lib/winnerCard";

const inp = "border border-white/10 rounded-lg px-2.5 py-1.5 text-xs !bg-white/5 !text-slate-200 w-full";
const lbl = "text-[10px] text-slate-500 uppercase tracking-wide";
const PLANS = [["annual", "Annual (all branch sizes)"], ["half_year", "6-Month"], ["two_branch_annual", "2-Branch Annual"], ["three_branch_annual", "3-Branch Annual"], ["multi_branch_annual", "Multi-Branch Annual"], ["trial", "Free trial"]];
const PLAN_LABEL = { annual: "Annual", half_year: "6-Month", two_branch_annual: "2-Branch", three_branch_annual: "3-Branch", multi_branch_annual: "Multi-Branch", trial: "Trial" };

function GoldSwitch({ on, onChange, testId, size = "md" }) {
  const w = size === "lg" ? "w-14 h-8" : "w-11 h-6";
  const k = size === "lg" ? "w-6 h-6 translate-x-1" : "w-5 h-5 translate-x-0.5";
  const tx = size === "lg" ? "translate-x-7" : "translate-x-[22px]";
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onChange} data-testid={testId}
      className={`relative ${w} rounded-full transition-colors duration-300 shrink-0 ${on ? "bg-gradient-to-r from-[#F0D9A5] to-[#C89B52] shadow-[0_0_18px_rgba(212,175,55,.45)]" : "bg-white/10 border border-white/15"}`}>
      <span className={`absolute top-0.5 left-0 ${k} rounded-full bg-white shadow transition-transform duration-300 ${on ? tx : ""}`} />
    </button>
  );
}

function StatChip({ icon: Icon, label, value, testId }) {
  return (
    <div className="rounded-xl bg-white/[.04] border border-white/10 px-3.5 py-2.5 min-w-[118px]" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1"><Icon className="w-3 h-3" /> {label}</div>
      <div className="text-lg font-bold text-[#F0D9A5] leading-tight mt-0.5">{value}</div>
    </div>
  );
}

function TenantTile({ t, busy, onFlag }) {
  const src = t.manual === true ? "Forced ON" : t.manual === false ? "Forced OFF" : t.plan_ok ? "Auto · plan eligible" : "Auto · plan not eligible";
  return (
    <div data-testid={`rewards-tenant-${t.slug}`}
      className={`group relative rounded-2xl border p-3.5 flex items-center gap-3 transition-all duration-300 ${t.on ? "border-[#d4af37]/40 bg-gradient-to-br from-[#d4af37]/[.10] to-transparent" : "border-white/[.07] bg-white/[.025] hover:border-white/15"}`}>
      {t.logo_url ? <img src={t.logo_url} alt="" className="w-11 h-11 rounded-full object-cover ring-2 ring-white/10 shrink-0" />
        : <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-[#F0D9A5] font-playfair text-lg shrink-0">{(t.name || "?")[0]}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-100 truncate">{t.name}</div>
        <div className="text-[11px] text-slate-500 truncate">{t.location || t.slug} · <span className="text-slate-400">{PLAN_LABEL[t.plan] || t.plan}</span>{t.status !== "active" && <span className="text-rose-400"> · {t.status}</span>}</div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.on ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-500"}`} data-testid={`rewards-tenant-${t.slug}-state`}>{t.on ? "● ON" : "○ OFF"}</span>
          <span className="text-[10px] text-slate-500">{src}</span>
          {t.participants > 0 && <span className="text-[10px] text-[#F0D9A5]">👥 {t.participants}</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        {busy ? <Loader2 className="w-5 h-5 animate-spin text-[#d4af37]" /> : <GoldSwitch on={t.on} onChange={() => onFlag(t, !t.on)} testId={`rewards-tenant-${t.slug}-switch`} />}
        {t.manual !== null && t.manual !== undefined && (
          <button onClick={() => onFlag(t, null)} className="text-[10px] text-slate-500 hover:text-[#F0D9A5] underline-offset-2 hover:underline" data-testid={`rewards-tenant-${t.slug}-auto`}>reset to auto</button>
        )}
      </div>
    </div>
  );
}

export function RewardsCampaignCard() {
  const [c, setC] = useState(null);
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState(null);
  const [showCfg, setShowCfg] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState("");
  const [cardBusy, setCardBusy] = useState("");

  const load = () => api.get("/super-admin/rewards-campaign").then(r => setC(r.data)).catch(() => {});
  const loadTenants = () => api.get("/super-admin/rewards-campaign/tenants").then(r => setTenants(r.data.tenants)).catch(() => {});
  useEffect(() => { load(); loadTenants(); }, []);

  const filtered = useMemo(() => tenants.filter(t => !q || `${t.name} ${t.slug} ${t.location}`.toLowerCase().includes(q.toLowerCase())), [tenants, q]);
  if (!c) return null;

  const set = (k) => (e) => setC(s => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const setReward = (i, k, v) => setC(s => ({ ...s, rewards: s.rewards.map((r, j) => (j === i ? { ...r, [k]: k === "winners" ? Number(v) : v } : r)) }));
  const togglePlan = (k) => setC(s => ({ ...s, eligible_plans: s.eligible_plans.includes(k) ? s.eligible_plans.filter(p => p !== k) : [...s.eligible_plans, k] }));

  const save = async (patch = {}) => {
    setSaving(true);
    try {
      const body = { ...c, ...patch, min_transaction: Number(c.min_transaction), budget: Number(c.budget), winner_count: Number(c.winner_count) };
      const { data } = await api.put("/super-admin/rewards-campaign", body);
      setC(data); loadTenants();
      toast.success(data.enabled ? `Campaign ${data.live ? "is LIVE" : "scheduled"} · ${data.eligible_tenants} salon${data.eligible_tenants === 1 ? "" : "s"} ON` : "Campaign switched OFF");
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    setSaving(false);
  };
  const flag = async (t, on) => {
    setBusyId(t.id);
    try {
      const { data } = await api.post(`/super-admin/rewards-campaign/tenants/${t.id}/flag`, { on });
      setTenants(ts => ts.map(x => (x.id === t.id ? { ...x, on: data.on, manual: data.manual } : x)));
      setC(s => ({ ...s, eligible_tenants: data.on_count }));
      toast.success(on === null ? `${t.name} → auto (plan rule)` : `${t.name} → Rewards ${on ? "ON" : "OFF"}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't update"); }
    setBusyId("");
  };
  const loadPeople = () => api.get("/super-admin/rewards-campaign/participants").then(r => setPeople(r.data.participants)).catch(() => {});
  const setWinner = async (p, tier) => {
    try { await api.post(`/super-admin/rewards-campaign/participants/${p.id}/winner`, { tier: tier || null }); toast.success(tier ? `${p.name} → ${tier} 🏆 — share card is ready` : "Winner cleared"); loadPeople(); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't set winner"); }
  };
  const card = async (p, mode) => {
    setCardBusy(p.id + mode);
    try {
      const blob = await fetchCardBlob(api, `/super-admin/rewards-campaign/participants/${p.id}/card.png`);
      const filename = `brand-model-${p.name.toLowerCase().replace(/\s+/g, "-")}.png`;
      if (mode === "dl") { downloadBlob(blob, filename); toast.success("Winner card downloaded"); }
      else await shareWinnerCard({ blob, filename, text: whatsappShareText({ name: p.name, tier: p.winner_tier, salon: p.salon_name, url: `${window.location.origin}/rewards/${p.salon_slug}` }) });
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't build the card"); }
    setCardBusy("");
  };
  const onCount = tenants.filter(t => t.on).length;

  return (
    <div className="relative rounded-3xl border border-[#d4af37]/30 bg-[#15151b] overflow-hidden" data-testid="rewards-campaign-card">
      <div className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#d4af37]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 w-80 h-80 rounded-full bg-[#C89B52]/10 blur-3xl" />

      <div className="relative p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F0D9A5] to-[#C89B52] flex items-center justify-center shadow-lg shadow-[#d4af37]/20"><Gift className="w-6 h-6 text-[#15151b]" /></div>
            <div>
              <div className="text-[10px] uppercase tracking-[3px] text-[#d4af37]/80">Customer Rewards</div>
              <h3 className="font-playfair text-2xl text-[#F0D9A5] leading-tight">{c.name}</h3>
              <p className="text-[11px] text-slate-400 mt-1">Spend ₹{Number(c.min_transaction).toLocaleString("en-IN")}+ · refer · win {c.rewards.map(r => `${r.emoji} ${r.tier}`).join(" · ")} · {c.start_date} → {c.end_date}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white/[.04] border border-white/10 px-4 py-2.5" data-testid="rewards-master-toggle">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Campaign</div>
              <div className={`text-sm font-bold ${c.enabled ? (c.live ? "text-emerald-300" : "text-amber-300") : "text-slate-400"}`} data-testid="rewards-master-state">{c.enabled ? (c.live ? "● ON · live" : "● ON · scheduled") : "○ OFF"}</div>
            </div>
            {saving ? <Loader2 className="w-6 h-6 animate-spin text-[#d4af37]" /> : <GoldSwitch size="lg" on={!!c.enabled} onChange={() => save({ enabled: !c.enabled })} testId="rewards-enabled" />}
          </div>
        </div>

        <div className="flex gap-2.5 flex-wrap">
          <StatChip icon={Store} label="Salons ON" value={`${onCount} / ${tenants.length}`} testId="rewards-stat-salons" />
          <StatChip icon={Users} label="Enrolled" value={c.participants} testId="rewards-stat-enrolled" />
          <StatChip icon={Trophy} label="Winners" value={c.rewards.reduce((a, r) => a + Number(r.winners || 0), 0)} testId="rewards-stat-winners" />
          <StatChip icon={Sparkles} label="Budget" value={`₹${Number(c.budget).toLocaleString("en-IN")}`} testId="rewards-stat-budget" />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] text-slate-400"><Store className="w-3.5 h-3.5 text-[#d4af37]" /> Flip a switch to turn the campaign ON or OFF for any salon — overrides the plan rule.</div>
          <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search salons…" className={inp + " !pl-8 !w-52"} data-testid="rewards-tenant-search" /></div>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[420px] overflow-y-auto pr-1" data-testid="rewards-tenant-grid">
          {filtered.map(t => <TenantTile key={t.id} t={t} busy={busyId === t.id} onFlag={flag} />)}
          {filtered.length === 0 && <p className="text-xs text-slate-500 italic col-span-full">No salons match.</p>}
        </div>

        <button onClick={() => setShowCfg(s => !s)} data-testid="rewards-cfg-toggle" className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.03] px-4 py-3 text-xs text-slate-300 hover:border-[#d4af37]/40 transition-colors">
          <span className="inline-flex items-center gap-2 font-semibold"><Settings2 className="w-4 h-4 text-[#d4af37]" /> Campaign settings — name, eligible plans, dates, rewards & terms</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showCfg ? "rotate-180" : ""}`} />
        </button>
        {showCfg && (
          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[.02] p-4" data-testid="rewards-cfg-panel">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className={lbl}>Campaign name<input value={c.name} onChange={set("name")} className={inp} data-testid="rewards-cfg-name" /></label>
              <div className={lbl}>Auto-eligible subscription (default rule)
                <div className="flex flex-wrap gap-1.5 mt-1">{PLANS.map(([k, l]) => <button key={k} onClick={() => togglePlan(k)} data-testid={`rewards-plan-${k}`} className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${c.eligible_plans.includes(k) ? "bg-[#d4af37] text-[#15151b] border-[#d4af37]" : "border-white/15 text-slate-400 hover:border-white/30"}`}>{c.eligible_plans.includes(k) ? "✅ " : "❌ "}{l}</button>)}</div>
              </div>
              <label className={lbl}>Minimum transaction (₹)<input type="number" value={c.min_transaction} onChange={set("min_transaction")} className={inp} data-testid="rewards-cfg-min" /></label>
              <label className={lbl}>Maximum campaign budget (₹)<input type="number" value={c.budget} onChange={set("budget")} className={inp} data-testid="rewards-cfg-budget" /></label>
              <label className={lbl}>Start<input type="date" value={c.start_date} onChange={set("start_date")} className={inp} data-testid="rewards-cfg-start" /></label>
              <label className={lbl}>End<input type="date" value={c.end_date} onChange={set("end_date")} className={inp} data-testid="rewards-cfg-end" /></label>
              <label className={lbl}>Winner count<input type="number" value={c.winner_count} onChange={set("winner_count")} className={inp} data-testid="rewards-cfg-winners" /></label>
              <div className={lbl}>Rewards
                <div className="space-y-1 mt-1">{c.rewards.map((r, i) => <div key={i} className="flex items-center gap-2 text-xs text-slate-200"><span>{r.emoji}</span><input value={r.tier} onChange={e => setReward(i, "tier", e.target.value)} className={inp + " !w-28"} /><input type="number" min={0} value={r.winners} onChange={e => setReward(i, "winners", e.target.value)} className={inp + " !w-16"} data-testid={`rewards-tier-${i}`} /><span className="text-slate-500">winner{r.winners === 1 ? "" : "s"}</span></div>)}</div>
              </div>
            </div>
            <label className={`block ${lbl}`}>Terms (shown on the campaign page)<textarea value={c.terms} onChange={set("terms")} rows={3} className={inp + " normal-case"} data-testid="rewards-cfg-terms" /></label>
            <label className={`block ${lbl}`}>Upcoming events (one per line: <code className="normal-case">YYYY-MM-DD | Title | note</code>) — "Casting closes" & "Brand Models announced" are added automatically
              <textarea rows={3} defaultValue={(c.events || []).map(e => [e.date, e.title, e.note].filter(Boolean).join(" | ")).join("\n")} placeholder={"2026-10-05 | Brand Model photoshoot | At the salon, 4–7 pm\n2026-11-15 | Diwali glam night | Live styling & giveaways"}
                onBlur={e => setC(s => ({ ...s, events: e.target.value.split("\n").map(l => l.split("|").map(x => x.trim())).filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p[0]) && p[1]).map(([date, title, note]) => ({ date, title, note: note || "" })) }))}
                className={inp + " normal-case"} data-testid="rewards-cfg-events" />
            </label>
            <button onClick={() => save()} disabled={saving} data-testid="rewards-save-btn" className="px-5 py-2 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-xs font-bold hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-1.5">{saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Save campaign</button>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={loadPeople} data-testid="rewards-participants-btn" className="px-4 py-2 rounded-full border border-white/15 text-slate-300 text-xs font-semibold hover:border-[#d4af37]/60 inline-flex items-center gap-1.5 transition-colors"><Trophy className="w-3.5 h-3.5 text-[#d4af37]" /> Participants & winners</button>
          {tenants.find(t => t.on) && <a href={`/rewards/${tenants.find(t => t.on).slug}`} target="_blank" rel="noreferrer" className="text-[11px] text-slate-400 hover:text-[#d4af37] inline-flex items-center gap-1" data-testid="rewards-preview-link"><ExternalLink className="w-3 h-3" /> preview public page</a>}
        </div>
        {people && (
          <div className="space-y-1 max-h-80 overflow-y-auto pr-1" data-testid="rewards-participants">
            {people.length === 0 && <p className="text-xs text-slate-500 italic">No customers enrolled yet.</p>}
            {people.map(p => (
              <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/5 px-3 py-2 text-xs" data-testid={`rewards-participant-${p.id}`}>
                {p.photo_url ? <img src={p.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">💇</span>}
                <div className="min-w-0 flex-1"><div className="text-slate-100 font-medium truncate">{p.name} <span className="text-slate-500">· {p.salon_name}</span></div><div className="text-[10px] text-slate-500 truncate">{p.phone} · {p.email} · {p.entries.purchases} bill{p.entries.purchases === 1 ? "" : "s"} · {p.entries.referred} referred · ❤ {p.entries.vote_count || 0} votes{p.story ? " · 📝 story" : ""}{p.consent ? "" : " · no consent"}</div></div>
                <div className="text-sm font-bold text-[#d4af37] shrink-0">{p.entries.total} <span className="text-[10px] text-slate-400 font-normal">entries</span></div>
                <select value={p.winner_tier || ""} onChange={e => setWinner(p, e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-slate-200" data-testid={`rewards-winner-${p.id}`}>
                  <option value="">— not a winner —</option>{c.rewards.map(r => <option key={r.tier} value={r.tier}>{r.emoji} {r.tier}</option>)}
                </select>
                {p.winner_tier && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => card(p, "dl")} disabled={!!cardBusy} title="Download 1080×1080 card" data-testid={`rewards-card-dl-${p.id}`} className="w-7 h-7 rounded-lg border border-[#d4af37]/40 text-[#F0D9A5] hover:bg-[#d4af37]/15 flex items-center justify-center disabled:opacity-50">{cardBusy === p.id + "dl" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}</button>
                    <button onClick={() => card(p, "share")} disabled={!!cardBusy} data-testid={`rewards-card-share-${p.id}`} className="h-7 px-2.5 rounded-lg bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50">{cardBusy === p.id + "share" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />} Share card</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
