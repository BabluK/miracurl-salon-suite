import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { ImagePlus, Loader2, Download, Sparkles } from "lucide-react";

const SIZES = [["square", "Square 1:1", "Feed post"], ["story", "Story 2:3", "Story / Reel cover"], ["wide", "Wide 3:2", "Banner / site"]];

export const PromoImageStudio = () => {
  const [topic, setTopic] = useState("The complete Miracurl Salon Suite — everything a salon needs, powered by AI");
  const [size, setSize] = useState("square");
  const [busy, setBusy] = useState(false);
  const [posters, setPosters] = useState([]);

  const load = () => { api.get("/super/promo-images").then(r => setPosters(r.data.posters)).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      await api.post("/super/promo-image", { topic, size });
      toast.success("Poster ready! ✦");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Generation failed — try again");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" data-testid="promo-image-studio">
      <div>
        <h1 className="font-playfair text-3xl flex items-center gap-2"><ImagePlus className="w-6 h-6 text-fuchsia-500" /> AI Poster Studio</h1>
        <p className="text-slate-500 text-sm mt-1">Mira generates promo posters about your software — AI visual + marketing copy + your rose-gold logo, ready to post.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 max-w-2xl">
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-1.5">What should the poster promote?</p>
          <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={2} data-testid="poster-topic-input"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-1.5">Poster size</p>
          <div className="flex gap-2">
            {SIZES.map(([id, label, hint]) => (
              <button key={id} data-testid={`poster-size-${id}`} onClick={() => setSize(id)}
                className={`text-xs px-3 py-2 rounded-xl border font-medium text-left ${size === id ? "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700" : "border-slate-200 text-slate-500"}`}>
                <span className="block">{label}</span>
                <span className="block text-[10px] opacity-70">{hint}</span>
              </button>
            ))}
          </div>
        </div>
        <button onClick={generate} disabled={busy || !topic.trim()} data-testid="poster-generate-btn"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white text-sm font-semibold disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busy ? "Mira is designing… (~30–60s)" : "Generate poster"}
        </button>
      </div>

      {posters.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">Your posters</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {posters.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm" data-testid={`poster-card-${p.id}`}>
                <img src={p.url} alt={p.headline} className="w-full rounded-xl object-cover" loading="lazy" />
                <div className="flex items-start justify-between gap-2 mt-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{p.headline}</p>
                    <p className="text-xs text-slate-500 truncate">{p.subline}</p>
                  </div>
                  <a href={p.url} download={`miracurl-poster-${p.id}.jpg`} data-testid={`poster-download-${p.id}`}
                    className="shrink-0 w-8 h-8 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100 flex items-center justify-center" title="Download">
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
