import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";

const EMPTY = { name: "", email: "", phone: "", contact_person: "", gst_number: "", address: "", notes: "" };

const FIELDS = [
  { k: "name", label: "Vendor name", required: true, placeholder: "e.g. Beauty Supplies Co." },
  { k: "email", label: "Email", required: true, placeholder: "orders@vendor.com", type: "email" },
  { k: "phone", label: "Phone", placeholder: "98765 43210" },
  { k: "contact_person", label: "Contact person", placeholder: "e.g. Suresh Kumar" },
  { k: "gst_number", label: "GST number", placeholder: "29ABCDE1234F1Z5", mono: true },
  { k: "address", label: "Address", placeholder: "Street, city" },
];

export function VendorAddForm({ onCreated }) {
  const [vForm, setVForm] = useState(EMPTY);

  async function submit(e) {
    e.preventDefault();
    try {
      const { data } = await api.post("/vendors", { ...vForm, email: vForm.email.trim() });
      toast.success(`Vendor ${data.name} added ✦`);
      setVForm(EMPTY);
      onCreated(data);
    } catch (err) {
      toast.error(err.response?.data?.detail?.[0]?.msg || err.response?.data?.detail || "Couldn't add vendor");
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-xl border border-slate-200 bg-white p-3" data-testid="vendor-add-form">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {FIELDS.map(f => (
          <div key={f.k}>
            <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 block mb-0.5">
              {f.label}{f.required && <span className="text-rose-500"> *</span>}
            </label>
            <input
              required={f.required}
              type={f.type || "text"}
              maxLength={f.k === "gst_number" ? 15 : undefined}
              placeholder={f.placeholder}
              value={vForm[f.k]}
              onChange={e => setVForm({ ...vForm, [f.k]: f.k === "gst_number" ? e.target.value.toUpperCase() : e.target.value })}
              data-testid={`vendor-${f.k.replace("_", "-")}-input`}
              className={`w-full text-xs px-2 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 ${f.mono ? "font-mono placeholder:font-sans" : ""}`}
            />
          </div>
        ))}
      </div>
      <button type="submit" data-testid="vendor-save-btn" className="mt-3 text-xs px-4 py-2 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-700">Save vendor</button>
      <span className="ml-2 text-[10px] text-slate-400">Manage all vendors in Settings → Vendor Details</span>
    </form>
  );
}
