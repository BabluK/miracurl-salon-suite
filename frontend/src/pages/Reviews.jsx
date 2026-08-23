import { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { Star, Eye, EyeOff, Trash2, MessageSquare, Sparkles, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { askConfirm } from "@/components/ConfirmDialog";
import { ReviewRequestsCard } from "@/components/ReviewRequestsCard";
import { ComplaintsPanel } from "@/components/ComplaintsPanel";
import { useAuth } from "@/context/AuthContext";

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

function GoogleG({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41.4 34.9 44 29.9 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </svg>
  );
}

function GoogleReplyBox({ rv, idx, mapsUrl }) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const { data } = await api.post("/reviews/google/draft-reply", {
        author: rv.author || "", rating: rv.rating || 5, text: rv.text || "",
      });
      setDraft(data.reply);
      setOpen(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Mira couldn't draft a reply");
    } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(draft); toast.success("Copied — now paste it as your reply on Google"); }
    catch { toast.error("Copy failed"); }
  }

  if (!open) {
    return (
      <button onClick={generate} disabled={busy} data-testid={`google-reply-draft-${idx}`}
        className="mt-2 inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 disabled:opacity-50">
        {busy ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />} Mira reply
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-1.5" data-testid={`google-reply-box-${idx}`}>
      <textarea rows={3} value={draft} onChange={e => setDraft(e.target.value)} maxLength={1000}
        className="w-full text-[11px] px-2.5 py-2 rounded-lg border border-violet-200 bg-violet-50/50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-200" />
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={copy} data-testid={`google-reply-copy-${idx}`}
          className="text-[10px] px-2.5 py-1 rounded-lg bg-violet-600 text-white font-bold flex items-center gap-1"><Copy className="w-2.5 h-2.5" /> Copy</button>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noreferrer" data-testid={`google-reply-open-${idx}`}
            className="text-[10px] px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Reply on Google →</a>
        )}
        <button onClick={generate} disabled={busy} className="text-[10px] text-violet-600 hover:underline flex items-center gap-0.5">
          {busy ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />} Regenerate
        </button>
        <button onClick={() => setOpen(false)} className="text-[10px] text-slate-400 hover:text-slate-600">Close</button>
      </div>
    </div>
  );
}

