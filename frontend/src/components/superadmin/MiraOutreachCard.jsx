import { useCallback, useEffect, useState } from "react";
import { Bot, Loader2, Mail, MessageCircle, Globe2, Flame, History, Play, Save, Eye } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { confirmAsync } from "@/components/ConfirmDialog";
import { OutreachHistory } from "./OutreachHistory";
import { PitchPreviewDialog } from "./PitchPreviewDialog";
import { AbSubjectPanel } from "./AbSubjectPanel";
import { OutreachReportPanel } from "./OutreachReportPanel";

const WA_OPTS = [["91", "🇮🇳 India"], ["971", "🇦🇪 UAE"], ["44", "🇬🇧 UK"], ["1", "🇺🇸 US/CA"], ["65", "🇸🇬 Singapore"], ["61", "🇦🇺 Australia"], ["966", "🇸🇦 Saudi"], ["974", "🇶🇦 Qatar"]];
const HUNT_OPTS = [["IN", "India"], ["AE", "UAE"], ["UK", "UK"], ["US", "USA"], ["CA", "Canada"], ["SG", "Singapore"], ["AU", "Australia"], ["QA", "Qatar"], ["SA", "Saudi"], ["NZ", "NZ"], ["MY", "Malaysia"], ["IE", "Ireland"]];

