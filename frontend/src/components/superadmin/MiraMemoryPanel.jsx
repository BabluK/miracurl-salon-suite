import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Brain, Check, Pencil, Plus, Trash2, X, Loader2 } from "lucide-react";

const CATS = ["general", "goals", "pricing", "targets", "strategy", "preferences", "competitors"];
const FILTERS = [["all", "All"], ["boss", "Boss"], ["auto", "Learned"]];
const isAuto = (m) => m.source === "auto";

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function MemoryRow({ m, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.text);
  const [busy, setBusy] = useState(false);
  const auto = isAuto(m);
  const save = async () => {
    if (text.trim().length < 2) return;
    setBusy(true);
    await onSave(m, text.trim());
    setBusy(false);
    setEditing(false);
  };
  return (
    <div className={`group rounded-xl px-3 py-2.5 border transition-colors ${auto ? "bg-cyan-400/[.05] border-cyan-300/15 hover:border-cyan-300/35" : "bg-[#e8c37f]/[.07] border-[#e8c37f]/20 hover:border-[#e8c37f]/45"}`}
      data-testid={`memory-item-${m.id}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${auto ? "bg-cyan-400/15 text-cyan-200" : "bg-[#e8c37f]/20 text-[#f3dfae]"}`} data-testid={`memory-source-${m.id}`}>
          {auto ? "Learned" : "Boss"}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-white/45" data-testid={`memory-cat-${m.id}`}>{m.category}</span>
        <span className="ml-auto text-[9px] text-white/30">{ago(m.updated_at || m.created_at)}</span>
      </div>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input value={text} onChange={e => setText(e.target.value)} autoFocus data-testid={`memory-edit-input-${m.id}`}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setText(m.text); setEditing(false); } }}
            className="flex-1 bg-white/10 border border-fuchsia-400/40 rounded-lg text-xs px-2 py-1.5 text-white focus:outline-none" />
          <button onClick={save} disabled={busy} className="w-7 h-7 rounded-lg bg-emerald-400 text-[#06251a] flex items-center justify-center disabled:opacity-50" data-testid={`memory-save-${m.id}`}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => { setText(m.text); setEditing(false); }} className="w-7 h-7 rounded-lg bg-white/10 text-white/70 flex items-center justify-center" data-testid={`memory-cancel-${m.id}`}><X className="w-3.5 h-3.5" /></button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-white/85 leading-snug" data-testid={`memory-text-${m.id}`}>{m.text}</p>
          <div className="flex gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditing(true)} className="w-6 h-6 rounded-md hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center" data-testid={`memory-edit-${m.id}`} title="Edit"><Pencil className="w-3 h-3" /></button>
            <button onClick={() => onDelete(m)} className="w-6 h-6 rounded-md hover:bg-rose-500/20 text-white/60 hover:text-rose-300 flex items-center justify-center" data-testid={`memory-del-${m.id}`} title="Forget"><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline in Mira Home: everything Mira carries into every prompt — Boss notes + what she learned herself.
export function MiraMemoryPanel({ focusSignal = 0 }) {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState("all");
  const [cat, setCat] = useState("general");
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef(null);

  const load = useCallback(() => api.get("/super-admin/mira/memory").then(r => setItems(r.data.items || [])).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (focusSignal) inputRef.current?.focus(); }, [focusSignal]);

  const add = async () => {
    if (text.trim().length < 2) return;
    setAdding(true);
    try {
      await api.post("/super-admin/mira/memory", { category: cat, text: text.trim() });
      setText("");
      toast.success("Mira will remember that 🧠");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    setAdding(false);
  };
  const save = async (m, t) => {
    try { await api.put(`/super-admin/mira/memory/${m.id}`, { category: m.category, text: t }); toast.success("Memory updated"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't update"); }
  };
  const del = async (m) => {
    try { await api.delete(`/super-admin/mira/memory/${m.id}`); setItems(x => (x || []).filter(i => i.id !== m.id)); toast.success("Mira forgot it"); }
    catch { toast.error("Couldn't delete"); }
  };

  const all = items || [];
  const counts = { all: all.length, boss: all.filter(m => !isAuto(m)).length, auto: all.filter(isAuto).length };
  const shown = all.filter(m => filter === "all" || (filter === "auto") === isAuto(m));

  return (
    <div className="mira-glass rounded-2xl p-4" data-testid="mira-memory-panel">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
          <Brain className="w-4 h-4 text-fuchsia-400" /> What Mira has learned
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-200" data-testid="memory-count">{counts.all}</span>
        </div>
        <div className="flex gap-1" data-testid="memory-filters">
          {FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} data-testid={`memory-filter-${k}`}
              className={`text-[10px] whitespace-nowrap px-2 py-0.5 rounded-full border transition-colors ${filter === k ? "bg-white/15 border-white/30 text-white" : "border-white/10 text-white/45 hover:text-white"}`}>
              {l} <span className="opacity-60">{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 mb-3">
        <select value={cat} onChange={e => setCat(e.target.value)} data-testid="memory-cat-select"
          className="bg-white/5 border border-white/15 rounded-xl text-[11px] px-2 py-2 text-white focus:outline-none focus:border-fuchsia-400/50">
          {CATS.map(c => <option key={c} value={c} className="bg-[#0b1020]">{c}</option>)}
        </select>
        <input ref={inputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Teach Mira something… e.g. Focus on 3+ branch salons" data-testid="memory-add-input"
          className="flex-1 min-w-0 bg-white/5 border border-white/15 rounded-xl text-[11px] px-3 py-2 text-white focus:outline-none focus:border-fuchsia-400/50 placeholder:text-white/30" />
        <button onClick={add} disabled={adding || text.trim().length < 2} data-testid="memory-add-btn"
          className="w-9 h-9 shrink-0 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 disabled:opacity-40 text-white flex items-center justify-center transition-colors">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1" data-testid="memory-list">
        {items === null && <div className="flex items-center gap-2 text-[11px] text-white/40 py-4 justify-center"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Opening Mira's memory…</div>}
        {items !== null && shown.length === 0 && (
          <p className="text-[11px] text-white/40 text-center py-5" data-testid="memory-empty">
            {filter === "auto" ? "Nothing learned yet — replies and conversions will show up here as Mira works." : "Nothing here yet — teach Mira about your business above."}
          </p>
        )}
        {shown.map(m => <MemoryRow key={m.id} m={m} onSave={save} onDelete={del} />)}
      </div>
      <p className="text-[10px] text-white/35 mt-3 leading-snug">Boss notes always win. Learned items are Mira's own observations from outreach — edit or delete anything she got wrong.</p>
    </div>
  );
}
