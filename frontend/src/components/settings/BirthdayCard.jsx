import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Cake, Save, Send, Loader2 } from "lucide-react";

export function BirthdayCard() {
  const [enabled, setEnabled] = useState(true);
  const [offerText, setOfferText] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get("/settings/birthday-offer")
      .then(r => { setEnabled(r.data.enabled); setOfferText(r.data.offer_text || ""); })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api.put("/settings/birthday-offer", { enabled, offer_text: offerText });
      toast.success("Birthday email settings saved ✦");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't save");
    } finally { setSaving(false); }
  }

  async function sendNow() {
    setSending(true);
    try {
      const { data } = await api.post("/crm/send-birthday-wishes");
      if (data.sent) toast.success(`🎂 ${data.sent} birthday email${data.sent > 1 ? "s" : ""} sent!`);
      else toast.info(data.message || "No guests with a birthday today");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't send");
    } finally { setSending(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6" data-testid="birthday-card">
      <div className="flex items-center justify-between">
        <h3 className="text-slate-800 font-semibold flex items-center gap-2"><Cake className="w-4 h-4 text-rose-500" /> Birthday Wishes</h3>
        <button type="button" role="switch" aria-checked={enabled} onClick={() => setEnabled(!enabled)} data-testid="birthday-enabled-toggle"
          className={`relative inline-flex h-5 w-9 rounded-full transition ${enabled ? "bg-rose-500" : "bg-slate-300"}`}>
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition mt-0.5 ${enabled ? "ml-4" : "ml-0.5"}`} />
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-2">
        Mira automatically emails a beautiful birthday wish to every guest (with an email on file) on their special day — 9 AM daily.
      </p>
      <label className="block text-xs font-medium text-slate-600 mt-4 mb-1">Birthday offer (optional — shown inside the email)</label>
      <input value={offerText} onChange={e => setOfferText(e.target.value)} maxLength={200} data-testid="birthday-offer-input"
        placeholder='e.g. "20% off any service this week — just show this email!"'
        className="w-full text-sm px-3 py-2.5 rounded-lg border border-slate-200 focus:border-rose-400 outline-none" />
      <div className="flex items-center gap-2 mt-4">
        <button onClick={save} disabled={saving} data-testid="birthday-save-btn"
          className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
        </button>
        <button onClick={sendNow} disabled={sending} data-testid="birthday-send-now-btn"
          title="Send today's birthday wishes right now"
          className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg border border-rose-300 text-rose-600 font-medium hover:bg-rose-50 disabled:opacity-50">
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send today's wishes now
        </button>
      </div>
    </div>
  );
}
