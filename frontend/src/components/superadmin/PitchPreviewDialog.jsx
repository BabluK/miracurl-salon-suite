import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Save, Sparkles, Eye } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const HINTS = {
  restaurant: "e.g. Mention GST billing first · Call it 'dine-in QR menu' not 'QR ordering' · Always greet the owner by name · Keep it under 100 words",
  salon: "e.g. Lead with WhatsApp reminders · Avoid the word 'software' · Mention bridal season · Keep it under 100 words",
};

// Boss previews Mira's pitch for a vertical (real pending lead or a sample), tunes wording notes, saves them for all future emails.
export function PitchPreviewDialog({ open, onClose, vertical, initialNotes, onSaved }) {
  const [notes, setNotes] = useState(initialNotes || "");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("text");

  const generate = async (n) => {
    setBusy("gen");
    try { const { data } = await api.post("/super-admin/mira/outreach/pitch-preview", { vertical, notes: n }); setPreview(data); }
    catch (e) { toast.error(e.response?.data?.detail || "Mira couldn't draft the preview"); }
    finally { setBusy(""); }
  };
  useEffect(() => { if (open) { setNotes(initialNotes || ""); setPreview(null); generate(initialNotes || ""); } }, [open, vertical]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy("save");
    try {
      const { data } = await api.put("/super-admin/mira/outreach/settings", { pitch_notes: { [vertical]: notes } });
      onSaved?.(data); toast.success(`✦ Saved — Mira will use this wording for every ${vertical} email`);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    finally { setBusy(""); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="pitch-preview-dialog">
        <DialogHeader>
          <DialogTitle className="font-playfair text-xl flex items-center gap-2"><Eye className="w-5 h-5 text-[#b8932e]" /> {vertical === "restaurant" ? "Restaurant" : "Salon"} pitch — Mira's wording</DialogTitle>
          <DialogDescription>Read the email exactly as a lead would receive it. Add wording instructions, regenerate, and save — Mira follows them in every future {vertical} email.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Your wording instructions for Mira</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={1500} placeholder={HINTS[vertical]}
              data-testid="pitch-notes-input" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-800 leading-relaxed" />
            <div className="flex flex-wrap gap-2 mt-2">
              <button onClick={() => generate(notes)} disabled={!!busy} data-testid="pitch-regenerate" className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-50">
                {busy === "gen" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Regenerate with these notes
              </button>
              <button onClick={save} disabled={!!busy} data-testid="pitch-save-notes" className="px-3.5 py-2 rounded-xl bg-[#1c1c22] text-[#e8c37f] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                {busy === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save wording for all {vertical} emails
              </button>
            </div>
          </div>

          {busy === "gen" && !preview && <p className="text-sm text-slate-500 flex items-center gap-2 py-6 justify-center"><Sparkles className="w-4 h-4 text-fuchsia-500 animate-pulse" /> Mira is writing the pitch…</p>}
          {preview && (
            <div className="rounded-2xl border border-[#e8c37f]/60 bg-[#fdf8ec] p-4 space-y-2" data-testid="pitch-preview-box">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                <span data-testid="pitch-preview-lead">
                  To: <b>{preview.lead?.name}</b>{preview.lead?.city ? ` · ${preview.lead.city}` : ""}{preview.lead?.rating ? ` · ★${preview.lead.rating}` : ""}{preview.lead?.reviews ? ` (${preview.lead.reviews})` : ""}
                  {preview.is_sample ? <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 font-semibold">sample lead — no pending {vertical} lead yet</span>
                    : <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">next real lead in queue</span>}
                </span>
                <span className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                  {["text", "email"].map(t => <button key={t} onClick={() => setTab(t)} data-testid={`pitch-tab-${t}`} className={`px-2.5 py-1 font-semibold ${tab === t ? "bg-[#1c1c22] text-[#e8c37f]" : "bg-white text-slate-500"}`}>{t === "text" ? "Plain text" : "As the lead sees it"}</button>)}
                </span>
              </div>
              <div className="text-sm font-semibold text-slate-900" data-testid="pitch-preview-subject"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 mr-1.5 align-middle">A</span>Subject: {preview.subject}</div>
              {preview.subject_b && <div className="text-sm font-semibold text-slate-700" data-testid="pitch-preview-subject-b"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 mr-1.5 align-middle">B</span>Subject: {preview.subject_b} <span className="text-[10px] font-normal text-slate-400">· A/B test — half the leads get A, half get B</span></div>}
              {tab === "text"
                ? <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed bg-white rounded-xl border border-slate-100 p-3" data-testid="pitch-preview-body">{preview.body}</div>
                : <iframe title="pitch email preview" srcDoc={preview.html} sandbox="" className="w-full h-[520px] bg-white rounded-xl border border-slate-100" data-testid="pitch-preview-html" />}
              <p className="text-[10px] text-slate-400">The pricing table, brochure link and unsubscribe footer are appended automatically to every email.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
