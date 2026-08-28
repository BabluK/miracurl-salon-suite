import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Contact, Download, Loader2, Save } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const FIELDS = [
  { key: "tagline", label: "Tagline", ph: "e.g. Beauty & Care Experts" },
  { key: "phone", label: "Phone", ph: "+91 98765 43210" },
  { key: "email", label: "Email", ph: "hello@yourbusiness.com" },
  { key: "instagram", label: "Instagram handle", ph: "yourbusiness" },
  { key: "location", label: "Address / Area", ph: "Marathahalli, Bengaluru" },
];

export function VisitingCardCard() {
  const { tenant } = useAuth();
  const resto = tenant?.business_type === "restaurant";
  const [dl, setDl] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ tagline: "", phone: "", email: "", instagram: "", location: "" });
  const [v, setV] = useState(0);
  const src = `${BACKEND_URL}/api/settings/visiting-card.png?origin=${encodeURIComponent(window.location.origin)}&v=${v}`;
  const srcBack = `${src}&side=back`;

  useEffect(() => {
    api.get("/settings/visiting-card-details")
      .then(({ data }) => setForm(data))
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings/visiting-card-details", form);
      setV(Date.now());
      toast.success("Card details saved — preview refreshed");
    } catch {
      toast.error("Couldn't save card details");
    }
    setSaving(false);
  };

  const download = async (side) => {
    setDl(true);
    try {
      const { data } = await api.get("/settings/visiting-card.png", {
        params: { origin: window.location.origin, side, v }, responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `visiting-card-${side}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't generate the visiting card");
    }
    setDl(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-6" data-testid="visiting-card-card">
      <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
        <Contact className="w-5 h-5 text-amber-500" /> Visiting Card
      </h2>
      <p className="text-xs text-slate-500 mt-1">
        Print-ready designer card (3.5"×2", 300 DPI). Front: logo, name, tagline, contacts + scan-to-{resto ? "order" : "book"} QR. Back: big "Scan to {resto ? "Order" : "Book Your Slot"}" QR, Instagram and contact details. Your logo comes from the {resto ? "Restaurant" : "Salon"} profile above.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{f.label}</span>
            <input
              value={form[f.key] || ""}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              placeholder={f.ph}
              data-testid={`visiting-card-${f.key}-input`}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </label>
        ))}
        <div className="flex items-end">
          <button onClick={save} disabled={saving} data-testid="visiting-card-save-btn"
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save & Regenerate
          </button>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <div>
          <img key={`f${v}`} src={src} alt="Visiting card front" data-testid="visiting-card-preview"
            className="w-full rounded-xl border border-slate-200 shadow" loading="lazy" />
          <button onClick={() => download("front")} disabled={dl} data-testid="visiting-card-download-btn"
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border-2 border-amber-400 text-amber-700 text-xs font-semibold hover:bg-amber-50 disabled:opacity-50">
            {dl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Front
          </button>
        </div>
        <div>
          <img key={`b${v}`} src={srcBack} alt="Visiting card back" data-testid="visiting-card-back-preview"
            className="w-full rounded-xl border border-slate-200 shadow" loading="lazy" />
          <button onClick={() => download("back")} disabled={dl} data-testid="visiting-card-back-download-btn"
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border-2 border-amber-400 text-amber-700 text-xs font-semibold hover:bg-amber-50 disabled:opacity-50">
            {dl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Back
          </button>
        </div>
      </div>
    </div>
  );
}
