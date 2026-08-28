import { useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL;

export default function LoyaltyClubJoin() {
  const { slug } = useParams();
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

  const join = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/api/public/loyalty-join/${slug}`, {
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || null,
      });
      setDone(data);
    } catch (ex) {
      setErr(ex.response?.data?.detail || "Something went wrong — please try again");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#0d0b09] text-white flex items-center justify-center px-4 py-10"
      style={{ fontFamily: "'Inter', sans-serif" }} data-testid="loyalty-join-page">
      <div className="w-full max-w-md rounded-3xl border border-amber-300/25 bg-gradient-to-b from-[#171310] to-[#100d0a] p-7 shadow-2xl">
        <p className="text-center text-[11px] tracking-[0.35em] text-amber-300/80 font-bold">✦ LOYALTY CLUB ✦</p>
        {!done ? (
          <>
            <h1 className="font-playfair text-2xl text-center mt-2 text-amber-100">Join &amp; start collecting gold stamps</h1>
            <p className="text-center text-xs text-white/50 mt-2">One stamp every visit — fill your card and a treat is waiting for you ✦</p>
            <form onSubmit={join} className="mt-6 space-y-3">
              <input required minLength={2} maxLength={60} value={form.name} data-testid="loyalty-join-name"
                onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm focus:outline-none focus:border-amber-300/60" />
              <input required type="tel" inputMode="numeric" maxLength={14} value={form.phone} data-testid="loyalty-join-phone"
                onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Mobile number"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm focus:outline-none focus:border-amber-300/60" />
              <input type="email" maxLength={120} value={form.email} data-testid="loyalty-join-email"
                onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email (optional)"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm focus:outline-none focus:border-amber-300/60" />
              {err && <p className="text-xs text-red-300" data-testid="loyalty-join-error">{err}</p>}
              <button disabled={busy} data-testid="loyalty-join-submit"
                className="w-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-[#1a1206] font-bold py-3 text-sm hover:brightness-105 disabled:opacity-60">
                {busy ? "Joining…" : "Join the club ✦"}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center" data-testid="loyalty-join-success">
            <h1 className="font-playfair text-2xl mt-2 text-amber-100">Welcome, {done.first_name} ✦</h1>
            <p className="text-[11px] text-amber-300/70 mt-1" data-testid="loyalty-join-branch">{done.salon_name}{done.location ? ` · ${done.location}` : ""}</p>
            <p className="text-xs text-white/55 mt-2">
              {done.is_new ? "You're in the club!" : "You're already a member — great to see you again!"}
            </p>
            <div className="flex items-center justify-center gap-1.5 mt-5 flex-wrap">
              {Array.from({ length: done.needed }).map((_, i) => (
                <span key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 ${i < done.stamps ? "bg-gradient-to-br from-amber-400 to-yellow-600 border-amber-300 text-white shadow" : "border-amber-300/40 text-amber-300/40"}`}>
                  {i < done.stamps ? "✦" : "·"}
                </span>
              ))}
            </div>
            <p className="text-sm text-amber-200 mt-4 font-semibold">{done.stamps} / {done.needed} stamps</p>
            <p className="text-xs text-white/50 mt-2">
              Complete {done.needed} visits and a <span className="text-amber-300 font-semibold">surprise gift</span> will be waiting for you 🎁
            </p>
            <p className="text-[11px] text-white/35 mt-4">Show your number at the desk on every visit to collect your stamp ✦</p>
          </div>
        )}
        <p className="text-center text-[10px] text-white/25 mt-6">Powered by Miracurl Suite ✦</p>
      </div>
    </div>
  );
}