function GoogleReviewsCard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);

  const fetchGoogle = useCallback(async (refresh = false) => {
    setBusy(true);
    setErr("");
    try {
      const { data: d } = await api.get(`/reviews/google${refresh ? "?refresh=1" : ""}`);
      setData(d);
    } catch (e) {
      setErr(e.response?.data?.detail || "Couldn't reach Google");
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { fetchGoogle(); }, [fetchGoogle]);

  return (
    <div className="card-light" data-testid="google-reviews-card">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div className="flex items-center gap-2">
          <GoogleG className="w-5 h-5" />
          <div className="label-light">Live Google Reviews</div>
        </div>
        <div className="flex items-center gap-2">
          {data?.maps_url && (
            <a href={data.maps_url} target="_blank" rel="noreferrer" className="text-[11px] text-sky-600 hover:underline" data-testid="google-maps-link">
              View all on Google →
            </a>
          )}
          <button onClick={() => fetchGoogle(true)} disabled={busy} data-testid="google-reviews-refresh"
            className="text-[11px] px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 disabled:opacity-50">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
          </button>
        </div>
      </div>
      {busy && !data && <p className="text-xs text-slate-400 py-4">Fetching your live Google rating…</p>}
      {err && !data && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2" data-testid="google-reviews-error">
          {err}
        </div>
      )}
      {data && (
        <>
          <div className="flex items-end gap-3 mt-2">
            <span className="font-playfair text-4xl text-slate-800" data-testid="google-rating-value">{data.rating ?? "—"}</span>
            <StarRow rating={Math.round(data.rating || 0)} />
            <span className="text-xs text-slate-500 mb-1">{data.total_ratings} Google rating{data.total_ratings !== 1 ? "s" : ""} · {data.place_name}</span>
          </div>
          {data.reviews?.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
              {data.reviews.map((rv, i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3" data-testid={`google-review-${i}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {rv.photo
                        ? <img src={rv.photo} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                        : <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[11px] font-semibold text-slate-600">{rv.author.charAt(0)}</div>}
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{rv.author}</div>
                        <div className="text-[10px] text-slate-400">{rv.when}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <StarRow rating={rv.rating || 0} />
                      <GoogleG className="w-3 h-3" />
                    </div>
                  </div>
                  {rv.text && <p className="text-xs text-slate-600 mt-2 line-clamp-4 italic">&ldquo;{rv.text}&rdquo;</p>}
                  <GoogleReplyBox rv={rv} idx={i} mapsUrl={data.maps_url} />
                </div>
              ))}
            </div>
          )}
          {(data.archive || []).filter(a => a.rating === 5).length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100" data-testid="google-5star-archive">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="text-xs font-semibold text-slate-600">All 5★ Google reviews we&apos;ve collected — recent &amp; old</span>
                <span className="text-[10px] text-slate-400">({data.archive.filter(a => a.rating === 5).length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                {data.archive.filter(a => a.rating === 5).map((rv, i) => (
                  <div key={rv.id || i} className="rounded-lg border border-amber-100 bg-amber-50/40 p-2.5" data-testid={`google-archive-review-${i}`}>
                    <div className="flex items-center gap-2">
                      {rv.photo
                        ? <img src={rv.photo} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                        : <div className="w-6 h-6 rounded-full bg-amber-200 flex items-center justify-center text-[10px] font-semibold text-amber-800">{(rv.author || "G").charAt(0)}</div>}
                      <div className="text-[11px] font-medium truncate">{rv.author}</div>
                      <span className="text-[9px] text-slate-400 ml-auto shrink-0">{rv.when}</span>
                    </div>
                    {rv.text && <p className="text-[11px] text-slate-600 mt-1.5 line-clamp-3 italic">&ldquo;{rv.text}&rdquo;</p>}
                    {rv.mira_reply && <p className="text-[10px] text-amber-700 mt-1.5">↳ {rv.mira_reply}</p>}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Mira archives every review Google shares (5 at a time) — this list grows over time, keeping older 5★ reviews visible.</p>
            </div>
          )}
          <p className="text-[10px] text-slate-400 mt-3">Google shares its overall rating plus the 5 most relevant reviews via API — tap &ldquo;View all on Google&rdquo; for the full list.</p>
        </>
      )}
    </div>
  );
}

function ReviewBonusCard() {
  const [cfg, setCfg] = useState(null);
  const [bonuses, setBonuses] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings/review-bonus").then(r => setCfg(r.data)).catch(() => {});
    api.get("/reviews/bonuses").then(r => setBonuses(r.data)).catch(() => {});
  }, []);

  async function save(next) {
    setSaving(true);
    try {
      const { data } = await api.put("/settings/review-bonus", next);
      setCfg({ enabled: data.enabled, amount: data.amount });
      toast.success(data.enabled ? `5★ review bonus ON — ₹${data.amount} per review ✦` : "5★ review bonus turned off");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  }

  if (!cfg) return null;
  return (
    <div className="card-light" data-testid="review-bonus-card">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="label-light">5★ Review Bonus for Staff</div>
          <p className="text-xs text-slate-500 mt-1">Reward your team — every 5★ review naming a stylist adds this amount to their upcoming salary. Mira congratulates them with a popup.</p>
        </div>
        <button
          data-testid="review-bonus-toggle"
          onClick={() => save({ enabled: !cfg.enabled, amount: cfg.amount || 20 })}
          disabled={saving}
          className={`relative w-11 h-6 rounded-full transition-colors ${cfg.enabled ? "bg-emerald-500" : "bg-slate-300"}`}
          aria-label="Toggle review bonus"
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${cfg.enabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      {cfg.enabled && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {[20, 30, 50].map(a => (
            <button key={a} data-testid={`review-bonus-preset-${a}`} onClick={() => save({ enabled: true, amount: a })} disabled={saving}
              className={`px-4 py-1.5 text-xs rounded-full border transition ${cfg.amount === a ? "bg-amber-500 border-amber-500 text-white font-semibold" : "border-slate-200 text-slate-600 hover:bg-amber-50"}`}>
              ₹{a}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400">or custom ₹</span>
            <input type="number" min="1" max="5000" defaultValue={![20, 30, 50].includes(cfg.amount) ? cfg.amount : ""}
              data-testid="review-bonus-custom-input"
              onKeyDown={e => { if (e.key === "Enter" && Number(e.target.value) > 0) save({ enabled: true, amount: Number(e.target.value) }); }}
              onBlur={e => { const v = Number(e.target.value); if (v > 0 && v !== cfg.amount) save({ enabled: true, amount: v }); }}
              className="w-20 px-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-200" placeholder="amount" />
          </div>
        </div>
      )}
      {cfg.enabled && bonuses?.rows?.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Awarded this month</span>
            <span className="font-semibold text-amber-600" data-testid="review-bonus-month-total">₹{bonuses.total} total</span>
          </div>
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {bonuses.rows.map(b => (
              <div key={b.id} className="flex items-center justify-between text-xs bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-1.5">
                <span><b>{b.staff_name}</b> <span className="text-slate-400">· 5★ from {b.customer_name}</span></span>
                <span className="text-amber-700 font-semibold shrink-0">+₹{b.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Reviews() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState("all"); // all | 5 | 4 | 1-3
  const [funnel, setFunnel] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/reviews");
    setList(data);
    api.get("/reviews/qr-funnel").then(r => setFunnel(r.data)).catch(() => {});
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
    askConfirm({
      title: "Delete review?", message: "It will be removed permanently.", confirmLabel: "Yes, delete", danger: true,
      action: async () => {
        try { await api.delete(`/reviews/${id}`); toast.success("Deleted"); load(); }
        catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
      },
    });
  }

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div>
        <h1 className="font-playfair text-3xl">Customer Reviews</h1>
        <p className="text-slate-500 text-sm mt-1">Moderate what shows up on your public booking page.</p>
      </div>

      <ReviewRequestsCard />

      <GoogleReviewsCard />

      {(user?.role === "admin" || user?.role === "super_admin") && <ReviewBonusCard />}

      {/* QR tent-card funnel */}
      {funnel && (
        <div className="card-light" data-testid="qr-funnel-card">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div className="label-light">QR Tent Card Funnel · last {funnel.days} days</div>
            {funnel.rated > 0 && <span className="text-xs text-slate-400">avg rating from scans: <b className="text-amber-600">{funnel.avg_rating}★</b></span>}
          </div>
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            {[
              { label: "QR scans", value: funnel.scans, tint: "text-sky-600", testid: "funnel-scans" },
              { label: "Ratings left", value: funnel.rated, tint: "text-amber-600", testid: "funnel-rated" },
              { label: "Happy (4-5★)", value: funnel.happy, tint: "text-emerald-600", testid: "funnel-happy" },
              { label: "Sent to Google", value: funnel.google_redirects, tint: "text-fuchsia-600", testid: "funnel-google" },
            ].map((s, i) => (
              <div key={s.label} className="flex items-center gap-2 sm:gap-4">
                {i > 0 && <span className="text-slate-300 text-lg">→</span>}
                <div className="text-center px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 min-w-[92px]">
                  <div className={`font-playfair text-2xl ${s.tint}`} data-testid={s.testid}>{s.value}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
          {funnel.scans === 0 && <p className="text-xs text-slate-400 mt-3">No scans yet — print your review tent card from Settings → QR Posters and keep it at the billing desk ✦</p>}
        </div>
      )}

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
      <div>
        <div className="label-light mb-2">In-app reviews · collected via your QR tent card scans &amp; post-visit review links</div>
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
