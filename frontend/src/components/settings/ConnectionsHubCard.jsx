import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Smartphone, Mail, Instagram, Star, Loader2, RefreshCw, Radio } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const ICONS = { whatsapp: MessageCircle, sms: Smartphone, email: Mail, meta: Instagram, google: Star };
const TONE = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  off: "bg-rose-50 text-rose-700 border-rose-200",
  unavailable: "bg-slate-100 text-slate-500 border-slate-200",
};
const LABEL = { ok: "Ready", pending: "Almost", off: "Set up", unavailable: "HQ" };
const SCROLL_TARGET = {
  receipts: "settings-guest-receipts-card", buy_sms: "sms-packs-card", buy_whatsapp: "sms-packs-card",
  social: "social-connections-card", contact_hq: "contact-hq-section",
};
const ACTION_LABEL = {
  connect_google: "Connect Google", connect_meta: "Connect", recheck_google: "Check again", receipts: "Turn on auto-receipts",
  buy_sms: "Buy SMS credits", buy_whatsapp: "Get WhatsApp credits", social: "Pick Page", contact_hq: "Ask HQ",
};

function scrollTo(testid) {
  const el = document.querySelector(`[data-testid="${testid}"]`);
  if (!el) { toast.info("Scroll down a little — that card is just below."); return; }
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-[#e8c37f]");
  setTimeout(() => el.classList.remove("ring-2", "ring-[#e8c37f]"), 2500);
}

export const ConnectionsHubCard = () => {
  const [hub, setHub] = useState(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => api.get("/settings/connections-hub").then(r => setHub(r.data)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const act = async (c) => {
    const a = c.action;
    if (!a) return;
    setBusy(c.key);
    try {
      if (a === "connect_google" || a === "connect_meta") {
        const { data } = await api.get(`/social/${a === "connect_google" ? "google" : "meta"}/oauth/start`);
        window.location.href = data.auth_url;
        return;
      }
      if (a === "recheck_google") {
        const { data } = await api.post("/social/google/recheck");
        if (data.api_ready) toast.success(`Google Business Profile is live — ${data.location_title || "review replies enabled"} ✦`);
        else toast.info("Still waiting on Google — Mira will keep checking daily for you.");
        load();
        return;
      }
      scrollTo(SCROLL_TARGET[a]);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't do that just now");
    } finally { setBusy(""); }
  };

  if (!hub) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm" data-testid="connections-hub-card">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-[#1c1c22] text-[#e8c37f] flex items-center justify-center"><Radio className="w-5 h-5" /></div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">Your Connections</h2>
          <p className="text-xs text-slate-500 mt-1">WhatsApp, SMS, email and social — one glance, one tap to fix. Mira handles the rest.</p>
        </div>
        <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-slate-900 text-[#e8c37f]" data-testid="connections-hub-ready">{hub.ready}/{hub.total} ready</span>
      </div>
      <div className="space-y-2">
        {hub.channels.map(c => {
          const Icon = ICONS[c.key] || Radio;
          return (
            <div key={c.key} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5" data-testid={`hub-${c.key}`}>
              <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-600 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800">{c.title}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TONE[c.state]}`} data-testid={`hub-${c.key}-state`}>{LABEL[c.state]}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">{c.line}</p>
              </div>
              {c.action && (
                <button onClick={() => act(c)} disabled={busy === c.key} data-testid={`hub-${c.key}-action`}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap">
                  {busy === c.key ? <Loader2 className="w-3 h-3 animate-spin" /> : c.action === "recheck_google" ? <RefreshCw className="w-3 h-3" /> : null}
                  {ACTION_LABEL[c.action] || "Fix"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
