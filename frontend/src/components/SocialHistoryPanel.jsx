import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Heart, MessageCircle, Share2, CheckCircle2, XCircle, History, Trash2, RefreshCw } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const abs = (u) => (u && u.startsWith("/api/") ? `${BACKEND}${u}` : u);
const KIND_LABEL = { google_offer: "Day Offer", video: "Reel / Video" };
const PLATFORM_STYLE = {
  google: "bg-sky-50 text-sky-700 border-sky-200",
  instagram: "bg-pink-50 text-pink-700 border-pink-200",
  facebook: "bg-blue-50 text-blue-700 border-blue-200",
};
const LOG_ONLY_NOTE = "This only removes the entry from your Miracurl Post History log. The post itself stays live on Instagram / Facebook / Google.";

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

function Thumb({ src }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return <img src={src} alt="" onError={() => setBroken(true)} loading="lazy"
    className="w-20 h-20 rounded-xl object-cover border border-slate-100 shrink-0" />;
}

function ConfirmDialog({ open, onOpenChange, title, onConfirm, busy, testId }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid={testId} className="bg-white text-slate-800 border-slate-200 rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-slate-900">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-slate-500">{LOG_ONLY_NOTE}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid={`${testId}-cancel`} className="bg-white text-slate-700 border-slate-200 hover:bg-slate-50">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={busy} data-testid={`${testId}-confirm`}
            className="bg-rose-600 hover:bg-rose-700 text-white">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export const SocialHistoryPanel = ({ onReuse }) => {
  const [posts, setPosts] = useState(null);
  const [target, setTarget] = useState(null); // post id | "__all__"
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/social/history").then(r => setPosts(r.data.posts)).catch(() => setPosts([]));
  }, []);

  const confirmDelete = async () => {
    setBusy(true);
    try {
      if (target === "__all__") {
        const r = await api.delete("/social/history");
        setPosts([]);
        toast.success(`Post History cleared (${r.data.deleted} entries removed)`);
      } else {
        await api.delete(`/social/history/${target}`);
        setPosts(p => p.filter(x => x.id !== target));
        toast.success("Log entry deleted");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't delete — please try again");
    } finally {
      setBusy(false);
      setTarget(null);
    }
  };

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
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{posts.length} {posts.length === 1 ? "post" : "posts"} logged</span>
        <button type="button" onClick={() => setTarget("__all__")} data-testid="social-history-clear-btn"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-white border border-rose-200 hover:border-rose-300 rounded-full px-3 py-1.5 transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> Clear history
        </button>
      </div>
      {posts.map(p => {
        const r = p.results || {};
        return (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex gap-4 group" data-testid="social-history-item">
            <Thumb src={p.image_url ? abs(p.image_url) : null} />
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
            <div className="self-start flex items-center gap-1 shrink-0">
              {onReuse && p.caption && (
                <button type="button" onClick={() => onReuse(p)} title="Reuse this post — Mira rewrites it fresh with a new image"
                  data-testid={`social-history-reuse-${p.id}`}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100 border border-fuchsia-200 rounded-full px-2.5 py-1 transition-colors">
                  <RefreshCw className="w-3 h-3" /> Reuse
                </button>
              )}
              <button type="button" onClick={() => setTarget(p.id)} title="Delete this log entry"
                data-testid={`social-history-delete-${p.id}`}
                className="p-2 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
      <ConfirmDialog open={!!target} onOpenChange={(o) => !o && !busy && setTarget(null)} busy={busy}
        title={target === "__all__" ? "Clear the entire Post History?" : "Delete this log entry?"}
        onConfirm={confirmDelete} testId="social-history-confirm" />
    </div>
  );
};
