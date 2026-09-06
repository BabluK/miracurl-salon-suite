import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Sparkles, Trophy, Camera, Loader2, CheckCircle2, Download, Share2, Crown, Star, CalendarDays, MapPin, Phone, Quote, ArrowRight, Scissors, UtensilsCrossed, Heart, Vote } from "lucide-react";
import { downloadBlob, shareWinnerCard, whatsappShareText } from "@/lib/winnerCard";

const API = process.env.REACT_APP_BACKEND_URL;
const PUBLIC = axios.create({ baseURL: `${API}/api/public` });
const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const STEPS = [
  ["01", "Visit & indulge", "Book your appointment and enjoy your salon services."],
  ["02", "Spend the minimum", "Complete an eligible transaction in one bill."],
  ["03", "Share your look", "Add your photo and your style story — this is your portfolio."],
  ["04", "Refer friends", "Every eligible friend you bring earns you another entry."],
  ["05", "Get cast", "Our team picks the Brand Models — featured on the salon's page & Miracurl."],
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
      toast.success(data.already ? "You're already on the casting list — welcome back!" : "✨ Application received! Check your email for the next steps");
      onJoined(f.phone);
    } catch (err) { toast.error(err.response?.data?.detail || "Couldn't apply — please try again"); }
    setBusy(false);
  };
  const cls = "w-full rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/60";
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="rewards-join-form">
      <input required value={f.name} onChange={set("name")} placeholder="Your name" className={cls} data-testid="rewards-name" />
      <input required value={f.phone} onChange={set("phone")} placeholder="Mobile number (same as used at the salon)" className={cls} data-testid="rewards-phone" />
      <input required type="email" value={f.email} onChange={set("email")} placeholder="Email for your casting details" className={cls} data-testid="rewards-email" />
      <label className="flex items-start gap-2 text-[12px] text-white/60"><input type="checkbox" checked={f.consent} onChange={set("consent")} className="mt-0.5 accent-[#d4af37]" data-testid="rewards-consent" />With my permission, my photo and salon story may be featured on the salon's page and the Miracurl website.</label>
      <button disabled={busy} data-testid="rewards-join-btn" className="w-full py-3.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] font-bold text-sm hover:brightness-110 disabled:opacity-60 inline-flex items-center justify-center gap-2 shadow-[0_10px_30px_-10px_rgba(212,175,55,0.8)]">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Apply to be our Brand Model
      </button>
    </form>
  );
}

function WinnerBadge({ slug, phone, me, salon }) {
  const [busy, setBusy] = useState("");
  const get = async (mode) => {
    setBusy(mode);
    try {
      const { data: blob } = await PUBLIC.get(`/rewards/${slug}/winner-card.png`, { params: { phone, origin: window.location.origin }, responseType: "blob" });
      const filename = `brand-model-${me.name.toLowerCase().replace(/\s+/g, "-")}.png`;
      if (mode === "dl") { downloadBlob(blob, filename); toast.success("Your winner card is downloaded ✦"); }
      else await shareWinnerCard({ blob, filename, text: whatsappShareText({ name: me.name, tier: me.winner_tier, salon, url: `${window.location.origin}/rewards/${slug}` }) });
    } catch (err) { toast.error(err.response?.data?.detail || "Couldn't build your card"); }
    setBusy("");
  };
  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#d4af37] bg-gradient-to-br from-[#d4af37]/25 via-[#15151b] to-[#7a2d4e]/30 p-5" data-testid="rewards-winner-badge">
      <Crown className="absolute -right-4 -top-4 w-28 h-28 text-[#d4af37]/15" />
      <div className="text-[10px] tracking-[0.35em] uppercase text-[#F0D9A5]">✦ Congratulations</div>
      <div className="font-playfair text-2xl text-white mt-1">You're our Brand Model!</div>
      <p className="text-[12.5px] text-white/70 mt-1">You've won a <b className="text-[#F0D9A5]">{me.winner_tier} Membership</b>. Share your moment — every share inspires the next model.</p>
      <div className="flex gap-2 mt-4 flex-wrap">
        <button onClick={() => get("dl")} disabled={!!busy} data-testid="rewards-winner-card-dl" className="px-4 py-2 rounded-full border border-[#d4af37]/60 text-[#F0D9A5] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#d4af37]/10 disabled:opacity-50">{busy === "dl" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download my winner card</button>
        <button onClick={() => get("share")} disabled={!!busy} data-testid="rewards-winner-card-share" className="px-4 py-2 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">{busy === "share" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />} Share on WhatsApp / Instagram</button>
      </div>
    </div>
  );
}

