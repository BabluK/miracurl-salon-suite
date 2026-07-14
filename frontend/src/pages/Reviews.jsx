import { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { Star, Eye, EyeOff, Trash2, MessageSquare, Sparkles, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ReviewRequestsCard } from "@/components/ReviewRequestsCard";
import { ComplaintsPanel } from "@/components/ComplaintsPanel";

function AiReplyBox({ r, onSaved }) {
  const [draft, setDraft] = useState(r.owner_reply || "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const { data } = await api.post(`/reviews/${r.id}/suggest-reply`);
      setDraft(data.reply);
      setEditing(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "AI reply failed");
    } finally { setBusy(false); }
  }
  async function save() {
    try {
      await api.put(`/reviews/${r.id}/reply`, { reply: draft });
      toast.success("Reply saved ✦");
      setEditing(false);
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(draft); toast.success("Copied — paste it on Google reviews too"); }
    catch { toast.error("Copy failed"); }
  }

  if (!editing && r.owner_reply) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-sky-50 border border-sky-100" data-testid={`owner-reply-${r.id}`}>
        <div className="text-[10px] uppercase tracking-wider text-sky-600 font-semibold mb-1">Your reply</div>
        <p className="text-xs text-slate-600">{r.owner_reply}</p>
        <div className="flex gap-2 mt-2">
          <button onClick={() => { setDraft(r.owner_reply); setEditing(true); }} className="text-[10px] text-sky-600 hover:underline">Edit</button>
          <button onClick={copy} className="text-[10px] text-slate-500 hover:underline flex items-center gap-0.5"><Copy className="w-2.5 h-2.5" /> Copy</button>
          <button onClick={generate} disabled={busy} className="text-[10px] text-violet-600 hover:underline flex items-center gap-0.5">
            {busy ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />} Regenerate
          </button>
        </div>
      </div>
    );
  }
  if (!editing) {
    return (
      <button data-testid={`ai-reply-btn-${r.id}`} onClick={generate} disabled={busy}
        className="mt-3 inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 disabled:opacity-50">
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        {busy ? "Mira is writing…" : "AI reply"}
      </button>
    );
  }
  return (
    <div className="mt-3" data-testid={`ai-reply-editor-${r.id}`}>
      <textarea rows={3} value={draft} onChange={e => setDraft(e.target.value)} maxLength={1000}
        className="w-full text-xs px-3 py-2 rounded-lg border border-violet-200 bg-violet-50/50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-200" />
      <div className="flex gap-2 mt-1.5">
        <button data-testid={`ai-reply-save-${r.id}`} onClick={save} disabled={!draft.trim()} className="text-[11px] px-3 py-1.5 rounded-lg bg-violet-600 text-white font-medium disabled:opacity-50">Save reply</button>
        <button onClick={copy} className="text-[11px] px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button>
        <button onClick={generate} disabled={busy} className="text-[11px] px-3 py-1.5 rounded-lg border border-violet-200 text-violet-600 flex items-center gap-1">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Regenerate
        </button>
        <button onClick={() => setEditing(false)} className="text-[11px] text-slate-400 hover:text-slate-600">Cancel</button>
      </div>
    </div>
  );
}

function StarRow({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={`w-3.5 h-3.5 ${n <= rating ? "fill-amber-400 text-sky-600" : "text-white/15"}`} />
      ))}
    </div>
  );
}

