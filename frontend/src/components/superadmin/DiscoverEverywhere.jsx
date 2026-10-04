import { useEffect, useState } from "react";
import { Globe, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const ICON = { google: "📍", instagram: "📸", facebook: "📘", linkedin: "💼", web: "🌐", email: "✉️" };

// Step 1b — Mira hunts beyond Google Maps: Instagram, Facebook, LinkedIn, directories, email footprints.
export function DiscoverEverywhere({ city, vertical, onDone }) {
  const [sources, setSources] = useState([]);
  const [picked, setPicked] = useState(["google", "instagram", "facebook", "linkedin", "web", "email"]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  useEffect(() => { api.get("/super-admin/mira-leads/discover/sources").then(r => setSources(r.data.sources)).catch(() => {}); }, []);
  const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const run = async () => {
    if (!city?.trim()) { toast.error("Type a city first"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/super-admin/mira-leads/discover", { vertical, city: city.trim(), sources: picked, limit: 15 });
      setLast(data);
      toast.success(data.saved ? `Mira found ${data.saved} new ${vertical} lead${data.saved === 1 ? "" : "s"} in ${city} beyond Google Maps ✦` : (data.note || "Nothing new this time — everything found was already in your list"));
      onDone?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Discovery failed"); } finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid="lead-discover-panel">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-full bg-[#b8932e] text-white text-[11px] font-bold inline-flex items-center justify-center"><Globe className="w-3.5 h-3.5" /></span>
        <h2 className="text-base font-semibold text-slate-800">Find leads everywhere</h2>
        <span className="text-xs text-slate-400">Mira also scans social & web — anything new lands in Review leads with its source badge</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {sources.map(s => (
          <button key={s.id} type="button" onClick={() => toggle(s.id)} data-testid={`discover-source-${s.id}`} aria-pressed={picked.includes(s.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${picked.includes(s.id) ? "bg-[#fdf8ec] border-[#d4af37] text-[#8a6d1f]" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"}`}>
            {ICON[s.id]} {s.label}
          </button>
        ))}
        <button onClick={run} disabled={busy || picked.length === 0} data-testid="discover-run-btn"
          className="ml-auto px-5 py-2.5 rounded-xl bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#1a1408] text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {busy ? "Mira is hunting…" : `Find ${vertical === "restaurant" ? "restaurants" : "salons"} everywhere ✦`}
        </button>
      </div>
      {last && (
        <p className="text-xs text-slate-500 mt-3" data-testid="discover-result">
          Last hunt: <b>{last.saved}</b> new of {last.found} found · {Object.entries(last.per_source || {}).map(([k, v]) => `${ICON[k]} ${v}`).join(" · ")}
        </p>
      )}
    </div>
  );
}
