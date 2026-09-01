import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { MessageCircle, Loader2, X } from "lucide-react";

export function WaQuickInvite({ onLead }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [vertical, setVertical] = useState("salon");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [recent, setRecent] = useState([]);

  const loadRecent = () =>
    api.get("/super-admin/wa-invite/recent").then(r => setRecent(r.data.items || [])).catch(() => {});
  useEffect(() => { loadRecent(); }, []);

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/super-admin/wa-invite",
        { phone: phone.trim(), vertical, name: name.trim(), city: city.trim() });
      window.open(data.wa_url, "_blank");
      setPreview(data.message);
      toast.success(data.lead_new
        ? `WhatsApp opened for +${data.phone} 💬 — lead card created, replies & demos will be tracked 📇`
        : `WhatsApp opened for +${data.phone} 💬 — existing lead card updated 📇`);
      loadRecent();
      onLead?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't build the invite"); }
    finally { setBusy(false); }
  };

  const removeInvite = async (id) => {
    setRecent(rs => rs.filter(r => r.id !== id));
    try { await api.delete(`/super-admin/wa-invite/${id}`); toast.success("Invite removed"); }
    catch { toast.error("Couldn't remove"); loadRecent(); }
  };

  return (
    <div className="bg-white rounded-2xl border border-emerald-200 p-4" data-testid="wa-quick-invite-card">
      <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-emerald-500" /> WhatsApp Invite — quick send
      </h3>
      <p className="text-xs text-slate-500 mt-0.5 mb-3">
        Found a number on Google Maps? Paste it here — Mira writes the full Miracurl pitch (pricing, demo video, brochure links) and opens WhatsApp ready to send. Every invite becomes a lead card below, so replies & demos get tracked.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200" data-testid="wa-quick-vertical-toggle">
          {[["salon", "💇 Salon"], ["restaurant", "🍽️ Restaurant"]].map(([k, l]) => (
            <button key={k} onClick={() => setVertical(k)} data-testid={`wa-quick-vertical-${k}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${vertical === k ? "bg-white shadow text-emerald-600" : "text-slate-500 hover:text-slate-700"}`}>
              {l}
            </button>
          ))}
        </div>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone e.g. 09148054415"
          data-testid="wa-quick-phone-input"
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm w-44" />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Business name (optional)"
          data-testid="wa-quick-name-input"
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm w-48" />
        <input value={city} onChange={e => setCity(e.target.value)} placeholder="City (optional)"
          data-testid="wa-quick-city-input"
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm w-36" />
        <button onClick={send} disabled={busy || phone.trim().replace(/\D/g, "").length < 10}
          data-testid="wa-quick-send-btn"
          className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
          Open WhatsApp invite
        </button>
      </div>
      {preview && (
        <div className="mt-3 text-xs text-slate-600 bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 whitespace-pre-wrap max-h-44 overflow-y-auto"
          data-testid="wa-quick-preview">{preview}</div>
      )}
      {recent.length > 0 && (
        <div className="mt-3" data-testid="wa-quick-recent">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Recently invited</div>
          <div className="flex flex-wrap gap-1.5">
            {recent.map(r => (
              <span key={r.id} className="inline-flex items-center gap-1 text-[11px] pl-2.5 pr-1.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600">
                {r.vertical === "restaurant" ? "🍽️" : "💇"} +{r.phone}{r.name ? ` · ${r.name}` : ""} · {(r.created_at || "").slice(0, 10)}
                <button onClick={() => removeInvite(r.id)} data-testid={`wa-invite-delete-${r.id}`}
                  title="Remove from recently invited"
                  className="p-0.5 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