export default function Reviews() {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState("all"); // all | 5 | 4 | 1-3

  const load = useCallback(async () => {
    const { data } = await api.get("/reviews");
    setList(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return list;
    if (filter === "5") return list.filter(r => r.rating === 5);
    if (filter === "4") return list.filter(r => r.rating === 4);
    if (filter === "1-3") return list.filter(r => r.rating <= 3);
    return list;
  }, [list, filter]);

  const avg = list.length ? (list.reduce((s, r) => s + r.rating, 0) / list.length) : 0;
  const dist = [5, 4, 3, 2, 1].map(r => ({ r, count: list.filter(x => x.rating === r).length }));

  async function toggle(rev) {
    try {
      await api.put(`/reviews/${rev.id}/moderate`, { public: !rev.public });
      toast.success(rev.public ? "Hidden from public" : "Published to public booking page");
      load();
    } catch { toast.error("Update failed"); }
  }
  async function remove(id) {
    if (!window.confirm("Delete this review?")) return;
    try { await api.delete(`/reviews/${id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
  }

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div>
        <h1 className="font-playfair text-3xl">Customer Reviews</h1>
        <p className="text-slate-500 text-sm mt-1">Moderate what shows up on your public booking page.</p>
      </div>

      <ReviewRequestsCard />

      <ComplaintsPanel />

      {/* Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card-light">
          <div className="label-light">Average Rating</div>
          <div className="flex items-end gap-3 mt-3">
            <span className="font-playfair text-5xl text-sky-600" data-testid="avg-rating-value">{avg.toFixed(1)}</span>
            <StarRow rating={Math.round(avg)} />
          </div>
          <div className="text-xs text-slate-500 mt-2">{list.length} review{list.length !== 1 ? "s" : ""} collected</div>
        </div>
        <div className="card-light lg:col-span-2">
          <div className="label-light mb-3">Rating Distribution</div>
          {dist.map(({ r, count }) => {
            const pct = list.length ? Math.round((count / list.length) * 100) : 0;
            return (
              <div key={r} className="flex items-center gap-3 mb-2">
                <span className="text-xs w-3">{r}</span>
                <Star className="w-3 h-3 fill-amber-400 text-sky-600" />
                <div className="flex-1 h-2 bg-slate-50 rounded overflow-hidden">
                  <div className="h-full bg-sky-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-slate-500 w-12 text-right">{count} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-50 rounded-lg p-1 border border-slate-100 inline-flex">
        {[
          { k: "all", l: "All" },
          { k: "5", l: "★ 5" },
          { k: "4", l: "★ 4" },
          { k: "1-3", l: "Needs Attention (≤3)" },
        ].map(t => (
          <button
            key={t.k}
            data-testid={`reviews-filter-${t.k}`}
            onClick={() => setFilter(t.k)}
            className={`px-4 py-1.5 text-xs rounded-md transition ${filter === t.k ? "bg-sky-500 text-white font-semibold" : "text-slate-500 hover:text-slate-900 hover:bg-white"}`}
          >{t.l}</button>
        ))}
      </div>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.length === 0 ? (
          <div className="card-light md:col-span-2 text-center py-12">
            <MessageSquare className="w-10 h-10 text-slate-400 mx-auto opacity-50 mb-2" />
            <p className="text-slate-500">No reviews here yet.</p>
          </div>
        ) : filtered.map(r => (
          <div
            key={r.id}
            data-testid={`review-card-${r.id}`}
            className={`card-light ${r.rating <= 3 ? "border-amber-500/30" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-blue-500 flex items-center justify-center text-white font-semibold">
                  {r.customer_name.charAt(0)}
                </div>
                <div>
                  <div className="font-medium">{r.customer_name}</div>
                  {r.staff_name && <div className="text-[10px] text-slate-500">with {r.staff_name}</div>}
                </div>
              </div>
              <StarRow rating={r.rating} />
            </div>
            {r.comment && <p className="text-sm text-slate-500 mt-3 italic">&ldquo;{r.comment}&rdquo;</p>}
            <AiReplyBox r={r} onSaved={load} />
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span>{new Date(r.created_at).toLocaleDateString()}</span>
                {r.reward_code && <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-600 font-mono">{r.reward_code}</span>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  data-testid={`toggle-review-${r.id}`}
                  onClick={() => toggle(r)}
                  className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 ${r.public ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-50 text-slate-400"}`}
                  title={r.public ? "Hide from public booking page" : "Show on public booking page"}
                >
                  {r.public ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {r.public ? "Public" : "Hidden"}
                </button>
                <button
                  data-testid={`delete-review-${r.id}`}
                  onClick={() => remove(r.id)}
                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/5 rounded"
                ><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
