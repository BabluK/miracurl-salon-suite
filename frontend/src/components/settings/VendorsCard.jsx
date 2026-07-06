import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Truck, Plus, Pencil, Trash2, X, Loader2, Mail, Phone, FileText } from "lucide-react";

const EMPTY = { name: "", email: "", phone: "", contact_person: "", gst_number: "", address: "", notes: "" };

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 block mb-1">
        {label}{required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

export function VendorsCard() {
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get("/vendors").then(r => setVendors(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  function openAdd() { setForm(EMPTY); setEditId(null); setFormOpen(true); }
  function openEdit(v) {
    setForm({ name: v.name || "", email: v.email || "", phone: v.phone || "", contact_person: v.contact_person || "", gst_number: v.gst_number || "", address: v.address || "", notes: v.notes || "" });
    setEditId(v.id);
    setFormOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/vendors/${editId}`, form);
        toast.success("Vendor updated ✦");
      } else {
        await api.post("/vendors", form);
        toast.success(`Vendor ${form.name} added ✦`);
      }
      setFormOpen(false); setForm(EMPTY); setEditId(null);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't save vendor");
    } finally { setSaving(false); }
  }

  async function remove(v) {
    if (!window.confirm(`Delete vendor ${v.name}?`)) return;
    await api.delete(`/vendors/${v.id}`);
    toast.success("Vendor deleted");
    load();
  }

  return (
    <div className="card-light" data-testid="vendors-card">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-sky-600" />
          <h3 className="font-playfair text-xl text-slate-800">Vendor Details</h3>
          {vendors.length > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{vendors.length}</span>}
        </div>
        <button data-testid="vendor-add-btn" onClick={openAdd}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-700">
          <Plus className="w-3.5 h-3.5" /> Add Vendor
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-4">Suppliers for your products. Low-stock restock emails on the dashboard go to these vendors.</p>

      {vendors.length === 0 && !formOpen && (
        <div className="text-center py-6 text-slate-400 text-sm" data-testid="vendors-empty">No vendors yet — add your first supplier.</div>
      )}

      <div className="space-y-2">
        {vendors.map(v => (
          <div key={v.id} className="rounded-xl border border-slate-200 px-4 py-3 flex items-start justify-between gap-3" data-testid={`vendor-row-${v.id}`}>
            <div className="min-w-0 text-sm">
              <div className="font-medium text-slate-800">{v.name}{v.contact_person && <span className="text-slate-400 font-normal"> · {v.contact_person}</span>}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{v.email}</span>
                {v.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{v.phone}</span>}
                {v.gst_number && <span className="inline-flex items-center gap-1 font-mono"><FileText className="w-3 h-3" />GST: {v.gst_number}</span>}
              </div>
              {v.address && <div className="text-xs text-slate-400 mt-0.5 truncate">{v.address}</div>}
            </div>
            <div className="flex gap-1 shrink-0">
              <button data-testid={`vendor-edit-${v.id}`} onClick={() => openEdit(v)} className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded"><Pencil className="w-3.5 h-3.5" /></button>
              <button data-testid={`vendor-delete-${v.id}`} onClick={() => remove(v)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      {formOpen && (
        <form onSubmit={save} className="mt-4 rounded-xl border border-sky-200 bg-sky-50/40 p-4 space-y-3" data-testid="vendor-form">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">{editId ? "Edit vendor" : "New vendor"}</span>
            <button type="button" onClick={() => { setFormOpen(false); setEditId(null); }} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Vendor / Company name" required>
              <input data-testid="vendor-form-name" required minLength={2} className="input-light w-full" placeholder="e.g. Beauty Supplies Co." value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Contact person">
              <input data-testid="vendor-form-contact" className="input-light w-full" placeholder="e.g. Suresh Kumar" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} />
            </Field>
            <Field label="Email" required>
              <input data-testid="vendor-form-email" required type="email" className="input-light w-full" placeholder="orders@vendor.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input data-testid="vendor-form-phone" className="input-light w-full" placeholder="98765 43210" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="GST number">
              <input data-testid="vendor-form-gst" maxLength={15} className="input-light w-full font-mono uppercase" placeholder="29ABCDE1234F1Z5" value={form.gst_number} onChange={e => setForm({ ...form, gst_number: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Address">
              <input data-testid="vendor-form-address" className="input-light w-full" placeholder="Street, city" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <input data-testid="vendor-form-notes" className="input-light w-full" placeholder="e.g. Delivers Tuesdays, min order ₹2000" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <button data-testid="vendor-form-save" disabled={saving} className="btn-blue w-full flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editId ? "Update Vendor" : "Save Vendor"}
          </button>
        </form>
      )}
    </div>
  );
}
