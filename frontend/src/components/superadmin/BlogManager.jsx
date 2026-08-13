import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { BookOpen, Trash2, Plus, ExternalLink, Loader2 } from "lucide-react";

const empty = { title: "", excerpt: "", content: "", tags: "", published: true };

export const BlogManager = () => {
  const [posts, setPosts] = useState([]);
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/super-admin/blog").then(r => setPosts(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.title.trim() || !form.content.trim()) { toast.error("Title and content are required"); return; }
    setBusy(true);
    try {
      await api.post("/super-admin/blog", {
        title: form.title, excerpt: form.excerpt, content: form.content,
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean), published: form.published,
      });
      toast.success("Article published — live on /blog and visible to Google");
      setForm(empty); setShowForm(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    finally { setBusy(false); }
  }

  async function del(p) {
    if (!window.confirm(`Delete "${p.title}" permanently?`)) return;
    try { await api.delete(`/super-admin/blog/${p.id}`); toast.success("Article deleted"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
  }

  return (
    <div className="rounded-2xl bg-[#101014] border border-white/10 p-5 mt-6" data-testid="blog-manager-card">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="font-semibold text-white flex items-center gap-2"><BookOpen className="w-4 h-4 text-amber-300" /> SEO Blog</div>
        <div className="flex items-center gap-2">
          <a href="/blog" target="_blank" rel="noreferrer" className="text-xs text-white/50 hover:text-white inline-flex items-center gap-1">View /blog <ExternalLink className="w-3 h-3" /></a>
          <button onClick={() => setShowForm(f => !f)} data-testid="blog-new-btn"
            className="text-xs px-3 py-1.5 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-300 hover:bg-amber-400/25 inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> {showForm ? "Close" : "New article"}
          </button>
        </div>
      </div>
      <p className="text-xs text-white/40 mb-4">How-to articles that rank on Google and pull salon owners to the site. Use "## " for headings and "- " for bullet points; **bold** works too.</p>
      <div className="flex gap-2 mb-4">
        <input data-testid="blog-ai-topic-input" value={topic} onChange={e => setTopic(e.target.value)}
          onKeyDown={e => e.key === "Enter" && aiDraft()}
          placeholder="Topic line — e.g. How salons can use Instagram Reels to get more bookings"
          className="flex-1 bg-black/40 border border-fuchsia-400/30 rounded-md px-3 py-2 text-sm text-white/90 placeholder:text-white/25" />
        <button onClick={aiDraft} disabled={drafting} data-testid="blog-ai-draft-btn"
          className="shrink-0 px-4 py-2 rounded-md bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
          {drafting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mira is writing…</> : "✦ Draft with Mira"}
        </button>
      </div>
      {showForm && (
        <div className="space-y-3 mb-5 bg-white/5 border border-white/10 rounded-xl p-4">
          <input data-testid="blog-title-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Article title"
            className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90" />
          <input data-testid="blog-excerpt-input" value={form.excerpt} onChange={e => setForm({ ...form, excerpt: e.target.value })} placeholder="One-line excerpt (shown on the list page + Google)"
            className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90" />
          <textarea data-testid="blog-content-input" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={10}
            placeholder={"Intro paragraph…\n\n## First heading\nParagraph text with **bold**.\n\n- bullet one\n- bullet two"}
            className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90 font-mono" />
          <div className="flex gap-3">
            <input data-testid="blog-tags-input" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="tags, comma, separated"
              className="flex-1 bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90" />
            <button onClick={save} disabled={busy} data-testid="blog-save-btn"
              className="px-5 py-2 rounded-md bg-amber-400 text-black text-sm font-semibold hover:bg-amber-300 disabled:opacity-50">
              {busy ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {posts.map(p => (
          <div key={p.id} className="flex items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2" data-testid={`blog-row-${p.slug}`}>
            <div className="min-w-0">
              <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" className="text-sm text-white/85 hover:text-amber-300 truncate block">{p.title}</a>
              <span className="text-[10px] text-white/35">/blog/{p.slug} · {(p.tags || []).join(", ")}</span>
            </div>
            <button onClick={() => del(p)} data-testid={`blog-delete-${p.slug}`}
              className="shrink-0 w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
};
