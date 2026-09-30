import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Smartphone, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import { loadFbSdk, launchWaSignup, listenWaSignup, SDK_HELP } from "@/lib/fbSdk";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/** Public page opened from the Settings QR on the OWNER's phone — finishes Meta signup with their own Facebook Business login. */
export default function ConnectWhatsAppHandoff() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const session = useRef({});

  useEffect(() => {
    axios.get(`${BACKEND_URL}/api/whatsapp-own/public/handoff/${token}`)
      .then(r => { setInfo(r.data); if (r.data.app_id) loadFbSdk(r.data.app_id).catch(() => {}); })
      .catch(e => setErr(e.response?.data?.detail || "This link is invalid or has expired"));
    return listenWaSignup(session, (m) => toast.error(m));
  }, [token]);

  const connect = async () => {
    setBusy(true);
    let FB;
    try { FB = await loadFbSdk(info.app_id); }
    catch (e) { setBusy(false); toast.error(e?.message === "blocked" ? SDK_HELP : "Meta login is still loading — try again"); return; }
    const onLogin = (resp) => {
      const code = resp?.authResponse?.code;
      const s = session.current;
      if (!code) { setBusy(false); toast.error("Meta didn't return an authorisation — please try again"); return; }
      axios.post(`${BACKEND_URL}/api/whatsapp-own/public/handoff/${token}/connect`, { code, waba_id: String(s.waba_id || ""), phone_number_id: String(s.phone_number_id || "") })
        .then(() => setDone(true))
        .catch((e) => toast.error(e.response?.data?.detail || "Couldn't connect"))
        .finally(() => setBusy(false));
    };
    try { launchWaSignup(FB, info.config_id, onLogin); } catch (e) { setBusy(false); toast.error(`Couldn't open Meta login: ${e?.message || "unknown"}`); }
  };

  return (
    <div className="min-h-screen bg-[#0b0a09] text-white flex items-center justify-center p-5" data-testid="wa-handoff-page">
      <div className="w-full max-w-md rounded-3xl border border-emerald-400/30 bg-white/[0.04] p-6 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center"><Smartphone className="w-8 h-8 text-emerald-300" /></div>
        <h1 className="font-playfair text-2xl mt-4">Connect WhatsApp Business</h1>
        {err && <p className="mt-3 text-sm text-rose-300" data-testid="wa-handoff-error">{err}</p>}
        {info && !done && (
          <>
            <p className="mt-2 text-sm text-white/70">for <b className="text-[#e8c56a]">{info.tenant_name}</b></p>
            <p className="mt-3 text-xs text-white/55 leading-relaxed">You're on your own phone, so Meta will use <b>your</b> Facebook Business login — not the one on the office computer. Keep using WhatsApp Business as usual; Mira just joins the same number.</p>
            {info.connected && <p className="mt-3 text-xs text-emerald-300 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> A number is already connected — continuing will replace it</p>}
            <button onClick={connect} disabled={busy} data-testid="wa-handoff-connect-btn"
              className="mt-5 w-full py-3.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-[#06251a] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Continue with Facebook Business
            </button>
            <p className="mt-3 text-[10px] text-white/40">Link valid for 15 minutes · one use</p>
          </>
        )}
        {done && (
          <div className="mt-4" data-testid="wa-handoff-done">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400" />
            <p className="mt-2 text-lg font-semibold">Connected ✦</p>
            <p className="text-sm text-white/65 mt-1">Go back to Settings on your computer — the card updates in a few seconds. You can close this page.</p>
          </div>
        )}
      </div>
    </div>
  );
}
