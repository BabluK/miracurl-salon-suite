import { useCallback, useEffect, useState } from "react";
import { Brain, Loader2, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { confirmAsync } from "@/components/ConfirmDialog";

// "Mira has learned from N of your edits" — the (draft → your final) pairs she mirrors when drafting replies.
export function ToneMemoryChip({ refreshKey }) {
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/super-admin/mira/tone-memory").then(r => setM(r.data)).catch(() => setM({ count: 0, used_in_prompt: 0, items: [] })), []);
  useEffect(() => { load(); }, [load, refreshKey]);
  if (!m) return null;
  const forget = async (e) => {
    e.stopPropagation();
    if (!await confirmAsync(`Forget all ${m.count} remembered edits? Mira will draft demo invites from scratch again.`)) return;
    setBusy(true);
    try { await api.delete("/super-admin/mira/tone-memory"); toast.success("🧠 Mira's tone memory cleared"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Couldn't clear"); }
    finally { setBusy(false); }
  };
  return (
    <span data-testid="tone-memory-chip" data-count={m.count}
      title={m.count ? `Mira mirrors the tone of your last ${m.used_in_prompt} edited replies when drafting (${m.count} stored)` : "Edit any of Mira's drafts before sending — she'll learn your tone"}
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${m.count ? "bg-[#fdf8ec] border-[#e8c37f] text-[#9a7a1f]" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
      <Brain className="w-3 h-3" />
      <span data-testid="tone-memory-label">{m.count ? `Mira has learned from ${m.count} of your edit${m.count === 1 ? "" : "s"}` : "Mira learns your tone from edits"}</span>
      {m.count > 0 && (
        <button onClick={forget} disabled={busy} data-testid="tone-memory-forget" title="Forget all remembered edits"
          className="ml-0.5 w-4 h-4 rounded-full hover:bg-white inline-flex items-center justify-center text-slate-400 hover:text-rose-500 disabled:opacity-50">
          {busy ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Trash2 className="w-2.5 h-2.5" />}
        </button>
      )}
    </span>
  );
}
