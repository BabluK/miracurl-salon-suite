import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";
import { Store, Coins, EyeOff, ArrowLeft, CalendarRange } from "lucide-react";
import { GroupKpis, BranchCard } from "@/components/dashboard/GroupDashboardBits";
import { PinDialog, SnapshotHero, DailyBars } from "@/components/dashboard/OwnerDashboardBits";

const inr = (n) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtD = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const chip = (on) => `text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
  on ? "bg-[#e8c56a] border-[#e8c56a] text-[#1a1408] font-semibold" : "bg-white/5 border-white/15 text-white/65 hover:text-white hover:border-[#e8c56a]/60"}`;

export default function OwnerDashboard() {
  const nav = useNavigate();
  const { tenant } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [cur, setCur] = useState("today");

  useEffect(() => {
    api.get("/owner-dashboard/status").then(r => { if (!r.data.available) setGone(true); }).catch(() => {});
  }, []);

  const unlock = async (pin) => {
    setBusy(true);
    try {
      const r = await api.post("/owner-dashboard/unlock", { pin });
      setData(r.data);
      toast.success("Owner Dashboard unlocked ✦");
    } catch (e) {
      if (e.response?.status === 404) setGone(true);
      else toast.error(e.response?.data?.detail || "Couldn't unlock");
    } finally { setBusy(false); }
  };

  if (gone) {
    return (
      <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-8 min-h-[calc(100vh-4rem)] flex items-center justify-center" data-testid="owner-dashboard-gone">
        <div className="text-center text-slate-600"><p className="font-playfair text-2xl text-slate-900">This dashboard has been removed</p>
          <button onClick={() => nav("/settings")} className="mt-4 text-sm underline">Back to Settings</button></div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] bg-[#0b0a08]" data-testid="owner-dashboard-locked">
        <PinDialog title="Owner Dashboard PIN" hint="Enter the dashboard PIN to view collections." busy={busy} onCancel={() => nav("/settings")} onConfirm={unlock} testid="owner-dashboard" />
      </div>
    );
  }

  const p = data.periods.find(x => x.key === cur) || data.periods[0];
  const today = data.periods[0];
  const month = data.periods.find(x => x.key === "month");
  const bookingUrl = `${window.location.origin}/book/${tenant?.slug || "miracurl-unisex-family-salon"}`;
  const rangeLabel = p.range.from === p.range.to ? fmtD(p.range.from) : `${fmtD(p.range.from)} – ${fmtD(p.range.to)}`;

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] space-y-6" data-testid="owner-dashboard-page">
      <button onClick={() => nav("/settings")} data-testid="owner-dashboard-back" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"><ArrowLeft className="w-3.5 h-3.5" /> Settings</button>
      <SnapshotHero name={data.branch.name} today={today.total} bills={today.total_bills} bookingUrl={bookingUrl} inr={inr} />

      <section className="relative overflow-hidden rounded-3xl bg-[#14100c] text-white shadow-[0_30px_60px_-30px_rgba(0,0,0,.6)]" data-testid="owner-dashboard-group">
        <img src="/assets/dashboard/hero-salon.jpg" alt="" className="absolute inset-0 w-full h-full object-cover object-right opacity-35 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b0a08] via-[#0b0a08]/92 to-[#0b0a08]/55 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0a08] via-transparent to-transparent pointer-events-none" />
        <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-[#e8c56a]/10 blur-3xl pointer-events-none" />
        <div className="relative p-6 sm:p-7">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#e8c56a] font-semibold flex items-center gap-1.5"><Store className="w-3.5 h-3.5" /> Branch Dashboard · {p.label}</div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-playfair text-4xl sm:text-5xl leading-none" data-testid="owner-total">{inr(p.total)}</span>
                <span className="text-sm text-white/60 inline-flex items-center gap-1.5" data-testid="owner-period-label"><CalendarRange className="w-3.5 h-3.5 opacity-70" /> {rangeLabel}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden xl:block font-playfair italic text-[#e8c56a] text-xl leading-tight text-right rotate-[-4deg] mr-2 select-none">More Beauty<br />More Confidence</span>
              <div className="flex items-center gap-3 rounded-2xl border border-[#e8c56a]/35 bg-black/30 px-4 py-2.5" data-testid="owner-month-pill">
                <span className="w-9 h-9 rounded-xl bg-[#e8c56a]/15 text-[#e8c56a] flex items-center justify-center"><Coins className="w-5 h-5" strokeWidth={1.7} /></span>
                <span className="text-xs text-white/55 leading-tight">This month<br /><span className="font-playfair text-xl text-white" data-testid="owner-month-total">{inr(month?.total)}</span></span>
              </div>
              <button data-testid="owner-dashboard-lock-btn" onClick={() => setData(null)} title="Lock"
                className="p-2.5 rounded-full bg-white/10 border border-white/15 text-white/70 hover:text-white hover:bg-white/20 transition-colors"><EyeOff className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2" data-testid="owner-period-chips">
            {data.periods.map(x => <button key={x.key} data-testid={`owner-period-${x.key}`} onClick={() => setCur(x.key)} className={chip(cur === x.key)}>{x.label}</button>)}
          </div>

          <GroupKpis data={p} inr={inr} />
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {p.salons.map((s) => <BranchCard key={s.slug} s={{ ...s, logo_url: tenant?.logo_url }} rank={1} showAvg={cur !== "today"} inr={inr} />)}
            <DailyBars days={p.days} inr={inr} />
          </div>
        </div>
      </section>
    </div>
  );
}
