import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Gift, Megaphone, FileText, CreditCard, X, ChevronDown, QrCode, Sparkles } from "lucide-react";

const STATUS = { live: ["bg-emerald-100 text-emerald-700", "Live for your salon"], upcoming: ["bg-amber-100 text-amber-700", "Starts soon"], ended: ["bg-slate-200 text-slate-600", "Campaign closed"], off: ["bg-slate-100 text-slate-500", "Paused"] };
const safeLink = (u) => (/^https?:\/\/\S+$/i.test(u || "") ? u : "");
const fmt = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");

function Popup({ d, onClose }) {
  const c = { ...d.campaign, payment_link: safeLink(d.campaign.payment_link) };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="miracurl-update-popup">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#15151b] text-slate-100 border border-[#d4af37]/40 shadow-2xl overflow-hidden">
        <div className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full bg-[#d4af37]/20 blur-3xl" />
        <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center" data-testid="miracurl-update-popup-close"><X className="w-4 h-4" /></button>
        <div className="relative p-7">
          <div className="text-[10px] tracking-[0.35em] uppercase text-[#d4af37]">Miracurl Update</div>
          <h2 className="font-playfair text-2xl text-[#F0D9A5] mt-1">{d.status === "ended" && c.payment_link ? "Campaign closed — settlement ready" : !d.agreement?.accepted ? `Miracurl invites you to ${c.name}` : `${c.name} is ${d.status === "live" ? "LIVE" : "coming"} for your salon`}</h2>
          {!d.agreement?.accepted && d.status !== "ended" && <p className="text-xs text-[#d4af37]/90 mt-1" data-testid="miracurl-update-popup-approve-hint">Please read the Campaign Guide, Participation Agreement &amp; T&amp;C (also emailed to you), then approve in Settings to start.</p>}
          <p className="text-sm text-white/70 mt-2">{d.status === "ended" && c.payment_link ? (c.payment_note || "Thank you for running the Brand Model casting. Please complete the settlement using the payment link.") : `Customers who spend ₹${Number(c.min_transaction).toLocaleString("en-IN")}+ can apply to become your Brand Model and win ${c.rewards.map(r => r.tier).join(" · ")} memberships. ${fmt(c.start_date)} → ${fmt(c.end_date)}.`}</p>
          <div className="mt-4 rounded-2xl bg-white/5 border border-white/10 p-3 max-h-40 overflow-y-auto">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 flex items-center gap-1"><FileText className="w-3 h-3" /> Terms & conditions for salons</div>
            <p className="text-[12px] text-white/75 mt-1 whitespace-pre-line" data-testid="miracurl-update-popup-terms">{c.tenant_terms}</p>
          </div>
          <div className="mt-5 flex gap-2 flex-wrap">
            {d.status === "ended" && c.payment_link ? <a href={c.payment_link} target="_blank" rel="noreferrer" className="px-5 py-2.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-sm font-bold inline-flex items-center gap-2" data-testid="miracurl-update-popup-pay"><CreditCard className="w-4 h-4" /> Pay now</a>
              : d.agreement?.accepted
                ? <Link to="/settings#campaign-agreement" onClick={onClose} className="px-5 py-2.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-sm font-bold inline-flex items-center gap-2" data-testid="miracurl-update-popup-poster"><QrCode className="w-4 h-4" /> {d.agreement?.onboarding?.live ? "Get my QR poster" : "View campaign status"}</Link>
                : <Link to="/settings#campaign-agreement" onClick={onClose} className="px-5 py-2.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-sm font-bold inline-flex items-center gap-2" data-testid="miracurl-update-popup-approve"><FileText className="w-4 h-4" /> Read documents &amp; approve</Link>}
            <button onClick={onClose} className="px-5 py-2.5 rounded-full border border-white/20 text-white/80 text-sm hover:bg-white/10" data-testid="miracurl-update-popup-ack">I've read the terms</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MiracurlUpdates() {
  const [d, setD] = useState(null);
  const [popup, setPopup] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { api.get("/settings/rewards-campaign").then(r => setD(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    if (!d?.show_popup) return undefined;
    // wait until other onboarding modals (What's New / notices) are gone so popups never stack
    const tick = () => { if (!document.querySelector('[data-testid="whats-new-modal"], [data-testid="notice-popup"]')) { setPopup(true); return true; } return false; };
    if (tick()) return undefined;
    const iv = setInterval(() => { if (tick()) clearInterval(iv); }, 800);
    return () => clearInterval(iv);
  }, [d]);
  if (!d || !d.enabled || !d.plan_ok) return null;
  const c = { ...d.campaign, payment_link: safeLink(d.campaign.payment_link) };
  const [cls, label] = STATUS[d.status] || STATUS.off;
  const ack = () => { setPopup(false); api.post("/settings/rewards-campaign/ack", { key: d.popup_key }).catch(() => {}); };
  return (
    <>
      {popup && <Popup d={d} onClose={ack} />}
      <section className="relative overflow-hidden rounded-2xl border border-[#d4af37]/40 bg-[#15151b] text-slate-100 p-5" data-testid="miracurl-updates-card">
        <div className="pointer-events-none absolute -top-24 -right-20 w-72 h-72 rounded-full bg-[#d4af37]/15 blur-3xl" />
        <div className="relative flex items-start gap-3 flex-wrap">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#F0D9A5] to-[#C89B52] flex items-center justify-center shrink-0"><Megaphone className="w-5 h-5 text-[#15151b]" /></div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.35em] uppercase text-[#d4af37]">Miracurl Updates</div>
            <div className="flex items-center gap-2 flex-wrap"><h2 className="font-playfair text-xl text-[#F0D9A5]">{c.name}</h2><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`} data-testid="miracurl-updates-status">{label}</span></div>
            <p className="text-xs text-slate-400 mt-0.5">{fmt(c.start_date)} → {fmt(c.end_date)} · {d.participants.length} customer{d.participants.length === 1 ? "" : "s"} enrolled from your salon · winners: {c.rewards.map(r => `${r.emoji} ${r.tier} ×${r.winners}`).join(" · ")}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {d.status === "ended" && c.payment_link && <a href={c.payment_link} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-xs font-bold inline-flex items-center gap-1.5" data-testid="miracurl-updates-pay"><CreditCard className="w-3.5 h-3.5" /> Pay settlement</a>}
            <Link to="/settings" className="px-4 py-2 rounded-full border border-[#d4af37]/50 text-[#F0D9A5] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#d4af37]/10" data-testid="miracurl-updates-poster"><QrCode className="w-3.5 h-3.5" /> QR poster & entries</Link>
          </div>
        </div>
        {d.agreement && d.eligible !== undefined && (
          <div className={`relative mt-3 rounded-xl border px-4 py-2.5 text-xs flex items-center gap-3 flex-wrap ${d.agreement.accepted ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-rose-400/40 bg-rose-500/10 text-rose-100"}`} data-testid="miracurl-updates-agreement">
            <b>Participation agreement:</b>
            {d.agreement.accepted
              ? <span>accepted by {d.agreement.acceptance?.full_name} on {fmt(String(d.agreement.acceptance?.accepted_at || "").slice(0, 10))} · {d.agreement.share_pct}% settlement share</span>
              : <span>{d.agreement.needs_reaccept ? "terms updated — re-acceptance required" : "not yet accepted"} · {d.agreement.share_pct}% settlement share after the campaign</span>}
            <a href="/settings#campaign-agreement" className="ml-auto px-3 py-1 rounded-full border border-current text-[11px] font-bold" data-testid="miracurl-updates-agreement-link">{d.agreement.accepted ? "View documents" : "Review & accept"}</a>
          </div>
        )}
        {d.settlement && (
          <div className={`relative mt-3 rounded-xl border px-4 py-2.5 text-xs flex items-center gap-3 flex-wrap ${d.settlement.status === "paid" ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-amber-400/40 bg-amber-500/10 text-amber-100"}`} data-testid="miracurl-updates-settlement">
            <b>Your settlement:</b> ₹{Number(d.settlement.amount).toLocaleString("en-IN")}
            {d.settlement.due_date && d.settlement.status !== "paid" && <span>· due {fmt(d.settlement.due_date)}</span>}
            <span className="px-2 py-0.5 rounded-full border border-current text-[10px] font-bold uppercase" data-testid="miracurl-updates-settlement-status">{d.settlement.status === "paid" ? "Paid — thank you" : d.settlement.status === "waived" ? "Waived" : "Pending"}</span>
            {d.settlement.note && <span className="text-white/60">{d.settlement.note}</span>}
            {d.settlement.trusted && <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold inline-flex items-center gap-1" data-testid="miracurl-updates-trusted">✦ Trusted by Miracurl badge live on your booking page</span>}
            {d.settlement.status !== "paid" && d.settlement.status !== "waived" && (d.settlement.pay_url || c.payment_link) && <a href={d.settlement.pay_url || c.payment_link} target="_blank" rel="noreferrer" className="ml-auto px-3 py-1 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-[11px] font-bold inline-flex items-center gap-1" data-testid="miracurl-updates-settlement-pay"><CreditCard className="w-3 h-3" /> Pay now</a>}
          </div>
        )}
        {!d.settlement && d.status === "ended" && c.payment_link && <div className="relative mt-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200" data-testid="miracurl-updates-payment-note"><b>Settlement:</b> {c.payment_note || "Please complete the campaign settlement using the payment link."}</div>}
        {c.updates?.length > 0 && (
          <ul className="relative mt-4 space-y-2" data-testid="miracurl-updates-feed">
            {c.updates.slice(0, open ? 30 : 2).map((u, i) => <li key={i} className="flex gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2"><Sparkles className="w-3.5 h-3.5 text-[#d4af37] shrink-0 mt-0.5" /><div><div className="text-xs font-semibold text-white">{u.title} <span className="text-slate-500 font-normal">· {fmt(u.date)}</span></div>{u.body && <div className="text-[11.5px] text-slate-300 mt-0.5">{u.body}</div>}</div></li>)}
          </ul>
        )}
        <button onClick={() => setOpen(o => !o)} className="relative mt-3 w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 text-[11px] text-slate-300" data-testid="miracurl-updates-terms-toggle"><span className="inline-flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-[#d4af37]" /> Terms & conditions posted by Miracurl HQ{c.updates?.length > 2 ? " · all updates" : ""}</span><ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></button>
        {open && <p className="relative mt-2 text-[12px] text-slate-300 whitespace-pre-line rounded-xl bg-black/30 p-3" data-testid="miracurl-updates-terms">{c.tenant_terms}</p>}
        <div className="relative mt-3 text-[10px] text-slate-500 inline-flex items-center gap-1"><Gift className="w-3 h-3" /> Powered by Miracurl · memberships funded by Miracurl, redeemed at your salon</div>
      </section>
    </>
  );
}
