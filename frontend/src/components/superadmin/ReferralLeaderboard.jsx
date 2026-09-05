import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Trophy, Gift, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { confirmAsync } from "@/components/ConfirmDialog";

const shiftMonth = (ym, d) => { const [y, m] = ym.split("-").map(Number); const dt = new Date(y, m - 1 + d, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; };
const label = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const medal = ["🥇", "🥈", "🥉"];

export function ReferralLeaderboard() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = (m) => api.get("/super-admin/referral-leaderboard", { params: { month: m } }).then(r => setData(r.data)).catch(() => setData({ month: m, leaders: [] }));
  useEffect(() => { load(month); }, [month]);

  const gift = async (l) => {
    if (!await confirmAsync(`Send ${l.name} a thank-you gift of +30 days free access and a thank-you email to the owner?`, { title: "Thank-you gift", confirmLabel: "Send gift 🎁" })) return;
    setBusy(l.tenant_id);
    try {
      const { data: d } = await api.post(`/super-admin/referral-leaderboard/${l.tenant_id}/gift`, { days: 30 }, { params: { month } });
      toast.success(`🎁 +30 days added for ${l.name}${d.email_sent ? " · thank-you email sent" : ""}`);
      load(month);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't send the gift"); }
    setBusy(null);
  };

  if (!data) return null;
  return (
    <div className="rounded-2xl border border-[#d4af37]/30 bg-[#15151b] p-4" data-testid="referral-leaderboard">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-[#d4af37]/80 uppercase inline-flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Referral Leaderboard</p>
        <div className="flex items-center gap-1 text-xs text-slate-300">
          <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="p-1 rounded hover:bg-white/10" data-testid="referral-month-prev"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <span className="min-w-[120px] text-center" data-testid="referral-month-label">{label(month)}</span>
          <button onClick={() => setMonth(m => shiftMonth(m, 1))} className="p-1 rounded hover:bg-white/10" data-testid="referral-month-next"><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {data.leaders.length === 0 && <p className="text-xs text-slate-500 italic px-1">No referrals signed up in {label(month)} yet — the top referring salons will appear here ✦</p>}
      <div className="space-y-1.5">
        {data.leaders.map(l => (
          <div key={l.tenant_id} className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/5 px-3 py-2" data-testid={`referral-leader-${l.slug}`}>
            <span className="w-7 text-center text-base">{medal[l.rank - 1] || <span className="text-xs text-slate-500">#{l.rank}</span>}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-slate-100 font-medium truncate">{l.business_type === "restaurant" ? "🍽️ " : "💇 "}{l.name}</div>
              <div className="text-[10px] text-slate-500 truncate">{l.slug}{l.location ? ` · ${l.location}` : ""}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-bold text-[#d4af37]">{l.qualified} <span className="text-[10px] font-normal text-slate-400">qualified</span></div>
              <div className="text-[10px] text-slate-500">{l.signups} signup{l.signups === 1 ? "" : "s"}</div>
            </div>
            {l.gift ? (
              <span className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold" title={`Sent ${new Date(l.gift.sent_at).toLocaleDateString("en-IN")}`} data-testid={`referral-gifted-${l.slug}`}>🎁 +{l.gift.days} d sent</span>
            ) : (
              <button onClick={() => gift(l)} disabled={busy === l.tenant_id} data-testid={`referral-gift-${l.slug}`}
                className="shrink-0 px-3 py-1.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-[11px] font-bold inline-flex items-center gap-1 hover:brightness-110 disabled:opacity-50">
                {busy === l.tenant_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gift className="w-3 h-3" />} Thank-you gift
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
