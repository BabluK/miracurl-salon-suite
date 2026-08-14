import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Quote, Plus, Trash2, Save, Eye, EyeOff } from "lucide-react";
import { confirmAsync } from "@/components/ConfirmDialog";

const inputCls = "px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200 w-full";

export function TestimonialsEditor() {
  const [rows, setRows] = useState([]);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/super/testimonials");
      setRows(data.testimonials || []);
    } catch { toast.error("Couldn't load testimonials"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setField = (id, k, v) => setRows(rs => rs.map(r => r.id === id ? { ...r, [k]: v } : r));

  async function save(r) {
    setSavingId(r.id);
    try {
      await api.put(`/super/testimonials/${r.id}`, {
        salon_name: r.salon_name, owner_name: r.owner_name, city: r.city || "",
        quote: r.quote, photo_url: r.photo_url || "", visible: r.visible !== false,
      });
      toast.success("Saved — live on the website ✦");
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Save failed — check all fields are filled");
    } finally { setSavingId(null); }
  }

  async function add() {
    try {
      await api.post("/super/testimonials", {
        salon_name: "New Salon", owner_name: "Owner Name", city: "",
        quote: "Write the owner's comment here…", photo_url: "", visible: false,
      });
      load();
    } catch { toast.error("Couldn't add"); }
  }

  async function remove(r) {
    if (!await confirmAsync(`Remove the testimonial from ${r.salon_name}?`)) return;
    try { await api.delete(`/super/testimonials/${r.id}`); toast.success("Removed"); load(); }
    catch { toast.error("Delete failed"); }
  }

  return (
    <div className="card-light mt-6" data-testid="testimonials-editor">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="font-playfair text-xl flex items-center gap-2"><Quote className="w-5 h-5 text-fuchsia-500" /> Website Testimonials</h3>
        <button data-testid="testimonial-add-btn" onClick={add} className="text-xs px-3 py-1.5 rounded-md bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-100 font-semibold inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-4">These are the &ldquo;Salon owners on Miracurl&rdquo; quotes on your public website. Put the real owner name and their actual comment — changes go live instantly.</p>
      <div className="space-y-4">
        {rows.map(r => (
          <div key={r.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2" data-testid={`testimonial-row-${r.id}`}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input data-testid={`testimonial-salon-${r.id}`} className={inputCls} value={r.salon_name} onChange={e => setField(r.id, "salon_name", e.target.value)} placeholder="Salon name" />
              <input data-testid={`testimonial-owner-${r.id}`} className={inputCls} value={r.owner_name} onChange={e => setField(r.id, "owner_name", e.target.value)} placeholder="Owner name (shown on site)" />
              <input data-testid={`testimonial-city-${r.id}`} className={inputCls} value={r.city || ""} onChange={e => setField(r.id, "city", e.target.value)} placeholder="City" />
            </div>
            <textarea data-testid={`testimonial-quote-${r.id}`} rows={2} className={inputCls} value={r.quote} onChange={e => setField(r.id, "quote", e.target.value)} placeholder="The owner's actual comment…" />
            <input data-testid={`testimonial-photo-${r.id}`} className={inputCls} value={r.photo_url || ""} onChange={e => setField(r.id, "photo_url", e.target.value)} placeholder="Owner photo URL (optional)" />
            <div className="flex items-center justify-between pt-1">
              <button data-testid={`testimonial-visible-${r.id}`} onClick={() => setField(r.id, "visible", r.visible === false)}
                className={`text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded-md border font-semibold ${r.visible !== false ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-100 border-slate-200 text-slate-500"}`}>
                {r.visible !== false ? <><Eye className="w-3 h-3" /> Visible on site</> : <><EyeOff className="w-3 h-3" /> Hidden</>}
              </button>
              <div className="flex items-center gap-2">
                <button data-testid={`testimonial-save-${r.id}`} onClick={() => save(r)} disabled={savingId === r.id}
                  className="text-xs px-3 py-1.5 rounded-md bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                  <Save className="w-3 h-3" /> {savingId === r.id ? "Saving…" : "Save"}
                </button>
                <button data-testid={`testimonial-delete-${r.id}`} onClick={() => remove(r)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
