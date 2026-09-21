import { useEffect, useState } from "react";
import api, { API } from "@/lib/api";
import { Search, ShieldCheck, Star, Building2, FileDown, Phone, Mail, MapPin, Fingerprint, Lock, UserCheck, FileSignature, EyeOff } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import SalesChatWidget from "@/components/SalesChatWidget";

const gradBtn = "bg-gradient-to-r from-rose-400 via-pink-500 to-amber-500 hover:from-rose-500 hover:via-pink-600 hover:to-amber-600 text-white";

const BADGE_DARK = {
  EXTRAORDINARY: "bg-violet-50 text-violet-700 border-violet-200",
  EXCELLENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  GOOD: "bg-sky-50 text-sky-700 border-sky-200",
  NEW: "bg-slate-100 text-slate-600 border-slate-200",
  BAD: "bg-red-50 text-red-700 border-red-200",
};

const BADGE_LABEL = {
  EXTRAORDINARY: "Extraordinary 🏆", EXCELLENT: "Excellent 🌟", GOOD: "Good ⭐",
  NEW: "New — building history", BAD: "Poor track record ❌",
};

function DisputeLink({ profile }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: profile?.name || "", phone: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("staff_code", profile?.staff_code || "");
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      await api.post("/public/registry/dispute", fd);
      setSent(true);
    } catch (err) { alert(err.response?.data?.detail || "Couldn't send — please try again."); }
    finally { setBusy(false); }
  };
  if (sent) return <div className="text-[11px] font-semibold mt-1.5" data-testid="dispute-sent">✓ Appeal sent to Miracurl HQ — we'll review it and contact you.</div>;
  return (
    <div className="mt-1.5">
      <button onClick={() => setOpen(o => !o)} data-testid="dispute-link"
        className="text-[11px] underline underline-offset-2 font-semibold opacity-90 hover:opacity-100">
        Is this you and you believe this mark is wrong? Dispute it with Miracurl HQ →
      </button>
      {open && (
        <form onSubmit={submit} className="mt-2 grid gap-1.5 bg-white/10 rounded-lg p-2.5" data-testid="dispute-form">
          <input required minLength={2} maxLength={80} value={f.name} onChange={e => setF(v => ({ ...v, name: e.target.value }))}
            placeholder="Your full name *" data-testid="dispute-name" className="bg-white/90 text-slate-800 text-xs rounded-md px-2.5 py-1.5 placeholder:text-slate-400" />
          <input maxLength={18} value={f.phone} onChange={e => setF(v => ({ ...v, phone: e.target.value }))}
            placeholder="Phone (so we can call you back)" data-testid="dispute-phone" className="bg-white/90 text-slate-800 text-xs rounded-md px-2.5 py-1.5 placeholder:text-slate-400" />
          <textarea required minLength={10} maxLength={2000} rows={2} value={f.message} onChange={e => setF(v => ({ ...v, message: e.target.value }))}
            placeholder="Why is this termination mark wrong? *" data-testid="dispute-message" className="bg-white/90 text-slate-800 text-xs rounded-md px-2.5 py-1.5 placeholder:text-slate-400" />
          <button disabled={busy} data-testid="dispute-submit"
            className="bg-white text-red-600 text-xs font-bold rounded-md py-1.5 hover:bg-red-50 disabled:opacity-60">
            {busy ? "Sending…" : "Send appeal to Miracurl HQ"}
          </button>
        </form>
      )}
    </div>
  );
}