function MyEntries({ slug, phone, salon }) {
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
    <div className="space-y-4">
      {me.winner_tier && <WinnerBadge slug={slug} phone={phone} me={me} salon={salon} />}
      <div className="rounded-3xl border border-[#d4af37]/40 bg-[#15151b]/80 backdrop-blur-xl p-6 space-y-4" data-testid="rewards-my-entries">
        <div className="flex items-center justify-between">
          <div><div className="text-[10px] tracking-[0.3em] uppercase text-[#d4af37]">Your casting profile · {me.name.split(" ")[0]}</div><div className="font-playfair text-3xl text-white mt-1">{e.total} <span className="text-base text-white/50">entr{e.total === 1 ? "y" : "ies"}</span></div></div>
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[12px] text-white/70">
          <div className="rounded-xl bg-black/30 p-2.5">Purchases <b className="text-white block">{e.purchases}</b></div>
          <div className="rounded-xl bg-black/30 p-2.5">Friends referred <b className="text-white block">{e.referred}</b></div>
          <div className="rounded-xl bg-black/30 p-2.5">Bonus <b className="text-white block">{e.review + e.profile + e.follow + e.referral3 + (e.votes || 0)}</b></div>
        </div>
        <div className="rounded-2xl border border-[#d4af37]/40 bg-[#d4af37]/10 p-3 flex items-center gap-3" data-testid="rewards-my-votes">
          <Heart className="w-6 h-6 text-[#F0D9A5] fill-current shrink-0" />
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-white">{e.vote_count || 0} public vote{e.vote_count === 1 ? "" : "s"} · {e.votes || 0} bonus entr{e.votes === 1 ? "y" : "ies"}{(me.vote_milestones || []).length > 0 && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-[#F0D9A5] text-[#15151b] font-bold" data-testid="rewards-milestone-badge">🎉 {Math.max(...me.vote_milestones)}+ votes</span>}</div><div className="text-[11px] text-white/60">{me.photo_url ? "Every 10 votes = +1 entry. Ask friends to vote for your look!" : "Add your photo below to appear in the public vote."}</div></div>
          {me.photo_url && <button onClick={() => { const url = `${window.location.origin}/rewards/${slug}?vote=${me.id}`; const text = `❤ Vote for me to become the Brand Model of ${salon}! ${url}`; if (navigator.share) navigator.share({ text, url }).catch(() => {}); else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener"); }} className="shrink-0 h-8 px-3 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-xs font-bold inline-flex items-center gap-1" data-testid="rewards-get-votes-btn"><Share2 className="w-3.5 h-3.5" /> Get votes</button>}
        </div>
        <div className="text-[12px] text-white/60">Your referral link: <code className="text-[#d4af37] break-all" data-testid="rewards-ref-link">{window.location.origin}/rewards/{slug}?ref={me.ref_code}</code></div>
        <div className="grid sm:grid-cols-[120px_1fr] gap-3 items-start">
          <label className="aspect-square rounded-2xl border border-dashed border-white/25 bg-black/30 flex flex-col items-center justify-center text-white/60 text-[11px] cursor-pointer hover:border-[#d4af37]/60 overflow-hidden" data-testid="rewards-photo-label">
            {me.photo_url ? <img src={`${API}${me.photo_url}`} alt="" className="w-full h-full object-cover" /> : <><Camera className="w-5 h-5 mb-1" /> Add your look</>}
            <input type="file" accept="image/*" className="hidden" onChange={upload} data-testid="rewards-photo-input" />
          </label>
          <div className="space-y-2">
            <textarea value={story} onChange={e2 => setStory(e2.target.value)} maxLength={600} rows={3} placeholder="Your style. Your story. Tell us about your salon experience…" className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/40" data-testid="rewards-story" />
            <button onClick={saveStory} disabled={busy} className="px-4 py-2 rounded-full bg-white/10 border border-white/15 text-white text-xs font-semibold hover:bg-white/15 disabled:opacity-50" data-testid="rewards-story-save">{busy ? "Saving…" : "Save my story"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}


function VoteGallery({ slug, phone, live, salon, highlight }) {
  const [d, setD] = useState(null);
  const [voter, setVoter] = useState(() => phone || localStorage.getItem(`rewards_voter_${slug}`) || "");
  const [ask, setAsk] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const load = () => PUBLIC.get(`/rewards/${slug}/applicants`, { params: { voter } }).then(r => setD(r.data)).catch(() => {});
  useEffect(() => { load(); }, [slug, voter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (highlight && d) setTimeout(() => document.getElementById(`applicant-${highlight}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 300); }, [highlight, d]);
  const vote = async (a, ph) => {
    setBusy(a.id);
    try {
      const { data } = await PUBLIC.post(`/rewards/${slug}/vote`, { participant_id: a.id, phone: ph });
      toast.success(data.voted ? `❤ Voted for ${a.name}` : "Vote removed");
      localStorage.setItem(`rewards_voter_${slug}`, ph); setVoter(ph); setAsk(null);
      setD(s => ({ ...s, applicants: s.applicants.map(x => (x.id === a.id ? { ...x, votes: data.votes, voted: data.voted } : x)) }));
    } catch (err) { toast.error(err.response?.data?.detail || "Couldn't vote"); }
    setBusy("");
  };
  const onVote = (a) => (voter ? vote(a, voter) : setAsk(a.id));
  const share = (a) => {
    const url = `${window.location.origin}/rewards/${slug}?vote=${a.id}`;
    const text = `❤ Vote for ${a.name} to become the Brand Model of ${salon}! Tap, enter your number and vote: ${url}`;
    if (navigator.share) navigator.share({ text, url }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  if (!d) return null;
  return (
    <section id="vote" className="max-w-6xl mx-auto px-5 pb-14" data-testid="rewards-vote-gallery">
      <div className="rounded-[2rem] border border-[#d4af37]/30 bg-gradient-to-br from-[#d4af37]/[.08] via-transparent to-[#7a2d4e]/20 p-6 sm:p-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] tracking-[0.35em] uppercase text-[#d4af37] inline-flex items-center gap-2"><Vote className="w-3.5 h-3.5" /> Public vote</div>
            <h2 className="font-playfair text-3xl sm:text-4xl text-white mt-2">Vote for your favourite look</h2>
            <p className="text-sm text-white/55 mt-1">Every 10 votes earns an applicant an extra casting entry. One vote per number per applicant — tap ❤ again to change your mind.</p>
          </div>
          <div className="text-right"><div className="font-playfair text-3xl text-[#F0D9A5]" data-testid="rewards-total-votes">{d.total_votes}</div><div className="text-[10px] uppercase tracking-wider text-white/50">votes cast</div></div>
        </div>
        {d.applicants.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-white/50" data-testid="rewards-no-applicants">No looks to vote on yet — be the first: apply and add your photo.</div>
        ) : (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {d.applicants.map(a => (
              <div key={a.id} id={`applicant-${a.id}`} data-testid={`rewards-applicant-${a.id}`}
                className={`group relative rounded-2xl overflow-hidden border transition-all duration-300 ${highlight === a.id ? "border-[#F0D9A5] ring-2 ring-[#d4af37]/50 shadow-[0_0_40px_-10px_rgba(212,175,55,.8)]" : "border-white/10 hover:border-[#d4af37]/60"}`}>
                <div className="aspect-[3/4] relative">
                  <img src={`${API}${a.photo_url}`} alt={a.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                  <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-[#F0D9A5] border border-[#d4af37]/40">#{a.rank}{a.winner_tier ? ` · ${a.winner_tier}` : ""}</span>
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <div className="font-playfair text-lg text-white leading-tight">{a.name}</div>
                    {a.story && <div className="text-[10.5px] text-white/60 line-clamp-2 italic mt-0.5">“{a.story}”</div>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 p-2 bg-[#15151b]">
                  <button onClick={() => onVote(a)} disabled={!live || busy === a.id} data-testid={`rewards-vote-btn-${a.id}`}
                    className={`flex-1 h-9 rounded-full text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 ${a.voted ? "bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b]" : "border border-[#d4af37]/50 text-[#F0D9A5] hover:bg-[#d4af37]/15"}`}>
                    {busy === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Heart className={`w-3.5 h-3.5 ${a.voted ? "fill-current" : ""}`} />} <span data-testid={`rewards-vote-count-${a.id}`}>{a.votes}</span>
                  </button>
                  <button onClick={() => share(a)} title="Share & ask for votes" data-testid={`rewards-vote-share-${a.id}`} className="w-9 h-9 rounded-full border border-white/15 text-white/70 hover:text-white hover:border-white/40 flex items-center justify-center"><Share2 className="w-3.5 h-3.5" /></button>
                </div>
                {ask === a.id && (
                  <form onSubmit={e => { e.preventDefault(); vote(a, draft); }} className="absolute inset-0 bg-[#0f0f14]/95 backdrop-blur p-3 flex flex-col justify-center gap-2" data-testid={`rewards-vote-phone-form-${a.id}`}>
                    <div className="text-[11px] text-white/70">Your mobile number — one vote per number.</div>
                    <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} placeholder="Mobile number" className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white" data-testid={`rewards-vote-phone-${a.id}`} />
                    <div className="flex gap-1.5"><button className="flex-1 h-8 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-xs font-bold" data-testid={`rewards-vote-confirm-${a.id}`}>Vote ❤</button><button type="button" onClick={() => setAsk(null)} className="h-8 px-3 rounded-full border border-white/20 text-white/70 text-xs">Cancel</button></div>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SiteHeader({ salon, slug, platformLogo }) {
  const logo = salon.logo_url ? (salon.logo_url.startsWith("http") ? salon.logo_url : `${API}${salon.logo_url}`) : null;
  const nav = [["#models", "Models"], ["#vote", "Vote"], ["#journey", "Journey"], ["#events", "Events"], ["#apply", "Apply"]];
  return (
    <header className="sticky top-0 z-40" data-testid="rewards-header">
      <div className="h-[3px] bg-[linear-gradient(90deg,transparent,#C89B52_20%,#F0D9A5_50%,#C89B52_80%,transparent)]" />
      <div className="border-b border-[#d4af37]/20 bg-[#0b0b10]/75 backdrop-blur-2xl shadow-[0_10px_40px_-20px_rgba(212,175,55,.5)]">
        <div className="max-w-6xl mx-auto px-5 h-[72px] flex items-center gap-4">
          <Link to={`/book/${slug}`} className="flex items-center gap-3 min-w-0 group" data-testid="rewards-header-salon">
            <span className="relative shrink-0">
              <span className="absolute -inset-1 rounded-full bg-[conic-gradient(from_0deg,#F0D9A5,#C89B52,#F0D9A5)] opacity-80 blur-[2px] group-hover:animate-spin [animation-duration:4s]" />
              {logo ? <img src={logo} alt="" className="relative w-11 h-11 rounded-full object-cover ring-2 ring-[#0b0b10]" /> : <span className="relative w-11 h-11 rounded-full bg-[#15151b] ring-2 ring-[#0b0b10] text-[#F0D9A5] font-playfair text-lg flex items-center justify-center">{salon.name[0]}</span>}
            </span>
            <span className="min-w-0"><span className="block font-playfair text-lg sm:text-xl text-white truncate leading-tight">{salon.name}</span><span className="block text-[9px] tracking-[0.35em] uppercase text-[#d4af37] truncate">Brand Model Casting{salon.location ? ` · ${salon.location}` : ""}</span></span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 ml-6">{nav.map(([h, l]) => <a key={h} href={h} className="px-3 py-1.5 rounded-full text-[12px] tracking-wide text-white/65 hover:text-[#F0D9A5] hover:bg-white/5 transition-colors">{l}</a>)}</nav>
          <div className="ml-auto flex items-center gap-3">
            <a href="https://miracurl-suite.com" target="_blank" rel="noreferrer" className="hidden sm:flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-white/10 bg-white/[.04] hover:border-[#d4af37]/50 transition-colors" data-testid="rewards-header-powered">
              <img src={platformLogo || "/ms-logo.png"} alt="Miracurl" className="h-7 w-7 rounded-full object-cover bg-white" /><span className="text-[9px] tracking-[0.25em] uppercase text-white/45 leading-none">Powered by<br /><span className="text-[#F0D9A5] normal-case tracking-normal text-[12px] font-semibold">Miracurl</span></span>
            </a>
            <a href="#apply" className="relative px-5 py-2.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-xs font-bold shadow-[0_8px_24px_-8px_rgba(212,175,55,.9)] hover:brightness-110 transition" data-testid="rewards-header-apply">Apply now</a>
          </div>
        </div>
      </div>
    </header>
  );
}

function ModelCard({ w, i }) {
  const photo = w.photo_url ? `${API}${w.photo_url}` : null;
  return (
    <figure className="group relative rounded-[1.6rem] overflow-hidden bg-white/[.04] border border-white/10 hover:border-[#d4af37]/60 transition-colors" data-testid={`rewards-model-${i}`}>
      <div className="aspect-[4/5] relative overflow-hidden">
        {photo ? <img src={photo} alt={w.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          : <div className="w-full h-full bg-gradient-to-br from-[#2a2415] via-[#15151b] to-[#3a1e2c] flex items-center justify-center"><span className="font-playfair text-6xl text-[#F0D9A5]/70">{w.name[0]}</span></div>}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />
        <span className="absolute top-3 left-3 text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full bg-black/55 backdrop-blur border border-[#d4af37]/60 text-[#F0D9A5]">#{String(i + 1).padStart(2, "0")} · {w.winner_tier}</span>
        <figcaption className="absolute inset-x-0 bottom-0 p-4"><div className="font-playfair text-xl text-white">{w.name}</div><div className="text-[10px] tracking-wider uppercase text-white/60">{w.salon_name}</div></figcaption>
      </div>
      <div className="p-4">
        <Quote className="w-4 h-4 text-[#d4af37]/70" />
        <p className="text-[12.5px] text-white/70 mt-1 leading-relaxed line-clamp-4 italic">{w.story || "Their look spoke for itself — chosen by the casting team for style, confidence and the love they share for the salon."}</p>
      </div>
    </figure>
  );
}

function OpenSlot({ n }) {
  return (
    <a href="#apply" className="rounded-[1.6rem] border border-dashed border-[#d4af37]/35 bg-white/[.02] hover:bg-[#d4af37]/[.06] transition-colors flex flex-col items-center justify-center text-center p-6 min-h-[260px]" data-testid={`rewards-open-slot-${n}`}>
      <span className="w-14 h-14 rounded-full border border-[#d4af37]/50 flex items-center justify-center font-playfair text-xl text-[#F0D9A5]">{String(n).padStart(2, "0")}</span>
      <span className="mt-3 text-[10px] tracking-[0.3em] uppercase text-[#d4af37]">Casting open</span>
      <span className="text-sm text-white/60 mt-1">This spot could be yours</span>
    </a>
  );
}

function Events({ events }) {
  const upcoming = events.filter(e => e.upcoming), past = events.filter(e => !e.upcoming);
  const Row = ({ e, dim }) => (
    <li className={`flex gap-4 items-start ${dim ? "opacity-50" : ""}`} data-testid="rewards-event">
      <div className="shrink-0 w-14 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 text-center py-1.5"><div className="text-[10px] uppercase text-[#d4af37]">{new Date(e.date + "T00:00:00").toLocaleDateString("en-IN", { month: "short" })}</div><div className="font-playfair text-xl text-white leading-none">{new Date(e.date + "T00:00:00").getDate()}</div></div>
      <div><div className="text-sm font-semibold text-white">{e.title}</div>{e.note && <div className="text-[12px] text-white/55 mt-0.5">{e.note}</div>}</div>
    </li>
  );
  return (
    <section id="events" data-testid="rewards-events">
      <h2 className="text-base md:text-lg font-semibold text-[#d4af37] tracking-wide inline-flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Upcoming events</h2>
      <ul className="mt-4 space-y-4">{upcoming.map((e, i) => <Row key={i} e={e} />)}{upcoming.length === 0 && <li className="text-sm text-white/50">New dates coming soon.</li>}</ul>
      {past.length > 0 && <ul className="mt-4 pt-4 border-t border-white/10 space-y-3">{past.map((e, i) => <Row key={i} e={e} dim />)}</ul>}
    </section>
  );
}

function SiteFooter({ salon, slug, platformLogo }) {
  return (
    <footer className="relative mt-16 overflow-hidden" data-testid="rewards-footer">
      <img src="/brand-models-group.jpg" alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0b10] via-[#0b0b10]/55 to-[#0b0b10]/90" /><div className="absolute inset-0 bg-gradient-to-r from-[#0b0b10]/90 via-[#0b0b10]/40 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgba(212,175,55,.22),transparent_55%)]" />
      <div className="relative max-w-6xl mx-auto px-5 pt-20 pb-12">
        <div className="grid lg:grid-cols-[1.25fr_1fr] gap-10 items-end">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-[#d4af37]/40 bg-black/40 backdrop-blur px-4 py-2"><img src={platformLogo || "/ms-logo.png"} alt="Miracurl" className="h-8 w-8 rounded-full object-cover bg-white" /><span className="text-[10px] tracking-[0.35em] uppercase text-[#F0D9A5]">Powered by Miracurl</span></div>
            <h3 className="font-playfair text-4xl sm:text-5xl text-white mt-6 leading-[1.05]">Own a salon or restaurant?<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F0D9A5] via-[#d4af37] to-[#C89B52]">Get onboard & grow your business.</span></h3>
            <p className="text-sm sm:text-base text-white/70 mt-4 max-w-xl">Bookings, POS, memberships, Mira AI marketing and campaigns like this one — everything {salon.name} uses to grow, ready for you in minutes.</p>
            <div className="mt-7 flex gap-3 flex-wrap">
              <a href="/signup-salon" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] font-bold text-sm shadow-[0_14px_40px_-12px_rgba(212,175,55,.9)] hover:brightness-110 transition" data-testid="rewards-footer-signup-salon"><Scissors className="w-4 h-4" /> Join Miracurl — Salons <ArrowRight className="w-4 h-4" /></a>
              <a href="/signup-restaurant" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-[#d4af37]/60 bg-black/30 backdrop-blur text-[#F0D9A5] font-semibold text-sm hover:bg-[#d4af37]/10 transition" data-testid="rewards-footer-signup-restaurant"><UtensilsCrossed className="w-4 h-4" /> Restaurants</a>
            </div>
          </div>
          <div className="rounded-[1.75rem] border border-[#d4af37]/30 bg-[#0b0b10]/70 backdrop-blur-xl p-7 shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)]">
            <div className="text-[10px] tracking-[0.35em] uppercase text-[#d4af37]">The salon</div>
            <div className="font-playfair text-3xl text-white mt-1">{salon.name}</div>
            <div className="mt-4 space-y-2.5 text-sm text-white/70">
              {salon.location && <div className="flex items-center gap-2.5"><span className="w-8 h-8 rounded-full bg-[#d4af37]/15 flex items-center justify-center"><MapPin className="w-4 h-4 text-[#F0D9A5]" /></span> {salon.location}</div>}
              {salon.phone && <a href={`tel:${salon.phone}`} className="flex items-center gap-2.5 hover:text-white"><span className="w-8 h-8 rounded-full bg-[#d4af37]/15 flex items-center justify-center"><Phone className="w-4 h-4 text-[#F0D9A5]" /></span> {salon.phone}</a>}
            </div>
            <Link to={`/book/${slug}`} className="mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-white/10 border border-white/15 text-white text-sm font-semibold hover:bg-white/15 transition" data-testid="rewards-footer-book">Book an appointment <ArrowRight className="w-4 h-4" /></Link>
          </div>
        </div>
        <div className="mt-14 pt-5 border-t border-white/10 flex items-center justify-between gap-3 flex-wrap text-[11px] text-white/45">
          <span>© {new Date().getFullYear()} {salon.name} · Brand Model Casting</span>
          <span>Campaign hosted on <a href="https://miracurl-suite.com" className="text-[#d4af37] hover:text-[#F0D9A5]">Miracurl</a> · Salon & Restaurant Management Suite</span>
        </div>
      </div>
    </footer>
  );
}

export default function RewardsCampaign() {
  const { slug } = useParams();
  const [sp] = useSearchParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [platformLogo, setPlatformLogo] = useState("");
  const [phone, setPhone] = useState(() => localStorage.getItem(`rewards_phone_${slug}`) || "");
  useEffect(() => {
    PUBLIC.get(`/rewards/${slug}`).then(r => setD(r.data)).catch(e => setErr(e.response?.data?.detail || "Campaign not found"));
    PUBLIC.get("/site-info").then(r => setPlatformLogo(r.data.platform_logo || "")).catch(() => {});
  }, [slug]);
  const joined = (ph) => { localStorage.setItem(`rewards_phone_${slug}`, ph); setPhone(ph); };
  if (err) return <div className="min-h-screen bg-[#0f0f14] text-white flex items-center justify-center">{err}</div>;
  if (!d) return <div className="min-h-screen bg-[#0f0f14]" />;
  const c = d.campaign;
  const min = `₹${Number(c.min_transaction).toLocaleString("en-IN")}`;
  const openSlots = Math.max(0, Math.min(c.winner_count, 12) - d.winners.length);
  return (
    <div className="relative min-h-screen bg-[#0b0b10] text-white selection:bg-[#d4af37]/40" data-testid="rewards-page">
      <div className="pointer-events-none fixed inset-0 z-0">
        <img src="/brand-luxe-bg.jpg" alt="" className="w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b0b10]/40 via-[#0b0b10]/75 to-[#0b0b10]" />
      </div>
      <div className="relative z-10">
      <SiteHeader salon={d.salon} slug={slug} platformLogo={platformLogo} />

      {/* HERO */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(circle at 10% 10%, rgba(212,175,55,.55) 0, transparent 38%), radial-gradient(circle at 90% 90%, rgba(122,45,78,.6) 0, transparent 45%)" }} />
        <div className="relative max-w-6xl mx-auto px-5 pt-12 pb-14 grid lg:grid-cols-[1.15fr_.85fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.35em] uppercase text-[#d4af37] border border-[#d4af37]/50 rounded-full px-3 py-1"><Star className="w-3 h-3" /> Casting open · {c.name}</div>
            <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl mt-5 leading-[1.02]" data-testid="rewards-hero-title">Become the<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F0D9A5] via-[#d4af37] to-[#C89B52]">Brand Model</span><br />of {d.salon.name.split(" ").slice(0, 2).join(" ")}</h1>
            <p className="text-base md:text-lg text-white/70 mt-5 max-w-xl">Spend {min}+ on your next visit, share your look and your story — and you could be the face of <b className="text-white">{d.salon.name}</b>, with a Diamond, Platinum or Gold membership to match.</p>
            <div className="mt-5 flex items-center gap-4 flex-wrap text-xs text-white/55" data-testid="rewards-period">
              <span>{fmtDate(c.start_date)} → {fmtDate(c.end_date)}</span><span className="w-1 h-1 rounded-full bg-[#d4af37]" /><span>{d.participants} applicant{d.participants === 1 ? "" : "s"} so far</span><span className="w-1 h-1 rounded-full bg-[#d4af37]" /><span>{d.winners.length} of {c.winner_count} Brand Models chosen</span>
            </div>
            {!d.eligible && <div className="mt-4 inline-block rounded-xl bg-amber-500/15 border border-amber-400/40 px-4 py-2 text-xs text-amber-200" data-testid="rewards-not-live">{d.live ? "This salon isn't part of the casting yet." : "Casting isn't open right now — check back soon."}</div>}
            <div className="mt-7 flex gap-3 flex-wrap">
              <a href="#apply" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] font-bold text-sm shadow-[0_10px_30px_-10px_rgba(212,175,55,.8)]" data-testid="rewards-hero-apply">Apply now <Sparkles className="w-4 h-4" /></a>
              <a href="#models" className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-white/20 text-white text-sm hover:border-[#d4af37]/60" data-testid="rewards-hero-models">Meet the models</a>
            </div>
          </div>
          <div className="relative hidden sm:block" data-testid="rewards-hero-visual">
            <div className="absolute -inset-6 rounded-[2.5rem] bg-[#d4af37]/10 blur-2xl" />
            <div className="relative aspect-[4/5] max-h-[520px] mx-auto rounded-[2rem] overflow-hidden ring-1 ring-[#d4af37]/50 shadow-[0_30px_80px_-20px_rgba(212,175,55,.45)]">
              <img src={d.winners[0]?.photo_url ? `${API}${d.winners[0].photo_url}` : "/brand-model-hero.jpg"} alt="Brand model" className="w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/85 to-transparent">
                <div className="text-[10px] tracking-[0.3em] uppercase text-[#F0D9A5]">{d.winners[0]?.photo_url ? `${d.winners[0].name} · ${d.winners[0].winner_tier} Brand Model` : "Next face could be yours"}</div>
                <div className="font-playfair text-xl">Your style. Your story. Your moment.</div>
              </div>
              <div className="absolute top-4 right-4 rounded-full bg-black/50 backdrop-blur px-3 py-1.5 text-[11px] border border-[#d4af37]/50 inline-flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-[#d4af37]" /> Win a Diamond Membership</div>
            </div>
          </div>
        </div>
      </div>

      {/* MODELS */}
      <section id="models" className="relative max-w-6xl mx-auto px-5 py-16" data-testid="rewards-top10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(212,175,55,.6),transparent)]" />
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] tracking-[0.35em] uppercase text-[#d4af37]">The faces of {d.salon.name.split(" ")[0]}</div>
            <h2 className="font-playfair text-3xl sm:text-4xl text-white mt-2">Meet our Brand Models</h2>
            <p className="text-sm text-white/55 mt-1">Your style. Your story. Your moment. {c.winner_count} models, chosen from every applicant this season.</p>
          </div>
          <div className="text-xs text-white/50">{d.winners.length} chosen · {openSlots} spot{openSlots === 1 ? "" : "s"} open</div>
        </div>
        <div className="mt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {d.winners.map((w, i) => <ModelCard key={i} w={w} i={i} />)}
          {Array.from({ length: openSlots }).map((_, k) => <OpenSlot key={k} n={d.winners.length + k + 1} />)}
        </div>
      </section>

      <VoteGallery slug={slug} phone={phone} live={d.eligible} salon={d.salon.name} highlight={sp.get("vote")} />

      <div className="max-w-6xl mx-auto px-5 pb-10 grid lg:grid-cols-[1.2fr_1fr] gap-8">
        <div className="space-y-12">
          <section>
            <h2 className="text-base md:text-lg font-semibold text-[#d4af37] tracking-wide">What our Brand Models win</h2>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {c.rewards.map((r, i) => <div key={r.tier} className={`rounded-2xl border p-4 text-center ${i === 0 ? "border-[#d4af37]/60 bg-gradient-to-b from-[#d4af37]/15 to-transparent" : "bg-[#15151b]/70 backdrop-blur border-white/10"}`}><div className="text-2xl">{r.emoji}</div><div className="text-sm font-semibold mt-1">{r.tier}</div><div className="text-[11px] text-white/50">Membership · {r.winners} model{r.winners === 1 ? "" : "s"}</div></div>)}
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center"><div className="text-2xl">📸</div><div className="text-sm font-semibold mt-1">Featured</div><div className="text-[11px] text-white/50">on the salon page & Miracurl</div></div>
            </div>
          </section>
          <section id="journey">
            <h2 className="text-base md:text-lg font-semibold text-[#d4af37] tracking-wide">The casting journey</h2>
            <ol className="mt-4 grid sm:grid-cols-2 gap-3">
              {STEPS.map(([n, t, s]) => <li key={t} className="flex gap-3 rounded-2xl bg-[#15151b]/70 backdrop-blur border border-white/10 hover:border-[#d4af37]/40 transition-colors p-4"><span className="font-playfair text-2xl text-[#d4af37]/80 leading-none">{n}</span><div><div className="text-sm font-semibold">{t}</div><div className="text-[12.5px] text-white/60 mt-0.5">{t === "Spend the minimum" ? `Complete an eligible transaction of ${min} or more.` : s}</div></div></li>)}
            </ol>
          </section>
          <section>
            <h2 className="text-base md:text-lg font-semibold text-[#d4af37] tracking-wide">Ways to earn entries</h2>
            <table className="mt-3 w-full text-sm" data-testid="rewards-entry-table"><tbody>
              {c.entry_rules.map(r => <tr key={r.key} className="border-t border-white/10"><td className="py-2 text-white/80">{r.label}</td><td className="py-2 text-right font-bold text-[#d4af37]">+{r.entries}</td></tr>)}
            </tbody></table>
          </section>
          <Events events={c.events || []} />
          <section className="text-[11px] text-white/45 leading-relaxed" data-testid="rewards-terms"><b className="text-white/60">Terms:</b> {c.terms}</section>
        </div>
        <aside id="apply" className="lg:sticky lg:top-24 self-start space-y-4">
          {phone ? <MyEntries slug={slug} phone={phone} salon={d.salon.name} /> : (
            <div className="rounded-3xl border border-[#d4af37]/40 bg-[#15151b]/80 backdrop-blur-xl p-6 shadow-[0_30px_80px_-30px_rgba(212,175,55,.35)]">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#d4af37]">Casting call</div>
              <h3 className="font-playfair text-2xl mt-2">Apply to be our Brand Model</h3>
              <p className="text-[12.5px] text-white/60 mt-1 mb-4">Takes 20 seconds. We'll email you the casting details.</p>
              {d.eligible ? <JoinForm slug={slug} refCode={sp.get("ref")} onJoined={joined} /> : <p className="text-xs text-white/50">Applications open when the casting is live.</p>}
            </div>
          )}
          {phone && <button onClick={() => { localStorage.removeItem(`rewards_phone_${slug}`); setPhone(""); }} className="text-[11px] text-white/40 hover:text-white/70" data-testid="rewards-switch">Not you? Apply with another number</button>}
        </aside>
      </div>

      <SiteFooter salon={d.salon} slug={slug} platformLogo={platformLogo} />
      </div>
    </div>
  );
}
