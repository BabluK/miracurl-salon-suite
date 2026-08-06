import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Crown, CheckCircle2, XCircle } from "lucide-react";

const TIER_CHIP = {
  silver: "bg-slate-100 text-slate-700", gold: "bg-amber-100 text-amber-800",
  platinum: "bg-violet-100 text-violet-700", diamond: "bg-cyan-100 text-cyan-700",
  custom: "bg-orange-100 text-orange-700",
};
const fmt = (d) => { try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d || "—"; } };

const waCardLink = (r) => {
  const base = window.location.origin;
  const msg = `🎉 Hi ${r.customer_name}! Your ${String(r.tier || "").toUpperCase()} membership card is ready ✦\n\n🪪 Member ID: ${r.member_id}\n💳 Plan: ${r.plan}\n📅 Valid till: ${fmt(r.expires_at)}\n\nView & download your card (with QR):\n${base}/member/${r.member_id}\n\nShow the QR or your Member ID on every visit to enjoy your perks 💛`;
  const digits = String(r.phone || "").replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(msg)}`;
};

// All onboarded members — sold at POS by the salon or purchased online by the customer.
export function MembersPanel() {
  const [data, setData] = useState({ members: [], pending_upi: [] });
  const load = useCallback(() => {
    api.get("/premium-membership/members").then(r => setData(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(oid, action) {
    try {
      const { data: d } = await api.post(`/premium-membership/orders/${oid}/${action}`);
      toast.success(action === "approve" ? `Membership activated ✦ ${d.member_id || ""}` : "Order rejected");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Action failed"); }
  }

  return (
    <div className="space-y-4" data-testid="members-panel">
      {data.pending_upi.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4" data-testid="members-pending-upi">
          <div className="text-sm font-semibold text-amber-800 mb-2">⏳ UPI payments awaiting your confirmation</div>
          {data.pending_upi.map(o => (
            <div key={o.id} className="flex items-center justify-between gap-2 py-2 border-t border-amber-100 text-sm">
              <div>
                <b>{o.buyer_name}</b> · {o.plan_name} · ₹{Number(o.amount).toLocaleString("en-IN")}
                <div className="text-xs text-amber-700/80">UPI ref: {o.upi_ref} · {o.buyer_phone}</div>
              </div>
              <div className="flex gap-2">
                <button data-testid={`approve-member-${o.id}`} onClick={() => decide(o.id, "approve")}
                  className="inline-flex items-center gap-1 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-full font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Approve</button>
                <button data-testid={`reject-member-${o.id}`} onClick={() => decide(o.id, "reject")}
                  className="inline-flex items-center gap-1 text-xs border border-rose-300 text-rose-600 px-3 py-1.5 rounded-full font-semibold"><XCircle className="w-3.5 h-3.5" /> Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center"><Crown className="w-4 h-4" /></div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">Onboarded members ({data.members.length})</h3>
            <p className="text-[11px] text-slate-500">Both salon-sold (POS) and customer-purchased (online) memberships</p>
          </div>
        </div>
        {data.members.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-8">No members yet — sell one at POS or share your booking page&apos;s 💳 Premium Membership link.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[820px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-3">Member</th><th className="py-2 pr-3">Member ID</th><th className="py-2 pr-3">Plan</th>
                  <th className="py-2 pr-3">Source</th><th className="py-2 pr-3">Validity</th><th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Wallet · Points</th>
                  <th className="py-2 pl-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50" data-testid={`member-row-${i}`}>
                    <td className="py-2 pr-3 font-medium text-slate-700">{r.customer_name}<div className="text-[10px] text-slate-400">{r.phone}</div></td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-slate-600">
                      {r.member_id ? <a className="hover:text-amber-600 underline decoration-dotted" href={`/member/${r.member_id}`} target="_blank" rel="noreferrer">{r.member_id}</a> : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${TIER_CHIP[r.tier] || "bg-slate-100 text-slate-600"}`}>{r.plan}</span>
                      <div className="text-[10px] text-slate-400 mt-0.5">₹{Number(r.amount).toLocaleString("en-IN")} · {r.cashback_pct}% cb{r.discount_pct ? ` · ${r.discount_pct}% off` : ""}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.source === "online" ? "bg-sky-50 text-sky-700 border border-sky-200" : "bg-slate-50 text-slate-600 border border-slate-200"}`}>
                        {r.source === "online" ? "🌐 Online" : "🏪 Salon (POS)"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{fmt(r.purchased_at)} → {fmt(r.expires_at)}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{r.status}</span>
                    </td>
                    <td className="py-2 text-right text-slate-700 font-semibold">₹{Number(r.wallet_balance).toLocaleString("en-IN")} <span className="text-slate-400 font-normal">· {r.loyalty_points} pts</span></td>
                    <td className="py-2 pl-2 text-right">
                      {r.member_id && r.phone && (
                        <a data-testid={`wa-card-${i}`} href={waCardLink(r)} target="_blank" rel="noreferrer"
                          title="Send the membership card & QR link on WhatsApp"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 hover:bg-emerald-100">
                          💬 Card
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
