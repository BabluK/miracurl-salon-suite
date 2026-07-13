import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Loader2, Heart, MessageCircle, Share2, CheckCircle2, XCircle, History } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const abs = (u) => (u && u.startsWith("/api/") ? `${BACKEND}${u}` : u);
const KIND_LABEL = { google_offer: "Day Offer", video: "Reel / Video" };
const PLATFORM_STYLE = {
  google: "bg-sky-50 text-sky-700 border-sky-200",
  instagram: "bg-pink-50 text-pink-700 border-pink-200",
  facebook: "bg-blue-50 text-blue-700 border-blue-200",
};

function PlatformChip({ name, res, eng }) {
  const ok = res?.ok;
  return (
    <div className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border ${ok ? PLATFORM_STYLE[name] : "bg-slate-50 text-slate-400 border-slate-200"}`}
      title={ok ? "Published" : res?.error || "Failed"}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      <span className="capitalize font-semibold">{name}</span>
      {ok && eng && (
        <span className="inline-flex items-center gap-1.5 ml-0.5">
          <span className="inline-flex items-center gap-0.5"><Heart className="w-3 h-3" />{eng.likes ?? 0}</span>
          <span className="inline-flex items-center gap-0.5"><MessageCircle className="w-3 h-3" />{eng.comments ?? 0}</span>
          {eng.shares > 0 && <span className="inline-flex items-center gap-0.5"><Share2 className="w-3 h-3" />{eng.shares}</span>}
        </span>
      )}
    </div>
  );
}

export const SocialHistoryPanel = () => {
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    api.get("/social/history").then(r => setPosts(r.data.posts)).catch(() => setPosts([]));
  }, []);

  if (!posts) return <div className="text-center py-10 text-slate-500"><Loader2 className="w-6 h-6 animate-spin inline" /> Loading post history…</div>;

  if (posts.length === 0) return (
    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center" data-testid="social-history-empty">
      <History className="w-8 h-8 text-slate-300 mx-auto" />
      <p className="text-slate-600 font-semibold mt-3">No posts yet</p>
      <p className="text-sm text-slate-400 mt-1">Accept a Day Offer or publish from Mira Studio — every auto-post will show up here with its likes & comments.</p>
    </div>
  );

  return (
    <div className="space-y-3" data-testid="social-history-panel">
      {posts.map(p => {
        const media = abs(p.image_url || p.video_url);
        const r = p.results || {};
        return (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex gap-4" data-testid="social-history-item">
            {media && p.image_url && (
              <img src={media} alt="" className="w-20 h-20 rounded-xl object-cover border border-slate-100 shrink-0" loading="lazy" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                  {new Date(p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </span>
                {KIND_LABEL[p.kind] && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 font-semibold">{KIND_LABEL[p.kind]}</span>
                )}
              </div>
              <p className="text-sm text-slate-700 mt-1 line-clamp-2 whitespace-pre-line">{p.caption}</p>
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                {(p.platforms || []).map(name => (
                  <PlatformChip key={name} name={name} res={r[name]} eng={(p.engagement || {})[name]} />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
