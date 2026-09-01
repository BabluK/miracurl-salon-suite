import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Gift, Copy, MessageCircle, Mail, CheckCircle2 } from "lucide-react";

export function ReferEarnCard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/referrals/summary").then(r => {
      setData(r.data);
      (r.data.new_rewards || []).forEach(rw =>
        toast.success(`🎉 Referral reward unlocked — +${rw.days} days FREE added to your plan!`, { duration: 8000 }));
    }).catch(() => {});
  }, []);

  if (!data) return null;
  const link = data.link_salon;
  const shareMsg = `I run my business on Miracurl Suite — bookings, billing, staff & AI marketing in ONE dashboard. Start your free trial with my link: ${link} (restaurants: ${data.link_restaurant})`;
  const copy = async (v) => { try { await navigator.clipboard.writeText(v); toast.success("Copied!"); } catch { toast.error("Long-press to copy"); } };
  const next = data.next_milestone;
  const pct = next ? Math.min(100, Math.round((data.qualified / next.count) * 100)) : 100;

  return (
    <div className="bg-white rounded-2xl border border-amber-200 p-5" data-testid="refer-earn-card">
      <h3 className="font-semibold text-slate-800 flex items-center gap-2">
        <Gift className="w-4 h-4 text-amber-500" /> Refer &amp; Earn — free months of Miracurl
      </h3>
      <p className="text-xs text-slate-500 mt-1">
        Invite other businesses. When a referral signs up with your link AND starts really using Miracurl
        (services + staff + 5 bills in their first 14 days), it counts as <b>qualified</b> — and your plan extends automatically.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        {data.milestones.map(m => (
          <span key={m.count} className={`px-2.5 py-1 rounded-full border font-semibold ${data.qualified >= m.count ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
            {data.qualified >= m.count ? "✓ " : ""}{m.count} qualified → +{m.days >= 30 ? `${Math.round(m.days / 30)} month${m.days > 30 ? "s" : ""}` : `${m.days} days`}
          </span>
        ))}
      </div>
      {next ? (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span data-testid="refer-progress-label"><b>{data.qualified}</b> of {next.count} qualified — {next.count - data.qualified} more for +{next.days >= 30 ? `${Math.round(next.days / 30)} month${next.days > 30 ? "s" : ""}` : `${next.days} days`} free</span>
            <span>Access until {data.access_until}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-emerald-700 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> All milestones unlocked — every extra paying referral keeps earning you more. Talk to us about the Partner Program!</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="text-[11px] px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 truncate max-w-full" data-testid="refer-link">{link}</code>
        <button onClick={() => copy(link)} data-testid="refer-copy-btn" className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"><Copy className="w-3.5 h-3.5 text-slate-500" /></button>
        <a href={`https://wa.me/?text=${encodeURIComponent(shareMsg)}`} target="_blank" rel="noreferrer" data-testid="refer-share-wa"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>
        <a href={`mailto:?subject=${encodeURIComponent("Try Miracurl Suite — free trial")}&body=${encodeURIComponent(shareMsg)}`} data-testid="refer-share-email"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-white text-xs font-bold hover:bg-slate-700"><Mail className="w-3.5 h-3.5" /> Email</a>
      </div>
      {data.referrals.length > 0 && (
        <div className="mt-4" data-testid="refer-list">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">Your referrals</div>
          <div className="space-y-1">
            {data.referrals.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-slate-600">
                <span className="truncate">{r.business_type === "restaurant" ? "🍽️" : "💇"} {r.name} <span className="text-slate-400">· joined {r.signed_up}</span></span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.subscribed ? "bg-fuchsia-50 text-fuchsia-700" : r.qualified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {r.subscribed ? "💎 Subscribed" : r.qualified ? "✓ Qualified" : "⏳ Signed up — not active yet"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
