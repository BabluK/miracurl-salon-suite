import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, EyeOff } from "lucide-react";
import { PinDialog, BriefingCard, SnapshotHero, RevenueBreakdown, TeamAndPayments } from "@/components/dashboard/OwnerDashboardBits";

const inr = (n) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function OwnerDashboard() {
  const nav = useNavigate();
  const { user, tenant } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [cur, setCur] = useState("yesterday");

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
      <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)]" data-testid="owner-dashboard-locked">
        <PinDialog title="Owner Dashboard PIN" hint="Enter the dashboard PIN to view collections." busy={busy} onCancel={() => nav("/settings")} onConfirm={unlock} testid="owner-dashboard" />
      </div>
    );
  }

  const p = data.periods.find(x => x.key === cur) || data.periods[0];
  const yesterday = data.periods.find(x => x.key === "yesterday");
  const bookingUrl = `${window.location.origin}/book/${tenant?.slug || "miracurl-unisex-family-salon"}`;
  const firstName = (user?.name || "Owner").split(" ")[0];

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] space-y-5" data-testid="owner-dashboard-page">
      <div className="flex items-center justify-between">
        <button onClick={() => nav("/settings")} data-testid="owner-dashboard-back" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"><ArrowLeft className="w-3.5 h-3.5" /> Settings</button>
        <button data-testid="owner-dashboard-lock-btn" onClick={() => setData(null)} title="Lock" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-full border border-slate-200 bg-white"><EyeOff className="w-3.5 h-3.5" /> Lock</button>
      </div>
      <BriefingCard name={firstName} date={data.date} yesterday={yesterday} briefing={data.briefing} inr={inr} />
      <SnapshotHero name={data.branch.name} period={p} periods={data.periods} cur={cur} onPick={setCur} bookingUrl={bookingUrl} inr={inr} />
      <RevenueBreakdown period={p} inr={inr} />
      <TeamAndPayments period={p} inr={inr} />
    </div>
  );
}
