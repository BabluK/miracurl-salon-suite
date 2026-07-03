import { useState } from "react";
import api, { API } from "@/lib/api";
import { Search, ShieldCheck, Star, Building2, FileDown, Phone, Mail, MapPin, Fingerprint } from "lucide-react";

const BADGE_DARK = {
  EXTRAORDINARY: "bg-violet-500/15 text-violet-300 border-violet-400/40",
  EXCELLENT: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40",
  GOOD: "bg-sky-500/15 text-sky-300 border-sky-400/40",
  NEW: "bg-white/10 text-slate-300 border-white/20",
  BAD: "bg-red-500/15 text-red-300 border-red-400/40",
};

const BADGE_LABEL = {
  EXTRAORDINARY: "Extraordinary 🏆", EXCELLENT: "Excellent 🌟", GOOD: "Good ⭐",
  NEW: "New — building history", BAD: "Poor track record ❌",
};

export default function RegistryPublic() {
  const [q, setQ] = useState("");
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function search(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true); setError(""); setProfile(null);
    try {
      const { data } = await api.get(`/public/registry/search?q=${encodeURIComponent(q.trim())}`);
      setProfile(data);
    } catch (err) {
      setError(err.response?.status === 404 ? "No staff found with that ID or phone number." : "Search failed — please try again in a moment.");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-[#0b0b0e] text-slate-100" data-testid="registry-public-page">
      {/* Hero */}
      <div className="border-b border-white/10 bg-gradient-to-b from-violet-950/40 to-transparent">
        <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/20 border border-violet-400/30 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-violet-300" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-violet-300/80">Miracurl Registry</div>
              <h1 className="font-playfair text-2xl sm:text-4xl">Staff Verification Portal</h1>
            </div>
          </div>
          <p className="text-slate-400 text-sm max-w-xl">
            Verify a salon professional's employment history, service duration and reputation badge before you hire.
            Staff members can also download their official badge report here.
          </p>
          <form onSubmit={search} className="mt-8 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                data-testid="public-registry-search-input"
                value={q} onChange={e => setQ(e.target.value)}
                placeholder="Enter Staff ID (e.g. STF-00001) or phone number"
                className="w-full bg-white/5 border border-white/15 rounded-xl pl-10 pr-4 py-3 text-sm placeholder:text-slate-500 focus:outline-none focus:border-violet-400/60 focus:bg-white/10 transition"
              />
            </div>
            <button data-testid="public-registry-search-btn" disabled={loading} className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition disabled:opacity-50">
              {loading ? "Searching…" : "Verify"}
            </button>
          </form>
          {error && <div data-testid="public-registry-error" className="mt-4 text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-xl px-4 py-3">{error}</div>}
        </div>
      </div>

      {/* Result */}
      {profile && (
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-5" data-testid="public-registry-result">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row gap-5">
              <img
                src={profile.photo_url || "https://ui-avatars.com/api/?background=2e1065&color=c4b5fd&size=160&name=" + encodeURIComponent(profile.name)}
                alt={profile.name}
                className="w-24 h-24 rounded-2xl object-cover border-2 border-violet-400/40"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="font-playfair text-2xl" data-testid="public-registry-name">{profile.name}</h2>
                  <span className={`text-xs uppercase tracking-wider font-semibold px-3 py-1 rounded-full border ${BADGE_DARK[profile.badge]}`} data-testid="public-registry-badge">
                    {BADGE_LABEL[profile.badge] || profile.badge}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {profile.avg_rating != null ? (
                    <>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map(n => <Star key={n} className={`w-4 h-4 ${n <= Math.round(profile.avg_rating) ? "fill-amber-400 text-amber-400" : "text-white/20"}`} />)}
                      </div>
                      <span className="text-sm text-amber-300 font-semibold">{profile.avg_rating} / 5</span>
                    </>
                  ) : <span className="text-xs text-slate-500">Not yet rated by any salon</span>}
                  <span className="text-xs text-slate-400 ml-2">· <b className="text-slate-200">{profile.total_years} yrs</b> total service</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-4 text-xs text-slate-400">
                  <div className="flex items-center gap-2"><Fingerprint className="w-3.5 h-3.5 text-violet-400" /> ID: <span className="font-mono text-slate-200">{profile.staff_code}</span> · Aadhaar {profile.aadhaar_masked}</div>
                  <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-violet-400" /> +{profile.phone}</div>
                  {profile.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-violet-400" /> {profile.email}</div>}
                  <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-violet-400" /> {profile.permanent_address}{profile.city && `, ${profile.city}`}</div>
                </div>
              </div>
            </div>
            <a
              data-testid="public-registry-pdf-btn"
              href={`${API}/public/registry/${profile.staff_code}/pdf`}
              className="mt-5 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-slate-900 text-sm font-semibold hover:bg-slate-200 transition"
            >
              <FileDown className="w-4 h-4" /> Download Badge Report (PDF)
            </a>
          </div>

          {/* History */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-sm uppercase tracking-[0.2em] text-slate-400 mb-4">Employment History</h3>
            {profile.employments.length === 0 && <div className="text-sm text-slate-500">No employment records yet.</div>}
            <div className="space-y-4">
              {profile.employments.map(e => (
                <div key={e.id} className="border-l-2 border-violet-500/40 pl-4" data-testid={`public-registry-employment-${e.id}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Building2 className="w-4 h-4 text-violet-300" />
                    <span className="font-semibold text-sm">{e.salon_name}</span>
                    <span className="text-xs text-slate-400">— {e.designation}</span>
                    {e.rating && <span className="inline-flex items-center gap-0.5 text-xs text-amber-300"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{e.rating}/5</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {e.from_date} → {e.to_date || "Present"} <span className="text-slate-300">({e.years} yrs)</span>
                    {e.reason_for_leaving && ` · ${e.reason_for_leaving}`}
                  </div>
                  {(e.skills || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {e.skills.map(s => <span key={s} className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full text-slate-300">{s}</span>)}
                    </div>
                  )}
                  {e.comment && <p className="text-xs text-slate-400 italic mt-1.5">“{e.comment}”</p>}
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-slate-600 text-center pb-8">Badges are auto-computed from verified service duration and salon-owner ratings. Aadhaar numbers are never stored or shown in full.</p>
        </div>
      )}
    </div>
  );
}
