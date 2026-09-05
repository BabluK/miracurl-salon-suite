import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { MessageCircle, Loader2, Trash2 } from "lucide-react";
import { confirmAsync } from "@/components/ConfirmDialog";

export function WaQuickInvite({ onLead }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [vertical, setVertical] = useState("salon");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [recent, setRecent] = useState([]);
  const [showAll, setShowAll] = useState(false);

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

  const removeInvite = async (r) => {
    if (!await confirmAsync(`Permanently delete the invite record for +${r.phone}${r.name ? ` (${r.name})` : ""}?`)) return;
    setRecent(rs => rs.filter(x => x.id !== r.id));
    try { await api.delete(`/super-admin/wa-invite/${r.id}`); toast.success("Invite deleted permanently"); }
    catch { toast.error("Couldn't delete"); loadRecent(); }
  };

  const clearAll = async () => {
    if (!await confirmAsync(`Permanently delete all ${recent.length} recently-invited records? Lead cards are kept.`)) return;
    try { await api.delete("/super-admin/wa-invite"); setRecent([]); toast.success("Recently invited list cleared"); }
    catch { toast.error("Couldn't clear"); }
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
        <div className="mt-4" data-testid="wa-quick-recent">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Recently invited · {recent.length}</div>
            <button onClick={clearAll} data-testid="wa-invite-clear-all"
              className="text-[11px] text-slate-400 hover:text-rose-500 inline-flex items-center gap-1 transition-colors">
              <Trash2 className="w-3 h-3" /> Clear all
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs" data-testid="wa-invite-table">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Type</th>
                  <th className="text-left font-semibold px-3 py-2">Phone</th>
                  <th className="text-left font-semibold px-3 py-2">Business</th>
                  <th className="text-left font-semibold px-3 py-2">City</th>
                  <th className="text-left font-semibold px-3 py-2">Invited on</th>
                  <th className="text-left font-semibold px-3 py-2">By</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(showAll ? recent : recent.slice(0, 10)).map(r => (
                  <tr key={r.id} className="hover:bg-emerald-50/40 transition-colors" data-testid={`wa-invite-row-${r.id}`}>
                    <td className="px-3 py-2">{r.vertical === "restaurant" ? "🍽️ Restaurant" : "💇 Salon"}</td>
                    <td className="px-3 py-2 font-mono text-slate-700">
                      <a href={`https://wa.me/${r.phone}`} target="_blank" rel="noreferrer" className="hover:text-emerald-600">+{r.phone}</a>
                    </td>
                    <td className="px-3 py-2 text-slate-700 max-w-[260px] truncate" title={r.name}>{r.name || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-slate-500">{r.city || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{(r.created_at || "").slice(0, 10)}</td>
                    <td className="px-3 py-2 text-slate-400 truncate max-w-[160px]" title={r.by}>{(r.by || "").split("@")[0] || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeInvite(r)} data-testid={`wa-invite-delete-${r.id}`}
                        title="Delete permanently"
                        className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recent.length > 10 && (
            <button onClick={() => setShowAll(v => !v)} data-testid="wa-invite-show-all"
              className="mt-1.5 text-[11px] text-slate-400 hover:text-emerald-600 underline">
              {showAll ? "Show latest 10 only" : `Show all ${recent.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
