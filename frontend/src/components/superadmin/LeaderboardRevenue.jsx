import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Trophy, Gift, Bell, Send, TrendingUp, Download, IndianRupee, Crown, X } from "lucide-react";
import { openWhatsApp } from "@/lib/share";

export function LeaderboardPanel() {
  const [data, setData] = useState({ items: [], reward_per_signup: 1000 });
  const [loading, setLoading] = useState(true);
  const [renewals, setRenewals] = useState({ items: [], count: 0 });
  const [autoLog, setAutoLog] = useState([]);
  const [refTrack, setRefTrack] = useState(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    api.get("/super-admin/affiliates/leaderboard")
      .then(r => setData(r.data))
      .catch(e => toast.error(e.response?.data?.detail || "Couldn't load leaderboard"))
      .finally(() => setLoading(false));
    api.get("/super-admin/renewals/queue?window_days=10")
      .then(r => setRenewals(r.data)).catch(() => {});
    api.get("/super-admin/renewals/reminder-log")
      .then(r => setAutoLog(r.data.items || [])).catch(() => {});
    api.get("/super-admin/affiliates/referrals")
      .then(r => setRefTrack(r.data)).catch(() => {});
  }, []);
  const items = data.items || [];
  const medal = (i) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;

  const runAutoNow = async () => {
    setRunning(true);
    try {
      const { data: out } = await api.post("/super-admin/renewals/run-auto-reminders");
      toast.success(`Checked ${out.checked} due tenants — ${out.sent} email(s) sent, ${out.skipped} already reminded`);
      const r = await api.get("/super-admin/renewals/reminder-log");
      setAutoLog(r.data.items || []);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't run reminders"); }
    finally { setRunning(false); }
  };

  const markReminded = async (tid) => {
    try {
      await api.post(`/super-admin/renewals/${tid}/mark-reminded`);
      setRenewals(prev => ({
        ...prev,
        items: prev.items.map(r => r.id === tid ? { ...r, reminder_count: (r.reminder_count || 0) + 1, last_reminder_at: new Date().toISOString() } : r),
      }));
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't update"); }
  };

  const remindWA = (r) => {
    const num = (r.whatsapp_number || r.phone || "").replace(/\D/g, "");
    if (!num) { toast.error(`No WhatsApp/phone for ${r.name}`); return; }
    const days = r.days_remaining;
    const line = days < 0
      ? `expired *${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago*`
      : days === 0 ? "*ends today*" : `ends in *${days} day${days === 1 ? "" : "s"}*`;
    const text = `Hi ${r.name} ✦ Just a friendly reminder from Miracurl — your ${r.source} ${line} (${r.end_date}). Renew directly inside your dashboard → Settings → Subscription → Pay via Razorpay (UPI/card). Reply here if you need help. — Team Miracurl`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    markReminded(r.id);
  };

  return (
    <div className="space-y-6" data-testid="leaderboard-panel">
      {/* ─── Renewal queue ─── */}
      <div>
        <h2 className="font-playfair text-2xl flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
            <Bell className="w-4 h-4" />
          </span>
          Renewals due
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Tenants whose plan / trial ends in the next 10 days. Tap WhatsApp to send a personalised renewal nudge.
        </p>
      </div>
      {renewals.items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-500" data-testid="renewals-empty">
          🎉 Nobody expiring in the next {renewals.window_days || 10} days.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Salon</th>
                <th className="px-4 py-3 text-left font-medium">Plan / Source</th>
                <th className="px-4 py-3 text-right font-medium">Ends</th>
                <th className="px-4 py-3 text-right font-medium">Reminded</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {renewals.items.map(r => {
                const overdue = r.days_remaining < 0;
                const urgent = r.days_remaining <= 3;
                const chip = overdue
                  ? "bg-rose-100 text-rose-700"
                  : urgent ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700";
                return (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50" data-testid={`renewal-row-${r.slug}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{r.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {r.plan || "—"}
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider">{r.source}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-xs text-slate-600">{r.end_date}</div>
                      <div className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${chip}`}>
                        {overdue ? `${Math.abs(r.days_remaining)}d overdue` : r.days_remaining === 0 ? "today" : `${r.days_remaining}d left`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {r.reminder_count > 0 ? `${r.reminder_count}× · ${new Date(r.last_reminder_at).toLocaleDateString("en-IN")}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => remindWA(r)}
                        data-testid={`renewal-wa-${r.slug}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold"
                      >
                        <Send className="w-3.5 h-3.5" /> WhatsApp
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Automated 15/7/1 reminders ─── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm" data-testid="auto-reminders-card">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs">⚡</span>
              Automated reminders — ON
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Every day after 10 AM IST, owners whose subscription or trial ends in exactly <b>15, 7 or 1 day(s)</b> automatically get a branded renewal email with a Razorpay pay link. Each reminder is sent only once.
            </p>
          </div>
          <button
            onClick={runAutoNow}
            disabled={running}
            data-testid="run-auto-reminders-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold disabled:opacity-50"
          >
            {running ? "Running…" : "Run check now"}
          </button>
        </div>
        {autoLog.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Recent auto-reminders</div>
            <div className="space-y-1.5" data-testid="auto-reminder-log">
              {autoLog.slice(0, 8).map(l => (
                <div key={l.id} className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded font-mono font-semibold ${l.days_mark === 1 ? "bg-rose-100 text-rose-700" : l.days_mark === 7 ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`}>D-{l.days_mark}</span>
                  <span className="font-medium text-slate-800">{l.tenant_name || l.slug}</span>
                  <span className={l.email_sent ? "text-emerald-600" : "text-rose-500"} title={l.email_error || ""}>
                    {l.email_sent ? "✓ email sent" : `✗ email failed`}
                  </span>
                  <span className="text-slate-400">{new Date(l.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  {l.wa_link && (
                    <a href={l.wa_link} target="_blank" rel="noopener noreferrer"
                       className="text-emerald-600 hover:text-emerald-700 font-semibold" data-testid={`auto-log-wa-${l.slug}`}>
                      WhatsApp →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Top Referrers ─── */}
      <div className="pt-4">
        <h1 className="font-playfair text-3xl flex items-center gap-3">
          <Trophy className="w-7 h-7 text-amber-500" /> Top Referrers
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Salons earning the most via the Refer-a-Salon program. Each verified signup credits ₹{Number(data.reward_per_signup).toLocaleString("en-IN")} to the referrer&apos;s renewal balance.
        </p>
      </div>
      {loading ? (
        <div className="text-slate-500 text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center" data-testid="leaderboard-empty">
          <Gift className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <div className="text-slate-700 font-medium">No referrals yet</div>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Once your salons share their <span className="font-mono">?ref=</span> links and bring in new tenants, they&apos;ll appear here ranked by total credits earned.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Rank</th>
                <th className="px-4 py-3 text-left font-medium">Salon</th>
                <th className="px-4 py-3 text-right font-medium">Referrals</th>
                <th className="px-4 py-3 text-right font-medium">Credit Earned</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50" data-testid={`leaderboard-row-${r.slug}`}>
                  <td className="px-4 py-3 text-2xl">{medal(i)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{r.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{r.slug} · {r.owner_email}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">{r.referral_count}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-600">
                    ₹{Number(r.affiliate_credits || 0).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Referral tracking ─── */}
      {refTrack && refTrack.items?.length > 0 && (
        <div className="pt-2" data-testid="referral-tracking-section">
          <h2 className="font-playfair text-2xl flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-rose-100 text-rose-500 flex items-center justify-center">
              <Gift className="w-4 h-4" />
            </span>
            Referral tracking
          </h2>
          <div className="flex flex-wrap gap-2 mt-3 mb-4">
            <span className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">{refTrack.stats.total} total</span>
            <span className="text-xs px-3 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">{refTrack.stats.pending} pending payment</span>
            <span className="text-xs px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">{refTrack.stats.credited} credited · ₹{Number(refTrack.stats.credited_inr).toLocaleString("en-IN")}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Referred salon</th>
                  <th className="px-4 py-3 text-left font-medium">Referred by</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Reward</th>
                </tr>
              </thead>
              <tbody>
                {refTrack.items.slice(0, 30).map(r => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50" data-testid={`referral-row-${r.referred_slug}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{r.referred_salon_name || r.referred_slug}</div>
                      <div className="text-xs text-slate-500 font-mono">{r.referred_slug}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.referrer_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === "pending" ? (
                        <span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium" title="Credited once this salon makes its first subscription payment">⏳ pending payment</span>
                      ) : (
                        <span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓ ₹{Number(r.credit_amount || 0).toLocaleString("en-IN")} credited</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


export function RevenuePanel() {
  const [rev, setRev] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/super-admin/subscriptions/revenue")
      .then(r => setRev(r.data))
      .catch(e => toast.error(e.response?.data?.detail || "Couldn't load revenue"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-500 text-sm">Loading revenue metrics…</div>;
  if (!rev) return null;

  const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const trendMax = Math.max(1, ...rev.trend_30d.map(d => d.amount));

  const downloadCsv = async () => {
    try {
      const r = await api.get("/super-admin/subscriptions/export.csv", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `miracurl-revenue-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error("Couldn't download CSV"); }
  };

  return (
    <div className="space-y-6" data-testid="revenue-panel">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-playfair text-3xl flex items-center gap-3">
            <TrendingUp className="w-7 h-7 text-emerald-500" /> Revenue
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Real-time SaaS metrics — recurring revenue, churn and top-earning salons.
          </p>
        </div>
        <button
          onClick={downloadCsv}
          data-testid="revenue-export-btn"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Big-number cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="MRR" value={fmt(rev.mrr)} note="Monthly recurring" accent="emerald" data-testid="stat-mrr" />
        <StatCard label="ARR" value={fmt(rev.arr)} note="Annual run-rate" accent="sky" data-testid="stat-arr" />
        <StatCard label="This month" value={fmt(rev.this_month)} note="Collected" accent="violet" data-testid="stat-month" />
        <StatCard label="All-time" value={fmt(rev.all_time)} note="Since day 1" accent="amber" data-testid="stat-alltime" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active subs" value={rev.active_subscriptions} note="Paying tenants" accent="slate" />
        <StatCard label="Churned 30d" value={rev.cancelled_30d} note={`${rev.churn_pct}% rate`} accent="rose" />
        <StatCard label="Avg lifetime" value={rev.avg_lifetime_days ? `${rev.avg_lifetime_days} d` : "—"} note="Cancelled subs" accent="indigo" />
        <StatCard label="Today" value={fmt(rev.today)} note="Cash in" accent="emerald" />
      </div>

      {/* 30-day trend bar chart */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Last 30 days · daily revenue</h3>
        <div className="flex items-end gap-1 h-40" data-testid="revenue-trend-chart">
          {rev.trend_30d.map(d => {
            const h = trendMax > 0 ? Math.max(2, (d.amount / trendMax) * 100) : 2;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center group relative">
                <div
                  className={`w-full rounded-t transition ${d.amount > 0 ? "bg-gradient-to-t from-emerald-500 to-emerald-300" : "bg-slate-100"}`}
                  style={{ height: `${h}%` }}
                  title={`${d.date}: ${fmt(d.amount)}`}
                />
                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 text-[10px] text-slate-700 bg-white shadow px-1.5 py-0.5 rounded whitespace-nowrap">
                  {d.date.slice(5)} · {fmt(d.amount)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Plan distribution + Top tenants */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Active plan mix</h3>
          {rev.plan_distribution.length === 0 ? (
            <div className="text-xs text-slate-500 py-6 text-center">No active paid subscriptions yet.</div>
          ) : rev.plan_distribution.map(p => (
            <div key={p.plan} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
              <div className="text-sm text-slate-700">{p.label}</div>
              <div className="text-sm font-semibold text-slate-900">{p.count}</div>
            </div>
          ))}
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Top 5 tenants (all-time)</h3>
          {rev.top_tenants.length === 0 ? (
            <div className="text-xs text-slate-500 py-6 text-center">Nobody paid yet.</div>
          ) : rev.top_tenants.map((t, i) => (
            <div key={t.tenant_id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0" data-testid={`top-tenant-${t.slug}`}>
              <div>
                <div className="text-sm text-slate-800 flex items-center gap-2">
                  <span className="text-slate-400 text-xs w-5">#{i + 1}</span> {t.name}
                </div>
                <div className="text-[11px] text-slate-500 font-mono ml-7">{t.slug}</div>
              </div>
              <div className="text-sm font-semibold text-emerald-600 font-mono">{fmt(t.total_paid)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, note, accent = "slate", ...rest }) {
  const styles = {
    emerald: "border-emerald-100 bg-emerald-50/40",
    sky: "border-sky-100 bg-sky-50/40",
    violet: "border-violet-100 bg-violet-50/40",
    amber: "border-amber-100 bg-amber-50/40",
    slate: "border-slate-100 bg-slate-50/40",
    rose: "border-rose-100 bg-rose-50/40",
    indigo: "border-indigo-100 bg-indigo-50/40",
  };
  return (
    <div className={`bg-white border rounded-2xl p-4 shadow-sm ${styles[accent] || styles.slate}`} {...rest}>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{note}</div>
    </div>
  );
}


