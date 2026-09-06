import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Sparkles, Gift, Trophy, Camera, Loader2, CheckCircle2 } from "lucide-react";

const PUBLIC = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api/public` });
const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const STEPS = [
  ["1️⃣", "Visit the salon", "Book your appointment and enjoy your salon services."],
  ["2️⃣", "Spend the minimum", "Complete an eligible transaction in one bill."],
  ["3️⃣", "Refer friends & family", "Share your salon experience — every eligible friend earns you an entry."],
  ["4️⃣", "Scan & Enrol", "Scan the campaign QR after your visit and register here."],
  ["5️⃣", "Get featured", "Our team selects 10 outstanding customer entries to be featured on the Miracurl website."],
];

function JoinForm({ slug, refCode, onJoined }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", consent: true });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await PUBLIC.post(`/rewards/${slug}/join`, { ...f, ref: refCode || null });
      toast.success(data.already ? "You're already enrolled — welcome back!" : "🎉 You're in! Check your email for the welcome note");
      onJoined(f.phone);
    } catch (err) { toast.error(err.response?.data?.detail || "Couldn't join — please try again"); }
    setBusy(false);
  };
  const cls = "w-full rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/60";
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="rewards-join-form">
      <input required value={f.name} onChange={set("name")} placeholder="Your name" className={cls} data-testid="rewards-name" />
      <input required value={f.phone} onChange={set("phone")} placeholder="Mobile number (same as used at the salon)" className={cls} data-testid="rewards-phone" />
      <input required type="email" value={f.email} onChange={set("email")} placeholder="Email for your welcome note" className={cls} data-testid="rewards-email" />
      <label className="flex items-start gap-2 text-[12px] text-white/60"><input type="checkbox" checked={f.consent} onChange={set("consent")} className="mt-0.5 accent-[#d4af37]" data-testid="rewards-consent" />With my permission, my photo and salon experience may be featured on the Miracurl website.</label>
      <button disabled={busy} data-testid="rewards-join-btn" className="w-full py-3.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] font-bold text-sm hover:brightness-110 disabled:opacity-60 inline-flex items-center justify-center gap-2 shadow-[0_10px_30px_-10px_rgba(212,175,55,0.8)]">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Join the campaign
      </button>
    </form>
  );
}

function MyEntries({ slug, phone }) {
  const [me, setMe] = useState(null);
  const [story, setStory] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => PUBLIC.get(`/rewards/${slug}/me`, { params: { phone } }).then(r => { setMe(r.data); setStory(r.data.story || ""); }).catch(() => {});
  useEffect(() => { load(); }, [slug, phone]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null;
  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("phone", phone); fd.append("file", file);
    setBusy(true);
    try { await PUBLIC.post(`/rewards/${slug}/photo`, fd); toast.success("Photo added ✦"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Upload failed"); }
    setBusy(false);
  };
  const saveStory = async () => {
    setBusy(true);
    try { await PUBLIC.post(`/rewards/${slug}/story`, { phone, story, consent: true, followed: true }); toast.success("Your story is saved"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Couldn't save"); }
    setBusy(false);
  };
  const e = me.entries;
  return (
    <div className="rounded-3xl border border-[#d4af37]/40 bg-white/5 p-6 space-y-4" data-testid="rewards-my-entries">
      <div className="flex items-center justify-between">
        <div><div className="text-[10px] tracking-[0.3em] uppercase text-[#d4af37]">Welcome, {me.name.split(" ")[0]}</div><div className="font-playfair text-3xl text-white mt-1">{e.total} <span className="text-base text-white/50">entr{e.total === 1 ? "y" : "ies"}</span></div></div>
        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[12px] text-white/70">
        <div className="rounded-xl bg-black/30 p-2.5">Purchases <b className="text-white block">{e.purchases}</b></div>
        <div className="rounded-xl bg-black/30 p-2.5">Friends referred <b className="text-white block">{e.referred}</b></div>
        <div className="rounded-xl bg-black/30 p-2.5">Bonus <b className="text-white block">{e.review + e.profile + e.follow + e.referral3}</b></div>
      </div>
      <div className="text-[12px] text-white/60">Your referral link: <code className="text-[#d4af37] break-all" data-testid="rewards-ref-link">{window.location.origin}/rewards/{slug}?ref={me.ref_code}</code></div>
      <div className="grid sm:grid-cols-[120px_1fr] gap-3 items-start">
        <label className="aspect-square rounded-2xl border border-dashed border-white/25 bg-black/30 flex flex-col items-center justify-center text-white/60 text-[11px] cursor-pointer hover:border-[#d4af37]/60 overflow-hidden" data-testid="rewards-photo-label">
          {me.photo_url ? <img src={`${process.env.REACT_APP_BACKEND_URL}${me.photo_url}`} alt="" className="w-full h-full object-cover" /> : <><Camera className="w-5 h-5 mb-1" /> Add your photo</>}
          <input type="file" accept="image/*" className="hidden" onChange={upload} data-testid="rewards-photo-input" />
        </label>
        <div className="space-y-2">
          <textarea value={story} onChange={e2 => setStory(e2.target.value)} maxLength={600} rows={3} placeholder="Your style. Your story. Tell us about your salon experience…" className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/40" data-testid="rewards-story" />
          <button onClick={saveStory} disabled={busy} className="px-4 py-2 rounded-full bg-white/10 border border-white/15 text-white text-xs font-semibold hover:bg-white/15 disabled:opacity-50" data-testid="rewards-story-save">{busy ? "Saving…" : "Save my story"}</button>
        </div>
      </div>
    </div>
  );
}

export default function RewardsCampaign() {
  const { slug } = useParams();
  const [sp] = useSearchParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [phone, setPhone] = useState(() => localStorage.getItem(`rewards_phone_${slug}`) || "");
  useEffect(() => { PUBLIC.get(`/rewards/${slug}`).then(r => setD(r.data)).catch(e => setErr(e.response?.data?.detail || "Campaign not found")); }, [slug]);
  const joined = (ph) => { localStorage.setItem(`rewards_phone_${slug}`, ph); setPhone(ph); };
  if (err) return <div className="min-h-screen bg-[#0f0f14] text-white flex items-center justify-center">{err}</div>;
  if (!d) return <div className="min-h-screen bg-[#0f0f14]" />;
  const c = d.campaign;
  const min = `₹${Number(c.min_transaction).toLocaleString("en-IN")}`;
  return (
    <div className="min-h-screen bg-[#0f0f14] text-white" data-testid="rewards-page">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 15% 10%, #d4af37 0, transparent 40%), radial-gradient(circle at 85% 80%, #7a2d4e 0, transparent 45%)" }} />
        <div className="relative max-w-5xl mx-auto px-5 pt-12 pb-10">
          <Link to={`/book/${slug}`} className="text-[11px] text-white/50 hover:text-[#d4af37]">← {d.salon.name}</Link>
          <div className="mt-6 inline-flex items-center gap-2 text-[10px] tracking-[0.35em] uppercase text-[#d4af37] border border-[#d4af37]/50 rounded-full px-3 py-1"><Gift className="w-3 h-3" /> Miracurl Customer Rewards</div>
          <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl mt-4 leading-[1.05]">Spend. Refer.<br /><span className="text-[#d4af37]">Participate. Win.</span></h1>
          <p className="text-base md:text-lg text-white/70 mt-5 max-w-2xl">Visit <b className="text-white">{d.salon.name}</b>, spend {min} or more on eligible salon services and participate in our exclusive customer rewards campaign.</p>
          <div className="mt-4 text-xs text-white/50" data-testid="rewards-period">{fmtDate(c.start_date)} → {fmtDate(c.end_date)} · {d.participants} customer{d.participants === 1 ? "" : "s"} joined</div>
          {!d.eligible && <div className="mt-4 inline-block rounded-xl bg-amber-500/15 border border-amber-400/40 px-4 py-2 text-xs text-amber-200" data-testid="rewards-not-live">{d.live ? "This salon isn't part of the campaign yet." : "The campaign isn't live right now — check back soon."}</div>}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 pb-16 grid lg:grid-cols-[1.2fr_1fr] gap-8">
        <div className="space-y-8">
          <section>
            <h2 className="text-base md:text-lg font-semibold text-[#d4af37] tracking-wide">🎁 Chance to win</h2>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {c.rewards.map(r => <div key={r.tier} className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center"><div className="text-2xl">{r.emoji}</div><div className="text-sm font-semibold mt-1">{r.tier}</div><div className="text-[11px] text-white/50">Membership · {r.winners} winner{r.winners === 1 ? "" : "s"}</div></div>)}
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center"><div className="text-2xl">🎁</div><div className="text-sm font-semibold mt-1">Special</div><div className="text-[11px] text-white/50">salon rewards</div></div>
            </div>
          </section>
          <section>
            <h2 className="text-base md:text-lg font-semibold text-[#d4af37] tracking-wide">How it works</h2>
            <ol className="mt-3 space-y-3">
              {STEPS.map(([n, t, s]) => <li key={t} className="flex gap-3"><span className="text-xl leading-none">{n}</span><div><div className="text-sm font-semibold">{t}</div><div className="text-[12.5px] text-white/60">{t === "Spend the minimum" ? `Complete an eligible transaction of ${min} or more.` : s}</div></div></li>)}
            </ol>
            <p className="text-[11px] text-white/45 mt-3">📸 With your permission, your photo and salon experience may be featured on our website.</p>
          </section>
          <section>
            <h2 className="text-base md:text-lg font-semibold text-[#d4af37] tracking-wide">Ways to earn entries</h2>
            <table className="mt-3 w-full text-sm" data-testid="rewards-entry-table"><tbody>
              {c.entry_rules.map(r => <tr key={r.key} className="border-t border-white/10"><td className="py-2 text-white/80">{r.label}</td><td className="py-2 text-right font-bold text-[#d4af37]">+{r.entries}</td></tr>)}
            </tbody></table>
          </section>
          {d.winners.length > 0 && (
            <section data-testid="rewards-top10">
              <h2 className="text-base md:text-lg font-semibold text-[#d4af37] tracking-wide inline-flex items-center gap-2"><Trophy className="w-4 h-4" /> Meet Our Top {c.winner_count}</h2>
              <p className="text-[12px] text-white/50 mt-1">Your style. Your story. Your moment.</p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {d.winners.map((w, i) => <figure key={i} className="rounded-2xl overflow-hidden bg-white/5 border border-white/10">
                  {w.photo_url ? <img src={`${process.env.REACT_APP_BACKEND_URL}${w.photo_url}`} alt={w.name} className="aspect-[4/5] w-full object-cover" /> : <div className="aspect-[4/5] flex items-center justify-center text-4xl">💇</div>}
                  <figcaption className="p-3"><div className="text-sm font-semibold">{w.name} <span className="text-[10px] text-[#d4af37]">· {w.winner_tier}</span></div><div className="text-[11px] text-white/55 line-clamp-3">{w.story}</div><div className="text-[10px] text-white/40 mt-1">{w.salon_name}</div></figcaption>
                </figure>)}
              </div>
            </section>
          )}
          <section className="text-[11px] text-white/45 leading-relaxed" data-testid="rewards-terms"><b className="text-white/60">Terms:</b> {c.terms}</section>
        </div>
        <aside className="lg:sticky lg:top-6 self-start space-y-4">
          {phone ? <MyEntries slug={slug} phone={phone} /> : (
            <div className="rounded-3xl border border-[#d4af37]/40 bg-white/5 p-6">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#d4af37]">Scan & enrol</div>
              <h3 className="font-playfair text-2xl mt-2">Join the campaign</h3>
              <p className="text-[12.5px] text-white/60 mt-1 mb-4">Takes 20 seconds. We'll email you the full process.</p>
              {d.eligible ? <JoinForm slug={slug} refCode={sp.get("ref")} onJoined={joined} /> : <p className="text-xs text-white/50">Enrolment opens when the campaign is live.</p>}
            </div>
          )}
          {phone && <button onClick={() => { localStorage.removeItem(`rewards_phone_${slug}`); setPhone(""); }} className="text-[11px] text-white/40 hover:text-white/70" data-testid="rewards-switch">Not you? Join with another number</button>}
        </aside>
      </div>
    </div>
  );
}
