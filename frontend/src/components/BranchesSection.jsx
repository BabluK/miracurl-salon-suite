import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { MapPin, Plus, Pencil, Trash2, X, Phone, ExternalLink } from "lucide-react";

const EMPTY = { name: "", address: "", phone: "", maps_url: "" };

export const BranchesSection = () => {
  const [branches, setBranches] = useState([]);
  const [limitInfo, setLimitInfo] = useState(null); // {limit, used}
  const [modal, setModal] = useState(null); // {editing: branch|null}
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [requested, setRequested] = useState(false);
  const [askCount, setAskCount] = useState(false);
  const [addN, setAddN] = useState(1);
  const [note, setNote] = useState("");

  async function requestMore() {
    try {
      const { data } = await api.post("/branches/request-more", { additional: Number(addN) || 1, note });
      setRequested(true); setAskCount(false);
      toast.success(data.already ? "Already requested — HQ will contact you soon ✦" : `Request sent to Miracurl HQ for ${data.additional} more branch(es) — they'll email you a payment link 🏢`);
    } catch { toast.error("Couldn't send the request — try again"); }
  }

  const load = useCallback(() => {
    api.get("/branches").then(r => setBranches(r.data)).catch(() => {});
    api.get("/branches/limit").then(r => setLimitInfo(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  function openModal(editing = null) {
    setModal({ editing });
    setForm(editing ? { name: editing.name, address: editing.address, phone: editing.phone || "", maps_url: editing.maps_url || "" } : EMPTY);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal.editing) {
        await api.put(`/branches/${modal.editing.id}`, form);
        toast.success("Branch updated");
      } else {
        await api.post("/branches", form);
        toast.success("Branch added — it now shows on your public booking page");
      }
      setModal(null); load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Save failed");
    } finally { setSaving(false); }
  }

  async function remove(b) {
    if (!window.confirm(`Remove branch “${b.name}”?`)) return;
    try { await api.delete(`/branches/${b.id}`); toast.success("Branch removed"); load(); }
    catch { toast.error("Delete failed"); }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm" data-testid="branches-section">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-sky-600" /> Branch locations
          {limitInfo && (
            <span data-testid="branch-limit-badge" className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${limitInfo.used >= limitInfo.limit ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-sky-50 text-sky-700 border-sky-100"}`}>
              {limitInfo.used} / {limitInfo.limit} used
            </span>
          )}
        </h2>
        {limitInfo && limitInfo.used >= limitInfo.limit ? (
          <button data-testid="request-more-branches-btn" onClick={() => setAskCount(true)} disabled={requested}
            className={`text-xs font-bold rounded-full px-4 py-2 border transition ${requested
              ? "bg-emerald-50 text-emerald-600 border-emerald-200 cursor-default"
              : "bg-amber-500 text-white border-amber-500 hover:bg-amber-600"}`}>
            {requested ? "✓ Requested — HQ will send a payment link" : "🏢 Request more branches"}
          </button>
        ) : (
          <button data-testid="add-branch-btn" onClick={() => openModal()} className="btn-blue text-sm flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add Branch</button>
        )}
      </div>

      {askCount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setAskCount(false)}>
          <div className="card-light w-full max-w-sm mx-4" onClick={e => e.stopPropagation()} data-testid="branch-request-modal">
            <h3 className="font-playfair text-xl mb-1">Request more branches</h3>
            <p className="text-xs text-slate-500 mb-4">Tell Miracurl HQ how many extra branches you need. They'll email you a payment link for the new pricing — once paid, the branches unlock. 🏢</p>
            <label className="text-xs font-semibold text-slate-600">How many branches to add?</label>
            <input type="number" min="1" max="50" value={addN} onChange={e => setAddN(e.target.value)} data-testid="branch-request-count" className="input-light w-full mt-1" />
            <label className="text-xs font-semibold text-slate-600 mt-3 block">Anything to add? (optional)</label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} data-testid="branch-request-note" placeholder="e.g. opening 2 new outlets next month" className="input-light w-full mt-1" />
            <div className="flex gap-3 mt-5">
              <button onClick={() => setAskCount(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
              <button onClick={requestMore} data-testid="branch-request-send" className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl py-2.5 text-sm">Send request to HQ</button>
            </div>
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500 mb-4">All branches appear in the “Our Locations” section of your public booking page, with address, phone and directions link.</p>

      {branches.length === 0 ? (
        <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl py-6 text-center" data-testid="branches-empty">
          No branches added yet — your main salon location is always shown.
        </div>
      ) : (
        <div className="space-y-2">
          {branches.map(b => (
            <div key={b.id} className="flex items-start gap-3 border border-slate-200 rounded-xl px-4 py-3" data-testid={`branch-row-${b.id}`}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800">{b.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{b.address}</div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                  {b.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{b.phone}</span>}
                  {b.maps_url && <a href={b.maps_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sky-600 hover:underline"><ExternalLink className="w-3 h-3" />Maps link</a>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button data-testid={`edit-branch-${b.id}`} onClick={() => openModal(b)} className="p-1.5 text-slate-500 hover:text-sky-600"><Pencil className="w-4 h-4" /></button>
                <button data-testid={`delete-branch-${b.id}`} onClick={() => remove(b)} className="p-1.5 text-slate-500 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">{modal.editing ? "Edit" : "Add"} Branch</h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-3">
              <div><label className="label-light block mb-1">Branch name *</label><input data-testid="branch-name-input" required minLength={2} className="input-light w-full" placeholder="Miracurl — Koramangala" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><label className="label-light block mb-1">Full address *</label><textarea data-testid="branch-address-input" required minLength={5} rows={2} className="input-light w-full" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">Phone</label><input data-testid="branch-phone-input" className="input-light w-full" placeholder="+91 98765 43210" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div><label className="label-light block mb-1">Google Maps link</label><input data-testid="branch-maps-input" className="input-light w-full" placeholder="https://maps.app.goo.gl/…" value={form.maps_url} onChange={e => setForm(f => ({ ...f, maps_url: e.target.value }))} /></div>
              </div>
              <button data-testid="branch-save-btn" disabled={saving} className="btn-blue w-full">{saving ? "Saving…" : modal.editing ? "Update Branch" : "Add Branch"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
