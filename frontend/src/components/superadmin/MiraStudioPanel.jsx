import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Gift, Send, X, Loader2, Wand2 } from "lucide-react";

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");

export const MiraStudioPanel = () => {
  const [data, setData] = useState(null);
  const [giftUser, setGiftUser] = useState(null);
  const [nudgeUser, setNudgeUser] = useState(null);
  const [giftCredits, setGiftCredits] = useState(50);
  const [giftNote, setGiftNote] = useState("");
  const [nudgeMsg, setNudgeMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [nudging, setNudging] = useState("");

  const load = () => api.get("/super-admin/studio/users").then(r => setData(r.data)).catch(() => toast.error("Couldn't load studio users"));
  useEffect(() => { load(); }, []);

  const sendGift = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post(`/super-admin/studio/users/${giftUser.id}/gift`, { credits: Number(giftCredits), note: giftNote.trim() });
      toast.success(`${giftCredits} credits gifted to ${giftUser.name} — balance now ${r.credits}${r.email_sent ? " · email sent ✉" : ""}`);
      if (!r.email_sent && r.email_error) toast.error(`Credits added but email failed: ${r.email_error}`);
      setGiftUser(null); setGiftNote("");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gift failed"); }
    finally { setBusy(false); }
  };

  const sendNudge = async (u, message = "") => {
    setNudging(u.id);
    try {
      await api.post(`/super-admin/studio/users/${u.id}/nudge`, { message });
      toast.success(`Win-back email sent to ${u.name} ✉`);
      setNudgeUser(null); setNudgeMsg("");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Email failed"); }
    finally { setNudging(""); }
  };

  const users = data?.users || [];
  const stats = data?.stats || {};

  return (
    <div className="space-y-6" data-testid="mira-studio-panel">
      <div>
        <h1 className="font-playfair text-3xl flex items-center gap-3"><Wand2 className="w-7 h-7 text-fuchsia-500" /> Mira Studio Users</h1>
        <p className="text-slate-500 text-sm mt-1">Gift free credits and win back builders who left — every action emails them a branded invite back to /mira.ai.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[["Registered users", stats.total ?? "—", "text-slate-900"], ["Never built", stats.no_builds ?? "—", "text-amber-600"], ["Credits outstanding", stats.credits_outstanding ?? "—", "text-emerald-600"]].map(([l, v, c]) => (
          <div key={l} className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
            <div className={`text-2xl font-bold ${c}`}>{v}</div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mt-1">{l}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Credits</th>
              <th className="px-4 py-3">Builds</th>
              <th className="px-4 py-3 hidden sm:table-cell">Joined</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/60" data-testid={`studio-user-row-${u.email}`}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{u.name}</div>
                  <div className="text-xs text-slate-400">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">✦ {u.credits}</span>
                </td>
                <td className="px-4 py-3">
                  {u.builds > 0
                    ? <span className="text-slate-700 font-medium">{u.builds}</span>
                    : <span className="text-[10px] uppercase tracking-wider bg-rose-50 border border-rose-200 text-rose-600 px-2 py-0.5 rounded-full">Never built</span>}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-slate-500 text-xs">{fmtDate(u.created_at)}{u.last_nudged_at && <div className="text-[10px] text-slate-400">nudged {fmtDate(u.last_nudged_at)}</div>}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => { setGiftUser(u); setGiftCredits(50); }} data-testid={`gift-credits-btn-${u.email}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 mr-2">
                    <Gift className="w-3.5 h-3.5" /> Gift credits
                  </button>
                  <button onClick={() => setNudgeUser(u)} disabled={nudging === u.id} data-testid={`nudge-btn-${u.email}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 text-xs font-medium hover:bg-fuchsia-100 disabled:opacity-50">
                    {nudging === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Win-back email
                  </button>
                </td>
              </tr>
            ))}
            {!users.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">No studio users yet — share /mira.ai to get your first builders!</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Gift modal */}
      {giftUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setGiftUser(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()} data-testid="gift-modal">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-playfair text-xl flex items-center gap-2"><Gift className="w-5 h-5 text-emerald-500" /> Gift credits</h3>
              <button onClick={() => setGiftUser(null)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">{giftUser.name} · {giftUser.email} · current balance ✦ {giftUser.credits}</p>
            <div className="flex gap-2 mb-3">
              {[20, 50, 100, 200].map(n => (
                <button key={n} onClick={() => setGiftCredits(n)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${Number(giftCredits) === n ? "bg-emerald-600 text-white border-emerald-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {n}
                </button>
              ))}
            </div>
            <input type="number" min="1" max="1000" value={giftCredits} onChange={e => setGiftCredits(e.target.value)} data-testid="gift-credits-input"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm mb-3 bg-white text-slate-800" placeholder="Custom amount" />
            <textarea value={giftNote} onChange={e => setGiftNote(e.target.value)} rows={2} maxLength={300} data-testid="gift-note-input"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm mb-4 bg-white text-slate-800 placeholder:text-slate-400" placeholder='Personal note in the email (optional) — e.g. "Loved your first website — build more on us!"' />
            <button onClick={sendGift} disabled={busy || !Number(giftCredits)} data-testid="gift-submit-btn"
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold py-3 rounded-xl hover:bg-emerald-700 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Gift {giftCredits} credits & email {giftUser.name.split(" ")[0]}
            </button>
          </div>
        </div>
      )}

      {/* Nudge modal */}
      {nudgeUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setNudgeUser(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()} data-testid="nudge-modal">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-playfair text-xl flex items-center gap-2"><Send className="w-5 h-5 text-fuchsia-500" /> Win-back email</h3>
              <button onClick={() => setNudgeUser(null)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Sends "Hey {nudgeUser.name.split(" ")[0]} — you're one sentence away ✦" with their credit balance and a {nudgeUser.credits >= 20 ? "continue-building" : "recharge"} link.
            </p>
            <textarea value={nudgeMsg} onChange={e => setNudgeMsg(e.target.value)} rows={3} maxLength={600} data-testid="nudge-message-input"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm mb-4 bg-white text-slate-800 placeholder:text-slate-400" placeholder="Add a personal line (optional) — it appears highlighted inside the email" />
            <button onClick={() => sendNudge(nudgeUser, nudgeMsg)} disabled={nudging === nudgeUser.id} data-testid="nudge-submit-btn"
              className="w-full flex items-center justify-center gap-2 bg-fuchsia-600 text-white font-semibold py-3 rounded-xl hover:bg-fuchsia-700 disabled:opacity-50">
              {nudging === nudgeUser.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send win-back email
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
