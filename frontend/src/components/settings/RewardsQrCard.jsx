import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Gift, Download, Loader2, ExternalLink, Trophy, Share2 } from "lucide-react";
import { fetchCardBlob, downloadBlob, shareWinnerCard, whatsappShareText } from "@/lib/winnerCard";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export function RewardsQrCard() {
  const [d, setD] = useState(null);
  const [dl, setDl] = useState(false);
  useEffect(() => { api.get("/settings/rewards-campaign").then(r => setD(r.data)).catch(() => {}); }, []);
  if (!d || !d.enabled) return null;
  if (d.agreement && !d.agreement.accepted) return (
    <div className="bg-white rounded-2xl border border-amber-200 p-6 mt-6" data-testid="rewards-qr-locked">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><Gift className="w-5 h-5" /></div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{d.campaign?.name} — QR poster locked</h2>
          <p className="text-xs text-slate-500 mt-1">Your casting page and print-ready QR poster unlock the moment you accept the Participation Agreement above (Brand Model Campaign — agreement &amp; documents).</p>
          <a href="#campaign-agreement" className="mt-3 inline-flex h-9 px-4 items-center rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700" data-testid="rewards-qr-locked-link">Review &amp; accept agreement</a>
        </div>
      </div>
    </div>
  );
  const src = `${BACKEND_URL}/api/settings/rewards-qr-poster.png?origin=${encodeURIComponent(window.location.origin)}`;
  const download = async () => {
    setDl(true);
    try {
      const { data } = await api.get("/settings/rewards-qr-poster.png", { params: { origin: window.location.origin }, responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = "rewards-campaign-qr.jpg"; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Couldn't generate the rewards poster"); }
    setDl(false);
  };
  const c = d.campaign;
  const winners = d.participants.filter(p => p.winner_tier);
  const card = async (p, mode, fmt = "square") => {
    setDl(p.id + mode + fmt);
    try {
      const blob = await fetchCardBlob(api, `/settings/rewards-winner-card/${p.id}.png`, fmt);
      const filename = `brand-model-${p.name.toLowerCase().replace(/\s+/g, "-")}${fmt === "story" ? "-story" : ""}.png`;
      if (mode === "dl") { downloadBlob(blob, filename); toast.success("Winner card downloaded"); }
      else await shareWinnerCard({ blob, filename, text: whatsappShareText({ name: p.name, tier: p.winner_tier, salon: p.salon_name, url: `${window.location.origin}/rewards/${d.slug}` }) });
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't build the card"); }
    setDl(false);
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-6" data-testid="rewards-qr-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Gift className="w-5 h-5 text-amber-500" /> {c.name}</h2>
          <p className="text-xs text-slate-500 mt-1">Customers who spend ₹{Number(c.min_transaction).toLocaleString("en-IN")}+ scan this QR to enrol. {c.start_date} → {c.end_date}. Winners: {c.rewards.map(r => `${r.tier} ×${r.winners}`).join(" · ")}.</p>
        </div>
        <span data-testid="rewards-qr-status" className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${d.eligible ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {d.eligible ? "🟢 Live for your salon" : d.plan_ok ? "🟡 Campaign starts " + c.start_date : "⚪ Needs an eligible plan (" + c.eligible_plans.join(", ") + ")"}
        </span>
      </div>
      <div className="grid sm:grid-cols-[220px_1fr] gap-5 mt-4 items-start">
        <img src={src} alt="Rewards campaign QR poster" data-testid="rewards-qr-preview" className="w-full rounded-xl border border-slate-200 shadow" loading="lazy" />
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <button onClick={download} disabled={!!dl} data-testid="rewards-qr-download-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50">
              {dl === true ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download print poster
            </button>
            <a href={`/rewards/${d.slug}`} target="_blank" rel="noreferrer" data-testid="rewards-qr-open-page"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border-2 border-amber-400 text-amber-700 text-sm font-semibold hover:bg-amber-50">
              <ExternalLink className="w-4 h-4" /> Open campaign page
            </a>
          </div>
          <div className="text-xs text-slate-600" data-testid="rewards-qr-participants-count">{d.participants.length} customer{d.participants.length === 1 ? "" : "s"} enrolled from your salon</div>
          {d.nudges?.length > 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3" data-testid="rewards-nudges-section">
              <div className="text-[10px] uppercase tracking-[2px] text-emerald-700 font-semibold">💬 Vote milestone nudges · tap to WhatsApp</div>
              <div className="mt-2 space-y-2">
                {d.nudges.map(n => (
                  <div key={n.id} className="flex items-center gap-3 rounded-xl bg-white border border-emerald-100 px-3 py-2" data-testid={`rewards-nudge-${n.id}`}>
                    <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-800 truncate">{n.participant_name} <span className="text-emerald-700 font-bold">· {n.milestone} votes 🎉</span></div><div className="text-[11px] text-slate-500 truncate">{n.votes} votes now · {n.sent_email ? "emailed" : "no email"}{n.sent_sms ? " · SMS sent" : ""} · {new Date(n.created_at).toLocaleDateString("en-IN")}</div></div>
                    <a href={`https://wa.me/${n.phone.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(n.text)}`} target="_blank" rel="noreferrer" onClick={() => api.post(`/settings/rewards-nudges/${n.id}/done`).then(() => setD(s => ({ ...s, nudges: s.nudges.filter(x => x.id !== n.id) }))).catch(() => {})}
                      className="h-8 px-3 rounded-full bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1 hover:bg-emerald-600" data-testid={`rewards-nudge-wa-${n.id}`}><Share2 className="w-3.5 h-3.5" /> WhatsApp nudge</a>
                  </div>
                ))}
              </div>
            </div>
          )}
          {winners.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3" data-testid="rewards-winners-section">
              <div className="text-[10px] uppercase tracking-[2px] text-amber-700 font-semibold flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Your Brand Models · share the win</div>
              <div className="mt-2 space-y-2">
                {winners.map(p => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl bg-white border border-amber-100 px-3 py-2" data-testid={`rewards-winner-row-${p.id}`}>
                    <img src={`${BACKEND_URL}/api/settings/rewards-winner-card/${p.id}.png?origin=${encodeURIComponent(window.location.origin)}`} alt="" className="w-14 h-14 rounded-lg object-cover border border-amber-100" loading="lazy" data-testid={`rewards-winner-thumb-${p.id}`} />
                    <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-800 truncate">{p.name}</div><div className="text-[11px] text-amber-700">🏆 {p.winner_tier} Membership · Brand Model</div></div>
                    <button onClick={() => card(p, "dl")} disabled={!!dl} title="Download 1080×1080 post" data-testid={`rewards-winner-dl-${p.id}`} className="w-8 h-8 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 flex items-center justify-center disabled:opacity-50">{dl === p.id + "dlsquare" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}</button>
                    <button onClick={() => card(p, "dl", "story")} disabled={!!dl} title="Download 1080×1920 Instagram Story" data-testid={`rewards-winner-story-${p.id}`} className="h-8 px-2.5 rounded-lg border border-pink-300 text-pink-700 hover:bg-pink-50 text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50">{dl === p.id + "dlstory" ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="inline-block w-2.5 h-4 rounded-[2px] border-2 border-current" />} Story</button>
                    <button onClick={() => card(p, "share")} disabled={!!dl} data-testid={`rewards-winner-share-${p.id}`} className="h-8 px-3 rounded-full bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1 hover:bg-emerald-600 disabled:opacity-50">{dl === p.id + "sharesquare" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />} WhatsApp</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {d.participants.length > 0 && (
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl" data-testid="rewards-qr-participants">
              {d.participants.map(p => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 text-xs">
                  <div className="min-w-0"><div className="font-medium text-slate-800 truncate">{p.name}{p.winner_tier ? <span className="ml-1 text-amber-600">🏆 {p.winner_tier}</span> : null}</div><div className="text-slate-400">{p.phone} · {p.entries.purchases} bill{p.entries.purchases === 1 ? "" : "s"} · {p.entries.referred} referred · ❤ {p.entries.vote_count || 0} votes</div></div>
                  <div className="font-bold text-amber-600 shrink-0">{p.entries.total} <span className="text-[10px] text-slate-400 font-normal">entries</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