function GetVerifiedCard() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", email: "", salon_name: "", city: "", owner_phone: "", joining: "", experience: "" });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));
  const inputCls = "w-full bg-white border border-rose-200 rounded-xl px-4 py-2.5 text-base sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-pink-400";

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { alert("Photo must be under 3 MB"); e.target.value = ""; return; }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!photo) { alert("Please upload your recent photo — it appears on your verified badge."); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      fd.append("photo", photo);
      await api.post("/public/registry/get-verified", fd);
      setSent(true);
    } catch (err) {
      alert(err.response?.data?.detail || "Couldn't send — please try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl bg-gradient-to-r from-rose-50 via-pink-50 to-amber-50 ring-1 ring-pink-100 p-6 sm:p-7">
      {sent ? (
        <div className="text-center py-2" data-testid="get-verified-success">
          <div className="text-2xl">🎉</div>
          <h3 className="font-playfair text-lg text-slate-900 mt-1">Request received, {f.name.split(" ")[0]}!</h3>
          <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto">Our team will call you and your salon to verify your joining date & tenure — then your official <b>verified badge PDF</b> lands in your email inbox ✦</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <h3 className="font-playfair text-lg sm:text-xl text-slate-900">Not on Miracurl yet? Get your verified badge ✦</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Your badge is a career passport — verified experience, ratings and history that travel with you to any salon.
                Tell us where you work and we'll set it up with your salon.
              </p>
            </div>
            {!open && (
              <button onClick={() => setOpen(true)} data-testid="get-verified-cta"
                className={`${gradBtn} text-sm font-bold px-6 py-3 rounded-full whitespace-nowrap shadow-[0_10px_25px_-8px_rgba(236,72,153,0.5)]`}>
                Get verified →
              </button>
            )}
          </div>
          {open && (
            <form onSubmit={submit} className="grid sm:grid-cols-2 gap-2.5 mt-4" data-testid="get-verified-form">
              <input required minLength={2} maxLength={80} value={f.name} onChange={set("name")} placeholder="Your name *" data-testid="get-verified-name" className={inputCls} />
              <input required minLength={8} maxLength={20} value={f.phone} onChange={set("phone")} placeholder="Phone / WhatsApp *" data-testid="get-verified-phone" className={inputCls} />
              <input required type="email" maxLength={120} value={f.email} onChange={set("email")} placeholder="Email * (your badge PDF comes here)" data-testid="get-verified-email" className={inputCls} />
              <input maxLength={100} value={f.salon_name} onChange={set("salon_name")} placeholder="Salon where you work" data-testid="get-verified-salon" className={inputCls} />
              <input maxLength={60} value={f.city} onChange={set("city")} placeholder="City" data-testid="get-verified-city" className={inputCls} />
              <input maxLength={20} value={f.owner_phone} onChange={set("owner_phone")} placeholder="Salon owner / manager phone (for verification call)" data-testid="get-verified-owner-phone" className={inputCls} />
              <input type="email" maxLength={120} value={f.owner_email} onChange={set("owner_email")} placeholder="Salon owner / manager email (they rate you in 1 click)" data-testid="get-verified-owner-email" className={inputCls} />
              <input maxLength={30} value={f.joining} onChange={set("joining")} placeholder="When did you join? (e.g. March 2023)" data-testid="get-verified-joining" className={inputCls} />
              <input maxLength={60} value={f.experience} onChange={set("experience")} placeholder="Total experience (e.g. 5 years)" data-testid="get-verified-experience" className={inputCls} />
              <div className="sm:col-span-2 flex items-center gap-3 bg-white border border-rose-200 rounded-xl px-4 py-2.5" data-testid="get-verified-photo-row">
                {preview ? (
                  <img src={preview} alt="Your photo" className="w-12 h-12 rounded-full object-cover border-2 border-pink-300 shrink-0" data-testid="get-verified-photo-preview" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-rose-50 border border-dashed border-rose-300 flex items-center justify-center text-pink-400 text-lg shrink-0">📷</div>
                )}
                <div className="flex-1 min-w-0">
                  <label htmlFor="get-verified-photo" className="text-xs font-semibold text-slate-700 cursor-pointer">
                    Recent photo * <span className="text-slate-400 font-normal">(appears on your verified badge · JPG/PNG, max 3 MB)</span>
                  </label>
                  <input id="get-verified-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} data-testid="get-verified-photo"
                    className="block w-full text-xs text-slate-500 bg-transparent mt-1 file:mr-3 file:px-3 file:py-1.5 file:rounded-full file:border-0 file:bg-pink-100 file:text-pink-700 file:text-xs file:font-semibold hover:file:bg-pink-200 file:cursor-pointer" style={{ background: "transparent" }} />
                </div>
              </div>
              <p className="sm:col-span-2 text-[10px] text-slate-400 -mt-1">Our team calls your salon owner/manager to confirm your joining date and tenure — then your official verified badge PDF is emailed to you. ✦</p>
              <button disabled={busy} data-testid="get-verified-submit"
                className={`sm:col-span-2 ${gradBtn} text-sm font-bold py-3 rounded-full disabled:opacity-50`}>
                {busy ? "Sending…" : "Request my verified badge ✦"}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

const CONSENT_POINTS = [
  { icon: FileSignature, title: "Consent-first, always", text: "Every professional on this registry joined voluntarily. Staff share their details (name, phone, Aadhaar, address, work history) with their employer and give explicit written consent — recorded at onboarding — for Miracurl to verify and display their professional profile." },
  { icon: UserCheck, title: "Why verification matters", text: "Salons hire faster and safer when a professional's employment history, service duration and ratings are verified. Staff benefit too — a verified badge is a portable career passport that travels with them from salon to salon." },
  { icon: EyeOff, title: "Privacy by design", text: "Aadhaar numbers are used only to match identity — they are never stored or displayed in full (always masked, e.g. XXXX-XXXX-1234). Only employment-related information appears here; nothing else is shared." },
  { icon: Lock, title: "Your data, your rights", text: "In line with India's Digital Personal Data Protection Act (DPDP, 2023), staff may review, correct, or withdraw consent at any time by contacting their salon or privacy@miracurl-suite.com — their profile is then removed from public search." },
];

export default function RegistryPublic() {
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isStaffId = /^stf-?\d*/i.test(q.trim());
  const qDigits = q.replace(/\D/g, "");
  const looksAadhaar = qDigits.length === 12 && !qDigits.startsWith("91");
  const needsName = isStaffId || (qDigits.length >= 10 && !looksAadhaar);

  async function runSearch(qv, nv) {
    setLoading(true); setError(""); setProfile(null);
    try {
      const { data } = await api.get(`/public/registry/search?q=${encodeURIComponent(qv.trim())}&name=${encodeURIComponent((nv || "").trim())}`);
      setProfile(data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        err.response?.status === 400 && typeof detail === "string" ? detail
          : err.response?.status === 404 ? "No staff found with that ID or phone number."
            : "Search failed — please try again in a moment.");
    } finally { setLoading(false); }
  }

  async function search(e) {
    e.preventDefault();
    if (!q.trim()) return;
    if (needsName && !name.trim()) {
      setError("Almost there — type the staff member's name (as printed on the badge) in the box below, then tap Verify.");
      document.querySelector('[data-testid="public-registry-name-input"]')?.focus();
      return;
    }
    runSearch(q, name);
  }

  // Deep-link support (?q=<phone|STF-id>&name=…) — used by the ID-card QR code.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const qq = (sp.get("q") || "").trim();
    if (qq) {
      setQ(qq);
      setName(sp.get("name") || "");
      runSearch(qq, sp.get("name") || "");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen relative overflow-hidden bg-white text-slate-800" data-testid="registry-public-page">
      {/* Locked golden-white header with the Miracurl Suite logo */}
      <SiteHeader variant="light" />
      <SalesChatWidget />
      {/* Rose-gold brand blobs — same language as login & demo pages */}
      <div className="pointer-events-none absolute -right-32 -top-40 w-[520px] h-[520px] rounded-full opacity-50"
        style={{ background: "radial-gradient(circle at 30% 30%, #e8918f 0%, #d4af37 40%, #ec4899 75%, transparent 100%)" }} />
      <div className="pointer-events-none absolute -left-44 -bottom-44 w-[560px] h-[560px] rounded-full opacity-40"
        style={{ background: "radial-gradient(circle at 60% 40%, #f5d78e 0%, #e8a0a8 45%, #d4af37 80%, transparent 100%)" }} />

      {/* Hero */}
      <div className="relative z-10 border-b border-rose-100/80 bg-gradient-to-b from-rose-50/70 to-transparent">
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-12 sm:pb-14">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-400 via-pink-500 to-amber-500 flex items-center justify-center shadow-[0_10px_25px_-8px_rgba(236,72,153,0.5)]">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-pink-500 font-semibold">Miracurl Registry</div>
              <h1 className="font-playfair text-2xl sm:text-4xl text-slate-900">Staff Verification Portal</h1>
            </div>
          </div>
          <p className="text-slate-500 text-sm max-w-xl">
            Verify a salon professional's employment history, service duration and reputation badge before you hire.
            Staff members can also download their official badge report here.
          </p>

          {/* Badge showcase */}
          <div className="flex flex-wrap gap-2 mt-4" data-testid="registry-badge-showcase">
            {["EXTRAORDINARY", "EXCELLENT", "GOOD", "NEW"].map(b => (
              <span key={b} className={`text-[11px] uppercase tracking-wider font-semibold px-3 py-1 rounded-full border ${BADGE_DARK[b]}`}>
                {BADGE_LABEL[b]}
              </span>
            ))}
          </div>

          <form onSubmit={search} className="mt-7 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  data-testid="public-registry-search-input"
                  value={q} onChange={e => setQ(e.target.value)}
                  placeholder="Enter Aadhaar (12 digits), phone number or Staff ID (STF-00001)"
                  className="w-full bg-white border border-rose-200 rounded-xl pl-10 pr-4 py-3 text-base sm:text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:border-pink-400 transition"
                />
              </div>
              <button data-testid="public-registry-search-btn" disabled={loading} className={`px-6 py-3 rounded-xl ${gradBtn} text-sm font-semibold transition disabled:opacity-50 shadow-[0_10px_25px_-8px_rgba(236,72,153,0.5)]`}>
                {loading ? "Searching…" : "Verify"}
              </button>
            </div>
            {needsName && (
              <input
                data-testid="public-registry-name-input"
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Staff member's name as printed on the badge (required for Staff ID & phone search)"
                className="w-full bg-white border border-rose-200 rounded-xl px-4 py-3 text-base sm:text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:border-pink-400 transition"
              />
            )}
          </form>
          {error && <div data-testid="public-registry-error" className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}
          <p className="mt-3 text-[11px] text-slate-400">
            Search by <b className="text-slate-600">Aadhaar (12 digits)</b> or <b className="text-slate-600">phone</b> → full employment history. Search by <b className="text-slate-600">Staff ID</b> → current organization only.
          </p>
        </div>
      </div>

      {/* Result */}
      {profile && (
        <div className="relative z-10 max-w-3xl mx-auto px-4 py-8 space-y-5" data-testid="public-registry-result">
          <div className="bg-white ring-1 ring-slate-100 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.15)] rounded-2xl p-6">
            {profile.terminated && (
              <div data-testid="terminated-warning-banner"
                className="mb-4 rounded-xl px-4 py-3 bg-red-600 text-white flex items-center gap-3 shadow-[0_10px_30px_-10px_rgba(220,38,38,0.6)]">
                <span className="text-2xl animate-pulse">⚠</span>
                <div>
                  <div className="text-sm font-black uppercase tracking-widest">
                    {profile.terminated_labels?.join(" / ") || "Terminated"} by a previous employer
                  </div>
                  <div className="text-[11px] opacity-90 mt-0.5">
                    This staff member's record shows a termination reported by a past salon. Check the employment history below and take strong references before hiring.
                  </div>
                  <DisputeLink profile={profile} />
                </div>
              </div>
            )}
            {profile.hire_verdict && (
              <div
                data-testid="hire-verdict-banner"
                className={`mb-5 flex items-center gap-3 rounded-xl px-4 py-3 border ${
                  profile.hire_verdict === "green" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : profile.hire_verdict === "red" ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-amber-50 border-amber-200 text-amber-700"}`}
              >
                <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${
                  profile.hire_verdict === "green" ? "bg-emerald-500" : profile.hire_verdict === "red" ? "bg-red-500" : "bg-amber-500"} ${profile.hire_verdict !== "red" ? "" : "animate-pulse"}`} />
                <div>
                  <div className="text-sm font-bold uppercase tracking-wider">
                    {profile.hire_verdict === "green" ? "Safe to hire" : profile.hire_verdict === "red" ? "Hire with caution" : "Verify references"}
                  </div>
                  <div className="text-xs opacity-90 mt-0.5">{profile.hire_verdict_note}</div>
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-5">
              <img
                src={profile.photo_url || "https://ui-avatars.com/api/?background=fdf2f8&color=db2777&size=160&name=" + encodeURIComponent(profile.name)}
                alt={profile.name}
                className="w-24 h-24 rounded-2xl object-cover border-2 border-pink-200"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="font-playfair text-2xl text-slate-900" data-testid="public-registry-name">{profile.name}</h2>
                  <span className={`text-xs uppercase tracking-wider font-semibold px-3 py-1 rounded-full border ${BADGE_DARK[profile.badge]}`} data-testid="public-registry-badge">
                    {BADGE_LABEL[profile.badge] || profile.badge}
                  </span>
                  {profile.hq_verified && (
                    <span data-testid="public-hq-verified-badge" className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-bold px-3 py-1 rounded-full bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-700 border border-amber-300">
                      ✦ HQ Verified
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {profile.avg_rating != null ? (
                    <>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map(n => <Star key={n} className={`w-4 h-4 ${n <= Math.round(profile.avg_rating) ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />)}
                      </div>
                      <span className="text-sm text-amber-600 font-semibold">{profile.avg_rating} / 5</span>
                    </>
                  ) : <span className="text-xs text-slate-400">Not yet rated by any salon</span>}
                  <span className="text-xs text-slate-500 ml-2">· <b className="text-slate-700">{profile.total_years} yrs</b> total service</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-4 text-xs text-slate-500">
                  <div className="flex items-center gap-2"><Fingerprint className="w-3.5 h-3.5 text-pink-500" /> ID: <span className="font-mono text-slate-700">{profile.staff_code}</span> · Aadhaar {profile.aadhaar_masked}</div>
                  <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-pink-500" /> +{profile.phone}</div>
                  {profile.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-pink-500" /> {profile.email}</div>}
                  <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-pink-500" /> Permanent: {profile.permanent_address}{profile.city && `, ${profile.city}`}</div>
                  {profile.current_address && <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-pink-500" /> Current: {profile.current_address}</div>}
                </div>
              </div>
            </div>
            <a
              data-testid="public-registry-pdf-btn"
              href={`${API}/public/registry/${profile.staff_code}/pdf?name=${encodeURIComponent(profile.name || "")}`}
              className={`mt-5 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl ${gradBtn} text-sm font-semibold transition`}
            >
              <FileDown className="w-4 h-4" /> Download Badge Report (PDF)
            </a>
          </div>

          {/* History */}
          <div className="bg-white ring-1 ring-slate-100 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.15)] rounded-2xl p-6">
            <h3 className="text-sm uppercase tracking-[0.2em] text-slate-500 mb-4">Employment History</h3>
            {profile.history_scope === "current" && (
              <div data-testid="registry-scope-note" className="mb-4 text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
                Searched by Staff ID — showing the <b>current organization</b> only. Search by phone number to view the full past history.
              </div>
            )}
            {profile.employments.length === 0 && <div className="text-sm text-slate-400">No employment records yet.</div>}
            {[
              { title: "Current Organization", items: profile.employments.filter(e => !e.to_date) },
              { title: "Past Organizations", items: profile.employments.filter(e => e.to_date) },
            ].map(group => group.items.length > 0 && (
              <div key={group.title} className="mb-6 last:mb-0" data-testid={`registry-group-${group.title.split(" ")[0].toLowerCase()}`}>
                <div className="text-[11px] uppercase tracking-[0.18em] text-pink-500 font-semibold mb-3">{group.title}</div>
                <div className="space-y-4">
                  {group.items.map(e => (
                    <div key={e.id} className="border-l-2 border-pink-300 pl-4" data-testid={`public-registry-employment-${e.id}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Building2 className="w-4 h-4 text-pink-500" />
                        <span className="font-semibold text-sm text-slate-800">{e.salon_name}</span>
                        <span className="text-xs text-slate-500">— {e.designation}</span>
                        {e.hq_verified && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-300">✦ HQ Verified</span>
                        )}
                        {!e.to_date ? (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Currently Working
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                            Left{e.reason_for_leaving ? ` · ${e.reason_for_leaving}` : ""}
                          </span>
                        )}
                        {e.rating && <span className="inline-flex items-center gap-0.5 text-xs text-amber-600"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{e.rating}/5</span>}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {e.from_date} → {e.to_date || "Present"} · Duration: <span className="text-slate-700 font-semibold">{e.years} yrs</span>
                      </div>
                      {(e.skills || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {e.skills.map(s => <span key={s} className="text-[10px] bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full text-slate-600">{s}</span>)}
                        </div>
                      )}
                      {e.comment && <p className="text-xs text-slate-500 italic mt-1.5">“{e.comment}”</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Get verified CTA — for stylists not yet on Miracurl */}
      <div className="relative z-10 max-w-3xl mx-auto px-4 pt-2" data-testid="registry-get-verified-section">
        <GetVerifiedCard />
      </div>

      {/* Consent & legal — always visible */}
      <div className="relative z-10 max-w-3xl mx-auto px-4 py-10" data-testid="registry-consent-section">
        <div className="text-center mb-6">
          <h2 className="font-playfair text-xl sm:text-2xl text-slate-900">Verification with consent — done right ✦</h2>
          <p className="text-xs text-slate-500 mt-1.5 max-w-lg mx-auto">Every profile on this registry exists because the professional chose to be verified. Here's exactly how it works and why it's fair to everyone.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {CONSENT_POINTS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="bg-white ring-1 ring-slate-100 shadow-sm rounded-2xl p-5" data-testid={`consent-card-${title.split(" ")[0].toLowerCase().replace(",", "")}`}>
              <div className="w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center mb-3">
                <Icon className="w-4.5 h-4.5 w-5 h-5 text-pink-500" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">{title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed mt-1.5">{text}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 text-center mt-8 max-w-xl mx-auto leading-relaxed">
          Badges are auto-computed from verified service duration and salon-owner ratings. Aadhaar numbers are never stored or shown in full.
          By using this portal you agree to use the information solely for employment verification. Miracurl processes this data as a consent-based
          service under the Digital Personal Data Protection Act, 2023. Questions or consent withdrawal: <a href="mailto:privacy@miracurl-suite.com" className="text-pink-500 underline">privacy@miracurl-suite.com</a> · <a href="/privacy-policy" className="underline hover:text-slate-600">Privacy Policy</a> · <a href="/terms-of-service" className="underline hover:text-slate-600">Terms</a>
        </p>
      </div>
    </div>
  );
}
