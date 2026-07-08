import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Rocket, Loader2, Mail, MessageCircle, ImageIcon, Zap, CheckCircle2 } from "lucide-react";

export const MiraAutopilot = () => {
  const [cfg, setCfg] = useState(null);
  const [act, setAct] = useState(null);
  const [running, setRunning] = useState(false);

  const load = () => Promise.all([
    api.get("/mira-studio/autopilot").then(r => setCfg(r.data)),
    api.get("/mira-studio/autopilot/activity").then(r => setAct(r.data)),
  ]).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (patch) => {
    const { data } = await api.put("/mira-studio/autopilot", patch);
    setCfg(data);
    if (patch.enabled !== undefined) toast.success(patch.enabled ? "Auto-Pilot ON — Mira works for you daily ✦" : "Auto-Pilot paused");
  };

  const runNow = async () => {
    setRunning(true);
    toast.info("Mira is working — creating today's post & finding leads (30-60s)…");
    try {
      const { data } = await api.post("/mira-studio/autopilot/run-now");
      toast.success(`Done ✦ Post: ${data.post_created ? "created" : "—"} · Emails: ${data.emails_sent} · WhatsApp leads: ${data.wa_leads}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Run failed");
    } finally { setRunning(false); }
  };

  const sendWa = (lead) => {
    window.open(`https://wa.me/91${lead.phone.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(lead.message)}`, "_blank", "noopener");
    api.post("/mira-studio/autopilot/wa-sent", { customer_id: lead.customer_id }).then(load);
  };

  if (!cfg) return null;
  const today = act?.runs?.[0];
  const waQueue = today?.wa_queue || [];

  return (
    <div className="space-y-4" data-testid="mira-autopilot">
      {/* master card */}
      <div className={`rounded-2xl p-5 border ${cfg.enabled ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${cfg.enabled ? "bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white" : "bg-slate-100 text-slate-400"}`}>
            <Rocket className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className={`font-semibold ${cfg.enabled ? "text-white" : "text-slate-800"}`}>Mira Auto-Pilot {cfg.enabled && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full ml-1 uppercase tracking-wider">Active</span>}</p>
            <p className={`text-xs mt-0.5 ${cfg.enabled ? "text-slate-400" : "text-slate-500"}`}>Every morning Mira creates today's post, emails win-back offers to lapsed guests, and queues WhatsApp leads — automatically.</p>
          </div>
          <Switch data-testid="autopilot-master-toggle" checked={cfg.enabled} onCheckedChange={(v) => save({ enabled: v })} />
        </div>

        <div className={`grid sm:grid-cols-3 gap-3 mt-4 ${cfg.enabled ? "" : "opacity-60"}`}>
          <div className={`rounded-xl p-3 border ${cfg.enabled ? "border-slate-700 bg-slate-800/60" : "border-slate-100 bg-slate-50"}`}>
            <div className="flex items-center justify-between">
              <p className={`text-xs font-semibold ${cfg.enabled ? "text-slate-200" : "text-slate-700"}`}><ImageIcon className="w-3.5 h-3.5 inline mr-1" />Daily post</p>
              <Switch data-testid="autopilot-dailypost-toggle" checked={cfg.daily_post} onCheckedChange={(v) => save({ daily_post: v })} />
            </div>
            <p className={`text-[11px] mt-1 ${cfg.enabled ? "text-slate-400" : "text-slate-500"}`}>Caption + AI image, festival-aware. Auto-posts when Instagram/Facebook is connected.</p>
          </div>
          <div className={`rounded-xl p-3 border ${cfg.enabled ? "border-slate-700 bg-slate-800/60" : "border-slate-100 bg-slate-50"}`}>
            <div className="flex items-center justify-between">
              <p className={`text-xs font-semibold ${cfg.enabled ? "text-slate-200" : "text-slate-700"}`}><Mail className="w-3.5 h-3.5 inline mr-1" />Win-back emails</p>
              <Switch data-testid="autopilot-winback-toggle" checked={cfg.winback_emails} onCheckedChange={(v) => save({ winback_emails: v })} />
            </div>
            <p className={`text-[11px] mt-1 ${cfg.enabled ? "text-slate-400" : "text-slate-500"}`}>Personalized 20% comeback offers to guests away {cfg.winback_days}+ days.</p>
          </div>
          <div className={`rounded-xl p-3 border ${cfg.enabled ? "border-slate-700 bg-slate-800/60" : "border-slate-100 bg-slate-50"}`}>
            <p className={`text-xs font-semibold ${cfg.enabled ? "text-slate-200" : "text-slate-700"}`}>Daily email cap</p>
            <input type="number" min="1" max="50" value={cfg.email_daily_cap} data-testid="autopilot-cap-input"
              onChange={(e) => setCfg({ ...cfg, email_daily_cap: e.target.value })}
              onBlur={(e) => save({ email_daily_cap: Number(e.target.value) || 15 })}
              className={`mt-1 w-20 px-2 py-1 rounded-lg text-sm border ${cfg.enabled ? "bg-slate-900 border-slate-600 text-white" : "border-slate-200"}`} />
          </div>
        </div>

        <button data-testid="autopilot-run-now" onClick={runNow} disabled={running}
          className="mt-4 px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {running ? "Mira is working…" : "Run now ✦"}
        </button>
      </div>

      {/* today's output */}
      {today && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5" data-testid="autopilot-today">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Today — {today.date}</p>
          <div className="flex flex-wrap gap-3 mt-2 text-sm">
            <span className={`px-3 py-1.5 rounded-lg ${today.post_created ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"}`}>
              <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />Post {today.post_created ? (today.posted_live ? "published live 🎉" : "ready (share manually below)") : "—"}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700"><Mail className="w-3.5 h-3.5 inline mr-1" />{today.emails_sent || 0} offer emails sent</span>
            <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700"><MessageCircle className="w-3.5 h-3.5 inline mr-1" />{waQueue.length} WhatsApp leads ready</span>
          </div>

          {today.post?.caption && (
            <div className="mt-3 flex gap-3 items-start bg-slate-50 rounded-xl p-3">
              {today.post.image_url && <img src={today.post.image_url} alt="today's post" className="w-24 h-24 rounded-lg object-cover" />}
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-700">{today.post.topic}</p>
                <p className="text-xs text-slate-600 mt-1 line-clamp-3 whitespace-pre-line">{today.post.caption}</p>
                <button data-testid="autopilot-copy-post"
                  onClick={() => { navigator.clipboard?.writeText(`${today.post.caption}\n\n${(today.post.hashtags || []).join(" ")}`); toast.success("Caption copied ✦"); window.open("https://www.instagram.com/", "_blank", "noopener"); }}
                  className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white font-medium">Copy &amp; open Instagram ↗</button>
              </div>
            </div>
          )}

          {waQueue.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">📲 One-tap WhatsApp leads (guests without email):</p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {waQueue.map((l) => (
                  <div key={l.customer_id} className="flex items-center justify-between gap-2 text-sm border-b border-slate-100 pb-1.5">
                    <div><span className="font-medium text-slate-800">{l.name}</span> <span className="text-xs text-slate-400">last visit {l.last_visit}</span></div>
                    <button data-testid={`autopilot-wa-${l.customer_id}`} onClick={() => sendWa(l)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium shrink-0">Send on WhatsApp ↗</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* outreach history */}
      {act?.outreach?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5" data-testid="autopilot-history">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Recent lead outreach</p>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {act.outreach.map((o) => (
              <div key={o.id} className="flex items-center gap-2 text-xs text-slate-600 border-b border-slate-50 py-1">
                {o.channel === "email" ? <Mail className="w-3 h-3 text-blue-500" /> : <MessageCircle className="w-3 h-3 text-emerald-500" />}
                <span className="font-medium text-slate-800">{o.name}</span>
                <span className="text-slate-400">· {o.channel} · {(o.created_at || "").slice(0, 10)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