const Chip = ({ on, onClick, children, testid }) => (
  <button type="button" onClick={onClick} data-testid={testid}
    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${on ? "bg-[#1c1c22] text-[#e8c37f] border-[#1c1c22]" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"}`}>
    {children}
  </button>
);

const Stat = ({ label, value, sub, tone, testid }) => (
  <div className={`rounded-xl border p-3 ${tone}`} data-testid={testid}>
    <div className="text-2xl font-bold leading-none">{value}</div>
    <div className="text-[10px] uppercase tracking-wider mt-1 opacity-70">{label}</div>
    {sub && <div className="text-[11px] mt-0.5 opacity-80">{sub}</div>}
  </div>
);

// Mira Outreach Autopilot — she hunts leads worldwide, emails hot salons/restaurants (daily cap), WhatsApps allowed countries.
export function MiraOutreachCard() {
  const [sum, setSum] = useState(null);
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [previewVert, setPreviewVert] = useState("");

  const load = useCallback(() => api.get("/super-admin/mira/outreach/summary").then(r => { setSum(r.data); setS(r.data.settings); }).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  if (!sum || !s) return null;

  const toggleIn = (key, val) => setS(p => ({ ...p, [key]: p[key].includes(val) ? p[key].filter(x => x !== val) : [...p[key], val] }));
  const save = async (patch = {}) => {
    setSaving(true);
    try {
      const { data } = await api.put("/super-admin/mira/outreach/settings", { ...s, ...patch });
      setS(data); load();
      if ("ab_test" in patch) toast.success(patch.ab_test ? "🧪 A/B subject test ON — two subject lines per pitch" : "A/B subject test off");
      else toast.success(data.enabled ? `🤖 Autopilot ON — up to ${data.daily_email_limit} emails/day` : "Autopilot paused");
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    finally { setSaving(false); }
  };
  const runNow = async () => {
    if (!await confirmAsync(`Send the next batch now? Mira emails up to ${s.per_cycle} ready leads (within today's cap of ${s.daily_email_limit}).`)) return;
    setRunning(true);
    try {
      const { data } = await api.post("/super-admin/mira/outreach/run-now");
      if (!data.will_email && !data.will_remind) {
        toast.info(data.budget_left_today === 0 ? `Today's cap of ${data.limit} is used up — Mira resumes tomorrow` : "Nothing ready to send right now — Mira will hunt more leads on her next tick");
      } else {
        toast.success(`📨 Mira is sending ${data.will_email} pitch${data.will_email === 1 ? "" : "es"}${data.will_remind ? ` + ${data.will_remind} reminder${data.will_remind === 1 ? "" : "s"}` : ""} in the background — the counters update as each email goes out`);
        [8000, 20000, 45000].forEach(ms => setTimeout(load, ms));
      }
      load();
    } catch (e) { toast.error(e.response?.data?.detail || `Run failed (${e.response?.status || "network"}) — try again in a minute`); }
    finally { setRunning(false); }
  };
  const t = sum.today;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" data-testid="mira-outreach-card">
      <div className="bg-[#1c1c22] px-5 py-4 flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#e8c37f]/15 border border-[#e8c37f]/40 flex items-center justify-center"><Bot className="w-5 h-5 text-[#e8c37f]" /></div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-[#e8c37f] font-playfair text-lg leading-tight">Mira Outreach Autopilot</div>
          <div className="text-white/55 text-[11px]">She finds salons & restaurants worldwide, emails the hot ones with a demo link, WhatsApps allowed countries and alerts HQ on every conversion.</div>
        </div>
        <label className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs font-bold cursor-pointer ${s.enabled ? "bg-emerald-500 text-[#06251a] border-emerald-400" : "bg-white/5 text-white/70 border-white/20"}`} data-testid="outreach-enabled-toggle">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <input type="checkbox" checked={s.enabled} onChange={() => save({ enabled: !s.enabled })} className="accent-emerald-600 w-4 h-4" />}
          {s.enabled ? "Autopilot ON" : "Autopilot OFF"}
        </label>
        <button onClick={runNow} disabled={running} data-testid="outreach-run-now" className="px-3.5 py-2 rounded-full bg-[#e8c37f] text-[#1c1c22] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Send next batch now
        </button>
      </div>

      <div className="p-5 space-y-5">
        <p className="text-sm text-slate-700 bg-[#fdf8ec] border border-[#e8c37f]/50 rounded-xl px-4 py-3" data-testid="outreach-greeting">💬 <b>Mira:</b> {sum.greeting}</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat testid="outreach-stat-emails" label="Emails today" value={t.emails} sub={`${t.new ?? t.emails} new · ${t.reminders ?? 0} reminders · ${t.salon} salon / ${t.restaurant} resto`} tone="bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800" />
          <Stat testid="outreach-stat-limit" label="Daily cap" value={`${t.emails}/${s.daily_email_limit}`} tone="bg-slate-50 border-slate-200 text-slate-700" />
          <Stat testid="outreach-stat-wa" label="WhatsApp today" value={t.whatsapp} tone="bg-emerald-50 border-emerald-200 text-emerald-800" />
          <Stat testid="outreach-stat-replies" label="Replies today" value={t.replies} tone="bg-orange-50 border-orange-200 text-orange-800" />
          <Stat testid="outreach-stat-ready" label="Ready to send" value={sum.ready_to_send} sub={`${sum.hunts_today}/${s.hunts_per_day} auto-hunts today`} tone="bg-sky-50 border-sky-200 text-sky-800" />
          <Stat testid="outreach-stat-total" label="All-time" value={sum.totals.emails} sub={`${sum.totals.replies} replies · ${sum.totals.conversions} converted`} tone="bg-amber-50 border-amber-200 text-amber-800" />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wide"><Mail className="w-3.5 h-3.5" /> Email rules</div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">Daily limit
                <input type="number" min="1" max="1000" value={s.daily_email_limit} onChange={e => setS(p => ({ ...p, daily_email_limit: Number(e.target.value) }))} data-testid="outreach-daily-limit" className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800" />
              </label>
              <label className="flex items-center gap-2">Min score
                <input type="number" min="0" max="100" value={s.min_score} onChange={e => setS(p => ({ ...p, min_score: Number(e.target.value) }))} data-testid="outreach-min-score" className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800" />
              </label>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-2" data-testid="outreach-targeting">
              <div className="font-semibold text-slate-800 text-sm">Who Mira targets</div>
              <label className="flex flex-wrap items-center gap-2">Growing businesses — recently opened, under
                <input type="number" min="10" max="5000" value={s.max_reviews ?? 300} onChange={e => setS(p => ({ ...p, max_reviews: Number(e.target.value) }))} data-testid="outreach-max-reviews" className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white text-slate-800" /> Google reviews
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={s.include_luxury !== false} onChange={e => setS(p => ({ ...p, include_luxury: e.target.checked }))} data-testid="outreach-include-luxury" className="accent-[#b8932e]" />
                Also target luxury / premium salons (name says luxury · spa · premium · royal…, or 4.8★ with 1,000+ reviews)
              </label>
              <div className="text-slate-500">Every day = <b>new</b> leads only. No reply? Reminders on <b>day 7 → day 14 → day 30 → every 3 months</b>, all inside the daily limit.</div>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center text-xs text-slate-500">Send to:
              <Chip testid="outreach-vert-salon" on={s.verticals.includes("salon")} onClick={() => toggleIn("verticals", "salon")}>💇 Salons</Chip>
              <Chip testid="outreach-vert-restaurant" on={s.verticals.includes("restaurant")} onClick={() => toggleIn("verticals", "restaurant")}>🍽️ Restaurants</Chip>
              <span className="text-[10px] text-slate-400">separate pitch & pricing per type</span>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center text-xs text-slate-500" data-testid="outreach-pitch-check">
              <Eye className="w-3.5 h-3.5 text-[#b8932e]" /> Pitch check:
              <button type="button" onClick={() => setPreviewVert("restaurant")} data-testid="outreach-preview-restaurant" className="px-2.5 py-1 rounded-full border border-[#e8c37f] bg-[#fdf8ec] text-[#7a5c12] text-[11px] font-semibold hover:bg-[#f7ecd0]">
                🍽️ Preview restaurant pitch{s.pitch_notes?.restaurant ? " · tuned ✦" : ""}
              </button>
              <button type="button" onClick={() => setPreviewVert("salon")} data-testid="outreach-preview-salon" className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-600 text-[11px] font-semibold hover:border-slate-400">
                💇 Preview salon pitch{s.pitch_notes?.salon ? " · tuned ✦" : ""}
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wide"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp intro in these countries</div>
              <div className="flex flex-wrap gap-1.5">{WA_OPTS.map(([cc, l]) => <Chip key={cc} testid={`outreach-wa-${cc}`} on={s.wa_countries.includes(cc)} onClick={() => toggleIn("wa_countries", cc)}>{l}</Chip>)}</div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wide"><Globe2 className="w-3.5 h-3.5" /> Self-hunting</div>
            <label className="flex items-center gap-2 text-sm" data-testid="outreach-auto-hunt">
              <input type="checkbox" checked={s.auto_hunt} onChange={e => setS(p => ({ ...p, auto_hunt: e.target.checked }))} className="accent-fuchsia-600 w-4 h-4" />
              Mira picks cities herself when the pipeline runs thin
              <input type="number" min="0" max="10" value={s.hunts_per_day} onChange={e => setS(p => ({ ...p, hunts_per_day: Number(e.target.value) }))} data-testid="outreach-hunts-per-day" className="w-14 border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white text-slate-800" /> hunts/day
            </label>
            <div className="flex flex-wrap gap-1.5">{HUNT_OPTS.map(([iso, l]) => <Chip key={iso} testid={`outreach-hunt-${iso}`} on={s.hunt_countries.includes(iso)} onClick={() => toggleIn("hunt_countries", iso)}>{l}</Chip>)}</div>
            <p className="text-[11px] text-slate-400 flex items-start gap-1"><Flame className="w-3 h-3 mt-0.5 text-orange-400" /> Hot leads (500+ reviews, no website) go first · sent 9 AM–6 PM in each lead's local time · replies, demo requests and signups are emailed to admin@miracurl-suite.com so you can send the demo invite.</p>
            <AbSubjectPanel enabled={s.ab_test} onToggle={v => save({ ab_test: v })} />
          </div>
        </div>

        <OutreachReportPanel />

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <button onClick={() => save()} disabled={saving} data-testid="outreach-save" className="px-4 py-2 rounded-xl bg-[#1c1c22] text-[#e8c37f] text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save rules
          </button>
          <button onClick={() => setShowHistory(v => !v)} data-testid="outreach-history-toggle" className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50">
            <History className="w-4 h-4" /> {showHistory ? "Hide history" : "Outreach history"}
          </button>
        </div>
        {showHistory && <OutreachHistory />}
      </div>
      <PitchPreviewDialog open={!!previewVert} vertical={previewVert || "restaurant"} initialNotes={s.pitch_notes?.[previewVert] || ""}
        onClose={() => setPreviewVert("")} onSaved={data => setS(data)} />
    </div>
  );
}
