import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import pinApi from "@/lib/ownerPin";
import { toast } from "sonner";
import { IndianRupee, DollarSign, BarChart3, Store, Calendar, Loader2 } from "lucide-react";
import { BillLookup } from "@/components/BillLookup";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { UnbilledPanel } from "@/components/reports/UnbilledPanel";
import { MembershipReportCard } from "@/components/reports/MembershipReportCard";
import { useAuth } from "@/context/AuthContext";
import { mainSalonLabel } from "@/lib/branch";
import { curSym } from "@/lib/currency";
import { TipsReportCard } from "@/components/reports/TipsReportCard";
import { LoyaltyGiftsReportCard } from "@/components/reports/LoyaltyGiftsReportCard";
import { TopKpis, TrendKpis } from "@/components/reports/ReportKpis";
import { BranchPerformance, PeriodBreakdowns, StaffBusiness } from "@/components/reports/ReportBreakdowns";
import { CommissionCard } from "@/components/reports/CommissionCard";
import { TipsPayoutTable } from "@/components/reports/TipsPayoutTable";

const FIELD = "w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm !bg-white !text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#9b3a4e]/30";

export default function Reports() {
  const { tenant, user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [commission, setCommission] = useState(null);
  const [tips, setTips] = useState(null);
  const [pct, setPct] = useState(0);
  const [repBranch, setRepBranch] = useState("");
  const [rateUnlocked, setRateUnlocked] = useState(() => sessionStorage.getItem("commission_rate_unlock") === "1");
  const [commissionUnlocked, setCommissionUnlocked] = useState(() => sessionStorage.getItem("commission_report_unlock") === "1");
  const [erasing, setErasing] = useState(false);
  const [dlg, setDlg] = useState(null);
  const isRestaurant = tenant?.business_type === "restaurant";

  const unlockRate = async () => {
    try {
      await pinApi.post("/settings/verify-owner-pin", {});
      sessionStorage.setItem("commission_rate_unlock", "1");
      setRateUnlocked(true);
      toast.success("Commission rate unlocked ✦");
    } catch (e) { toast.error(e.response?.data?.detail || "Admin PIN required"); }
  };

  const markTipsPaid = (r) => setDlg({
    title: "Hand over tips",
    message: `Mark ${r.staff_name}'s pending tips as handed over? (${r.pending_count} bill${r.pending_count === 1 ? "" : "s"})`,
    confirmLabel: "Mark as paid",
    action: async () => {
      try {
        const { data } = await api.post(`/reports/staff-tips/${r.staff_id}/mark-paid`);
        toast.success(`${r.staff_name}'s tips marked paid — ${sym}${data.amount} ✓`);
        setDlg(null);
        load();
      } catch (e) { toast.error(e.response?.data?.detail || "Couldn't mark tips paid"); }
    },
  });

  const eraseBilling = (scope) => {
    const label = scope === "all" ? "ALL billing data" : "last month's billing data";
    setDlg({
      title: "Erase billing data", danger: true, confirmLabel: "Erase permanently",
      message: `Erase ${label}? This permanently deletes those invoices (revenue & commission reports reset). This cannot be undone.`,
      action: async () => {
        setErasing(true);
        try {
          const { data } = await pinApi.post("/reports/billing-data/erase", { scope });
          toast.success(`${data.invoices_deleted} invoice(s) erased — fresh setup ready ✦`);
          setDlg(null);
          load();
        } catch (e) { toast.error(e.response?.data?.detail || "Erase failed — Admin PIN required"); }
        finally { setErasing(false); }
      },
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const a = await api.get(`/reports/sales?start=${start}&end=${end}&branch=${encodeURIComponent(repBranch)}`);
      setData(a.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't load sales report");
    }
    // Commission figures are Owner-PIN protected — fetch ONLY after explicit unlock.
    if (commissionUnlocked) {
      try {
        const b = await pinApi.get(`/reports/staff-commission?start=${start}&end=${end}&pct=${pct}`);
        setCommission(b.data);
      } catch (e) {
        toast.error(e.response?.data?.detail || "Commission report needs the Owner PIN");
      }
    }
    try {
      const c = await api.get(`/reports/staff-tips?start=${start}&end=${end}`);
      setTips(c.data);
    } catch { /* tips report optional */ }
    setLoading(false);
  }, [start, end, pct, repBranch, commissionUnlocked]);
  useEffect(() => { load(); }, [load]);

  const unlockCommission = async () => {
    try {
      const b = await pinApi.get(`/reports/staff-commission?start=${start}&end=${end}&pct=${pct}`);
      setCommission(b.data);
      sessionStorage.setItem("commission_report_unlock", "1");
      setCommissionUnlocked(true);
      toast.success("Commission report unlocked ✦");
    } catch (e) { toast.error(e.response?.data?.detail || "Owner PIN required"); }
  };

  const sym = curSym(tenant);
  const CurIcon = (tenant?.currency || "INR") === "INR" ? IndianRupee : DollarSign;
  const inr = (n) => `${sym}${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4" data-testid="report-header">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-[#9b3a4e] flex items-center justify-center shadow-sm"><BarChart3 className="w-6 h-6" /></div>
          <div>
            <h1 className="font-playfair text-3xl sm:text-4xl text-slate-900">Sales Reports</h1>
            <p className="text-slate-500 text-sm mt-1">Insights into {isRestaurant ? "restaurant" : "salon"} performance and revenue.</p>
          </div>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">From</label>
            <div className="relative"><Calendar className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9b3a4e]/70 pointer-events-none" />
              <input data-testid="report-start" type="date" className={FIELD} value={start} onChange={e => setStart(e.target.value)} /></div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">To</label>
            <div className="relative"><Calendar className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9b3a4e]/70 pointer-events-none" />
              <input data-testid="report-end" type="date" className={FIELD} value={end} onChange={e => setEnd(e.target.value)} /></div>
          </div>
          <div className="min-w-[220px]">
            <label className="block text-xs text-slate-500 mb-1.5">{isRestaurant ? "Restaurant / Branch" : "Salon / Branch"}</label>
            <div className="relative"><Store className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9b3a4e]/70 pointer-events-none" />
              {user?.role === "manager" ? (
                <div className={`${FIELD} text-slate-600 !bg-slate-50 cursor-not-allowed`} data-testid="report-branch-locked">
                  🔒 {user?.branch === "__main__" ? mainSalonLabel(tenant) : (user?.branch || (isRestaurant ? "Your restaurant" : "Your salon"))}
                </div>
              ) : (
                <select data-testid="report-branch-filter" className={`${FIELD} appearance-auto`} value={repBranch} onChange={e => setRepBranch(e.target.value)}>
                  <option value="">{isRestaurant ? "All restaurants" : "All salons"}</option>
                  <option value="__main__">{mainSalonLabel(tenant)} (Main)</option>
                  {(tenant?.branches || []).map(b => <option key={b.id || b.name} value={b.name}>{b.name}</option>)}
                </select>
              )}
            </div>
          </div>
          <button data-testid="report-generate-btn" onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7f2d3f] to-[#a83d54] text-white text-sm font-semibold shadow-[0_10px_24px_-10px_rgba(155,58,78,.7)] hover:brightness-110 disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />} Generate Report
          </button>
        </div>
      </div>

      {data && <TopKpis data={data} inr={inr} CurIcon={CurIcon} />}

      <BillLookup />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <TipsReportCard restaurant={isRestaurant} />
        <LoyaltyGiftsReportCard />
      </div>

      {!data ? <div className="text-slate-500 text-sm">Loading report…</div> : (
        <>
          <TrendKpis data={data} inr={inr} start={start} end={end} />
          <MembershipReportCard />
          <BranchPerformance data={data} inr={inr} />
          <PeriodBreakdowns data={data} sym={sym} />
          <StaffBusiness data={data} sym={sym} />
          <UnbilledPanel sym={sym} isOwner={user?.role === "admin"} />
          <CommissionCard commission={commission} unlocked={commissionUnlocked} pct={pct} setPct={setPct} rateUnlocked={rateUnlocked}
            unlockRate={unlockRate} unlockCommission={unlockCommission} eraseBilling={eraseBilling} erasing={erasing} inr={inr} />
          <TipsPayoutTable tips={tips} inr={inr} markTipsPaid={markTipsPaid} />
        </>
      )}
      {dlg && <ConfirmDialog open {...dlg} busy={erasing} onConfirm={() => dlg.action()} onClose={() => setDlg(null)} />}
    </div>
  );
}
