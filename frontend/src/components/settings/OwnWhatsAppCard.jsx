import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { loadFbSdk, launchWaSignup, listenWaSignup, SDK_HELP } from "@/lib/fbSdk";
import { toast } from "sonner";
import { Smartphone, ShieldCheck, RefreshCw, Unplug, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";


const TPL_LABEL = { miracurl_booking_confirmed: "Booking confirmation", miracurl_reminder_1h: "1-hour reminder", miracurl_review_request: "Review request",
  miracurl_winback: "Win-back", miracurl_birthday_wish: "Birthday wish", miracurl_festival_offer: "Festival offer" };

export const OwnWhatsAppCard = () => {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState("");
  const [qr, setQr] = useState(null);
  const phoneQr = async () => {
    setBusy("qr");
    try { const r = await api.post("/whatsapp-own/handoff"); setQr(r.data); toast.success("Scan with the phone that has your Facebook Business login"); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't create the QR"); }
    finally { setBusy(""); }
  };
  useEffect(() => {
    if (!qr) return;
    const iv = setInterval(() => api.get("/whatsapp-own/status").then(r => { if (r.data.connected) { setSt(r.data); setQr(null); toast.success("Your WhatsApp Business number is connected ✦"); } }).catch(() => {}), 5000);
    return () => clearInterval(iv);
  }, [qr]);
  const session = useRef({});
  const load = () => api.get("/whatsapp-own/status").then(r => setSt(r.data)).catch(() => setSt({ available: false }));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (st?.available && st.app_id) loadFbSdk(st.app_id).catch(() => {}); }, [st?.available, st?.app_id]);

  useEffect(() => {
    return listenWaSignup(session, (m) => toast.error(m));
  }, []);

  const connect = async () => {
    if (!st?.app_id || !st?.config_id) { toast.error("Meta app isn't configured on the server (META_APP_ID / config id missing)"); return; }
    setBusy("connect");
    let FB;
    try { FB = await loadFbSdk(st.app_id); }
    catch (e) { setBusy(""); toast.error(e?.message === "blocked" ? SDK_HELP : "Meta login is still loading — try again in a few seconds"); return; }
    try {
      // Meta's SDK type-checks the callback (must be a plain Function, not an AsyncFunction)
      const onLogin = (resp) => {
        const code = resp?.authResponse?.code;
        const s = session.current;
        if (!code) { setBusy(""); toast.error("Meta didn't return an authorisation — please try again"); return; }
        api.post("/whatsapp-own/connect", { code, waba_id: String(s.waba_id || ""), phone_number_id: String(s.phone_number_id || "") })
          .then((r) => { setSt(r.data); toast.success("Your WhatsApp Business number is connected to Mira ✦"); })
          .catch((e) => toast.error(e.response?.data?.detail || "Couldn't connect"))
          .finally(() => setBusy(""));
      };
      launchWaSignup(FB, st.config_id, onLogin);
    } catch (e) {
      setBusy("");
      console.error("[meta-login]", e);
      toast.error(`Couldn't open Meta login: ${e?.message || "unknown error"}`, { description: "If a popup was blocked, allow popups for this site and try again." });
    }
  };
  const act = async (kind) => {
    setBusy(kind);
    try {
      const r = kind === "disconnect" ? await api.delete("/whatsapp-own/disconnect") : await api.post("/whatsapp-own/refresh");
      setSt(r.data); toast.success(kind === "disconnect" ? "Disconnected — back to Miracurl's shared number" : "Status refreshed");
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't update"); }
    finally { setBusy(""); }
  };

  if (!st) return null;
  const own = st.own || {};
  const tpls = Object.entries(own.templates || {});
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 mt-6" data-testid="own-whatsapp-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Smartphone className="w-5 h-5" /></div>
          <div>
            <h3 className="font-semibold text-slate-800">Connect your WhatsApp Business app</h3>
            <p className="text-xs text-slate-500">Keep using WhatsApp Business on your phone <b>and</b> let Mira answer, book and send confirmations from the same number</p>
          </div>
        </div>
        {st.connected
          ? <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold" data-testid="own-whatsapp-status"><CheckCircle2 className="w-3.5 h-3.5" /> Connected · {own.display_phone_number}</span>
          : <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold" data-testid="own-whatsapp-status">Using Miracurl's shared number</span>}
      </div>

      {!st.connected && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
          <div className="font-semibold text-slate-800 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> How it works (Meta "Coexistence")</div>
          <ol className="list-decimal ml-4 space-y-1">
            <li>Update WhatsApp Business on your phone (v2.24.17+), keep it as your primary device</li>
            <li>Tap <b>Connect</b> → log in with the Facebook account that owns your business → scan the QR shown in WhatsApp Business (Settings → Linked devices)</li>
            <li>Choose whether to share up to 6 months of chat history with Mira</li>
          </ol>
          <p className="text-[11px] text-slate-500">You keep chatting from the app as usual. Messages Mira sends are billed by Meta to your account (no Miracurl credits needed). Broadcast lists get disabled by Meta; open the app at least once every 14 days.</p>
          {!st.available && <p className="text-[11px] text-amber-700 flex items-center gap-1" data-testid="own-whatsapp-unavailable"><AlertTriangle className="w-3.5 h-3.5" /> Not enabled yet on this Miracurl deployment — HQ needs to add the Meta login configuration.</p>}
        </div>
      )}

      {st.connected && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl border border-slate-200 p-3"><div className="uppercase tracking-widest text-[10px] text-slate-500 font-semibold">Business name</div><div className="font-semibold text-slate-800 mt-0.5">{own.verified_name || "—"}</div></div>
          <div className="rounded-xl border border-slate-200 p-3"><div className="uppercase tracking-widest text-[10px] text-slate-500 font-semibold">Quality · Tier</div><div className="font-semibold text-slate-800 mt-0.5">{own.quality_rating || "—"} · {own.messaging_limit_tier || "—"}</div></div>
          <div className="rounded-xl border border-slate-200 p-3"><div className="uppercase tracking-widest text-[10px] text-slate-500 font-semibold">Business app</div><div className="font-semibold text-slate-800 mt-0.5">{own.is_on_biz_app ? "Linked ✓" : "Not linked"}</div></div>
          <div className="sm:col-span-3 rounded-xl border border-slate-200 p-3" data-testid="own-whatsapp-templates">
            <div className="uppercase tracking-widest text-[10px] text-slate-500 font-semibold mb-1.5">Message templates on your number</div>
            {tpls.length ? <div className="flex flex-wrap gap-1.5">{tpls.map(([k, v]) => <span key={k} className={`px-2 py-0.5 rounded-full border ${v === "APPROVED" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>{TPL_LABEL[k] || k} · {String(v).toLowerCase()}</span>)}</div>
              : <span className="text-slate-500">Copying Miracurl's templates to your account… tap Refresh in a minute.</span>}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {!st.connected ? (
          <>
            <button onClick={connect} disabled={!st.available || !!busy} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2" data-testid="own-whatsapp-connect">{busy === "connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />} Connect my WhatsApp Business number</button>
            <button onClick={phoneQr} disabled={!st.available || !!busy} className="px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-800 text-sm font-semibold inline-flex items-center gap-2" data-testid="own-whatsapp-phone-qr">{busy === "qr" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />} Connect from my phone (QR)</button>
          </>
        ) : (
          <>
            <button onClick={() => act("refresh")} disabled={!!busy} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-semibold inline-flex items-center gap-1.5" data-testid="own-whatsapp-refresh"><RefreshCw className={`w-4 h-4 ${busy === "refresh" ? "animate-spin" : ""}`} /> Refresh</button>
            <button onClick={() => { if (window.confirm("Disconnect? Mira will go back to Miracurl's shared number and credits.")) act("disconnect"); }} disabled={!!busy} className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700 text-sm font-semibold inline-flex items-center gap-1.5" data-testid="own-whatsapp-disconnect"><Unplug className="w-4 h-4" /> Disconnect</button>
          </>
        )}
      </div>
      {qr && !st.connected && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 flex flex-col sm:flex-row items-center gap-4" data-testid="own-whatsapp-qr-panel">
          <img src={qr.qr} alt="Scan to connect WhatsApp from your phone" className="w-44 h-44 rounded-xl bg-white p-2 border border-emerald-200" data-testid="own-whatsapp-qr-img" />
          <div className="text-sm text-slate-700 space-y-1.5">
            <p className="font-semibold text-slate-800">Scan with the phone that has <u>your</u> Facebook Business login</p>
            <p className="text-xs text-slate-600">The office computer may be signed in to a different Facebook account (e.g. Miracurl HQ). This QR opens a one-time page on your phone, so Meta uses your own business account. Valid 15 minutes.</p>
            <p className="text-xs text-slate-500">This card updates automatically once the number is connected.</p>
          </div>
        </div>
      )}
    </div>
  );
}
