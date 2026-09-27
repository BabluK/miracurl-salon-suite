import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { QrCode, Smartphone, CheckCircle2, Loader2, Copy } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/** Guest-side "Pay at table": UPI QR + tap-to-pay intent once the bill is raised (status billed, not yet paid). */
export function PayAtTableCard({ slug, orderId, live }) {
  const [claimed, setClaimed] = useState(!!live?.paid_claimed_at);
  const [busy, setBusy] = useState(false);
  if (!live || live.status !== "billed") return null;
  const amount = Number(live.bill_total || live.invoice_total || live.total || 0);

  if (live.paid) return (
    <div className="mt-5 rounded-3xl border border-emerald-400/40 bg-emerald-500/10 p-5 text-center" data-testid="pay-at-table-paid">
      <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
      <h3 className="font-playfair text-xl mt-2">Payment received — thank you! ♡</h3>
      <p className="text-white/70 text-sm mt-1">Bill {live.invoice_no ? `#${live.invoice_no} · ` : ""}₹{amount.toLocaleString("en-IN")} settled</p>
    </div>
  );

  const pay = live.pay;
  const claim = async () => {
    setBusy(true);
    try {
      await axios.post(`${BACKEND_URL}/api/public/table-order-paid-claim/${slug}/${orderId}`);
      setClaimed(true);
      toast.success("Thanks! Our team will confirm your payment in a moment");
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't notify the team — please show your payment to the waiter"); }
    finally { setBusy(false); }
  };
  const copyVpa = () => navigator.clipboard?.writeText(pay.vpa).then(() => toast.success("UPI ID copied")).catch(() => {});

  return (
    <div className="mt-5 rounded-3xl border border-gold/50 bg-white/[0.04] p-5" data-testid="pay-at-table-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[.25em] text-gold font-semibold">Your bill is ready</p>
          <h3 className="font-playfair text-2xl leading-tight mt-0.5">₹{amount.toLocaleString("en-IN")}</h3>
          {live.invoice_no && <p className="text-white/60 text-xs">Bill #{live.invoice_no} · Table {live.table_no}</p>}
        </div>
        <QrCode className="w-8 h-8 text-gold/80" />
      </div>
      {pay ? (
        <>
          <div className="mt-4 rounded-2xl bg-[#FFFDF7] p-3 flex items-center justify-center">
            <img src={`${BACKEND_URL}/api/public/table-order-upi-qr/${slug}/${orderId}`} alt="UPI QR to pay your bill" className="w-52 h-52" data-testid="pay-at-table-qr" />
          </div>
          <p className="text-center text-white/70 text-xs mt-2">Scan with GPay · PhonePe · Paytm · any UPI app — amount is pre-filled</p>
          <a href={pay.link} data-testid="pay-at-table-upi-link"
            className="mt-3 w-full py-3.5 rounded-full bg-gradient-to-r from-[#d4af37] to-[#f3d27a] text-black text-base font-bold inline-flex items-center justify-center gap-2 shadow-[0_10px_30px_-10px_rgba(212,175,55,.7)]">
            <Smartphone className="w-4 h-4" /> Pay ₹{amount.toLocaleString("en-IN")} with UPI app
          </a>
          <button onClick={copyVpa} className="mt-2 w-full text-xs text-white/60 inline-flex items-center justify-center gap-1.5" data-testid="pay-at-table-copy-vpa"><Copy className="w-3 h-3" /> {pay.vpa}</button>
          <button onClick={claim} disabled={busy || claimed} data-testid="pay-at-table-claim-btn"
            className="mt-3 w-full py-3 rounded-full border-2 border-emerald-400/60 text-emerald-200 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-70">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} {claimed ? "Team notified — confirming your payment" : "I've paid — notify the team"}
          </button>
        </>
      ) : (
        <p className="mt-3 text-sm text-white/70" data-testid="pay-at-table-no-upi">Please pay at the counter or ask your waiter — cash, card and UPI accepted.</p>
      )}
    </div>
  );
}
