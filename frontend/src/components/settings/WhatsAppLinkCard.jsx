import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { MessageCircle, QrCode, Loader2, Unlink, Send, RefreshCw, ShieldAlert, CheckCircle2 } from "lucide-react";
import { confirmAsync } from "@/components/ConfirmDialog";

const selectCls = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-400";

export const WhatsAppLinkCard = () => {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState("");
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [pairPhone, setPairPhone] = useState("");
  const [pairCode, setPairCode] = useState(null);
  const timer = useRef(null);

  const getCode = async () => {
    setBusy("code");
    try {
      const { data } = await api.post("/whatsapp-link/pairing-code", { phone: pairPhone });
      setPairCode(data.code);
      toast.success("Code ready — type it into WhatsApp within 2 minutes");
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't get a code"); }
    finally { setBusy(""); }
  };

  const load = async () => {
    try { const { data } = await api.get("/whatsapp-link/status"); setSt(data); return data; }
    catch { setSt({ available: false }); return null; }
  };

  useEffect(() => { load(); return () => clearInterval(timer.current); }, []);

  // While pairing, poll every 4s so the QR refreshes and "Linked" appears the moment the phone scans
  useEffect(() => {
    clearInterval(timer.current);
    if (st?.available && !st.connected && st.status !== "not_created") {
      timer.current = setInterval(load, 4000);
    }
    return () => clearInterval(timer.current);
  }, [st?.available, st?.connected, st?.status]);

  const start = async () => {
    setBusy("start");
    try { const { data } = await api.post("/whatsapp-link/start"); setSt(data); toast.success("Pairing started — scan the QR with your salon's WhatsApp"); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't start pairing"); }
    finally { setBusy(""); }
  };

  const unlink = async () => {
    if (!(await confirmAsync("Campaigns, win-back nudges and confirmations will stop going out from this number until you link again.", { title: "Unlink WhatsApp?", confirmLabel: "Unlink", danger: true }))) return;
    setBusy("unlink");
    try { await api.post("/whatsapp-link/unlink"); toast.success("WhatsApp unlinked"); await load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't unlink"); }
    finally { setBusy(""); }
  };

  const testSend = async () => {
    setBusy("send");
    try {
      const { data } = await api.post("/whatsapp-link/test-send", { phone, text });
      toast.success(`Sent to +${data.to} ✦ check that phone`);
    } catch (e) { toast.error(e.response?.data?.detail || "Send failed"); }
    finally { setBusy(""); }
  };

  if (!st) return null;
  if (!st.available) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5" data-testid="whatsapp-link-card">
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2"><MessageCircle className="w-4 h-4 text-emerald-600" /> Link your WhatsApp</h3>
        <p className="text-xs text-slate-500 mt-1">The WhatsApp gateway isn't running on this server yet. Ask Miracurl HQ to enable it.</p>
      </div>
    );
  }

  const pairing = !st.connected && st.status !== "not_created";
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5" data-testid="whatsapp-link-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2"><MessageCircle className="w-4 h-4 text-emerald-600" /> Link your WhatsApp</h3>
          <p className="text-xs text-slate-500 mt-0.5">Send offers, win-back nudges, review requests and booking confirmations from your salon's own WhatsApp number — no Meta business verification needed.</p>
        </div>
        <span data-testid="whatsapp-link-status" className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${st.connected ? "bg-emerald-100 text-emerald-700" : pairing ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
          {st.connected ? `● Linked · +${st.phone}` : pairing ? `○ ${st.status === "qr_ready" ? "Waiting for scan" : "Starting…"}` : "○ Not linked"}
        </span>
      </div>

      {!st.connected && st.status === "not_created" && (
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <button onClick={start} disabled={!!busy} data-testid="whatsapp-link-start" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {busy === "start" ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />} Link WhatsApp number
          </button>
          <p className="text-[11px] text-slate-500 flex items-start gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" /> Unofficial WhatsApp link — send only to your own guests, a few per minute. Blasting strangers can get the number restricted.</p>
        </div>
      )}

      {pairing && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4 items-center">
          <div className="w-[220px] h-[220px] rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden" data-testid="whatsapp-link-qr">
            {st.qr ? <img src={st.qr} alt="WhatsApp QR" className="w-full h-full object-contain" /> : <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />}
          </div>
          <div className="text-sm text-slate-700 space-y-2">
            <p className="font-semibold">Scan with the salon phone</p>
            <ol className="list-decimal pl-5 text-xs text-slate-600 space-y-1">
              <li>Open WhatsApp → <b>⋮ Menu</b> (Android) or <b>Settings</b> (iPhone)</li>
              <li>Tap <b>Linked devices</b> → <b>Link a device</b></li>
              <li>Point the camera at this QR — it refreshes automatically</li>
            </ol>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mt-2" data-testid="whatsapp-pair-box">
              <p className="text-xs font-semibold text-slate-700">On the same phone? Link with a code instead</p>
              <p className="text-[11px] text-slate-500 mb-2">WhatsApp → Linked devices → Link a device → <b>Link with phone number instead</b>, then type this code.</p>
              <div className="flex gap-2">
                <input value={pairPhone} onChange={e => setPairPhone(e.target.value)} placeholder="918217072523" data-testid="whatsapp-pair-phone" className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800" />
                <button onClick={getCode} disabled={!!busy || pairPhone.replace(/\D/g, "").length < 10} data-testid="whatsapp-pair-get-code" className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold disabled:opacity-50">{busy === "code" ? "…" : "Get code"}</button>
              </div>
              {pairCode && <div className="mt-2 font-mono text-2xl tracking-[0.3em] text-emerald-700 text-center select-all" data-testid="whatsapp-pair-code">{pairCode.slice(0, 4)}-{pairCode.slice(4)}</div>}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={load} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
              <button onClick={unlink} disabled={!!busy} data-testid="whatsapp-link-cancel" className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50">Cancel</button>
            </div>
            {st.last_error && <p className="text-[11px] text-rose-600">{st.last_error}</p>}
          </div>
        </div>
      )}

      {st.connected && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2" data-testid="whatsapp-link-connected">
            <CheckCircle2 className="w-4 h-4" /> {st.push_name ? `${st.push_name} · ` : ""}+{st.phone} is linked. Win-back blasts, review requests and Mira messages now go out from this number.
          </div>
          <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer" data-testid="whatsapp-prefer-sms-row">
            <input type="checkbox" checked={st.prefer_over_sms !== false} data-testid="whatsapp-prefer-toggle"
              onChange={async e => {
                const v = e.target.checked;
                try { await api.put("/whatsapp-link/preferences", { prefer_over_sms: v }); setSt(s => ({ ...s, prefer_over_sms: v })); toast.success(v ? "Customer messages will go via WhatsApp first" : "Customer messages will go by SMS"); }
                catch { toast.error("Couldn't save"); }
              }}
              className="mt-0.5 w-4 h-4 accent-emerald-600" />
            <span><b>Send booking confirmations, reminders & loyalty messages on WhatsApp instead of SMS</b><br /><span className="text-xs text-slate-500">Free — no SMS points used. Falls back to SMS automatically if WhatsApp is disconnected.</span></span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr_auto] gap-2 items-start">
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="91XXXXXXXXXX" data-testid="whatsapp-test-phone" className={selectCls} />
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Optional test message (default: hello from your salon)" data-testid="whatsapp-test-text" className={selectCls} />
            <button onClick={testSend} disabled={!!busy || phone.replace(/\D/g, "").length < 10} data-testid="whatsapp-test-send" className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
              {busy === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send test
            </button>
          </div>
          <button onClick={unlink} disabled={!!busy} data-testid="whatsapp-link-unlink" className="inline-flex items-center gap-1.5 text-xs text-rose-600 hover:underline"><Unlink className="w-3.5 h-3.5" /> Unlink this number</button>
        </div>
      )}
    </div>
  );
};
