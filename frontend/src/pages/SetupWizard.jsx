import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import pinApi from "@/lib/ownerPin";
import { toast } from "sonner";
import { Store, Scissors, Users, Clock, ReceiptIndianRupee, Check, ChevronRight, ChevronLeft, Sparkles, Upload, Loader2 } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const STEPS = [
  { key: "profile", label: "Salon Profile", icon: Store },
  { key: "services", label: "Services", icon: Scissors },
  { key: "staff", label: "Staff", icon: Users },
  { key: "hours", label: "Hours", icon: Clock },
  { key: "payment", label: "Tax & Finish", icon: ReceiptIndianRupee },
];

function StepProfile({ onNext }) {
  const [form, setForm] = useState({ phone: "", location: "", whatsapp_number: "" });
  const [logo, setLogo] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api.get("/settings/branding").then(r => setForm(f => ({ ...f, phone: r.data.phone, location: r.data.location, whatsapp_number: r.data.whatsapp_number }))).catch(() => {});
    api.get("/tenants/current").then(r => setLogo(r.data.logo_url || "")).catch(() => {});
  }, []);

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/uploads/image?kind=misc", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await api.post("/branding/logo/apply", { url: data.url });
      setLogo(data.url);
      toast.success("Logo saved");
    } catch (err) { toast.error(err.response?.data?.detail || "Upload failed"); }
    finally { setBusy(""); }
  };

  const aiLogo = async () => {
    setBusy("ai");
    try {
      const { data } = await api.post("/branding/logo/generate", { style: "luxury gold minimal" }, { timeout: 240000 });
      await api.post("/branding/logo/apply", { url: data.url });
      setLogo(data.url);
      toast.success("AI logo created ✦");
    } catch (err) { toast.error(err.response?.data?.detail || "Logo generation failed"); }
    finally { setBusy(""); }
  };

  const save = async () => {
    setBusy("save");
    try {
      await api.put("/settings/branding", {
        phone: form.phone || null, location: form.location || null,
        whatsapp_number: form.whatsapp_number || null,
      });
      onNext();
    } catch (err) { toast.error(err.response?.data?.detail || "Save failed"); }
    finally { setBusy(""); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-slate-50">
          {logo ? <img src={logo.startsWith("http") ? logo : `${BACKEND_URL}${logo}`} alt="Logo" className="w-full h-full object-cover" data-testid="setup-logo-preview" /> : <Store className="w-7 h-7 text-slate-300" />}
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs px-3 py-2 rounded-lg bg-slate-900 text-white font-semibold cursor-pointer inline-flex items-center gap-1.5 w-fit">
            {busy === "upload" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload logo
            <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} data-testid="setup-logo-upload" />
          </label>
          <button onClick={aiLogo} disabled={!!busy} data-testid="setup-logo-ai-btn"
            className="text-xs px-3 py-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 w-fit">
            {busy === "ai" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Generate with AI
          </button>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Salon phone (e.g. +91 98…)"
          className="border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm w-full" data-testid="setup-phone-input" />
        <input value={form.whatsapp_number} onChange={e => setForm({ ...form, whatsapp_number: e.target.value })} placeholder="WhatsApp number"
          className="border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm w-full" data-testid="setup-whatsapp-input" />
        <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Location / area (e.g. Marathahalli, Bengaluru)"
          className="border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm w-full sm:col-span-2" data-testid="setup-location-input" />
      </div>
      <button onClick={save} disabled={busy === "save"} data-testid="setup-profile-next"
        className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
        {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save & Continue <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function StepServices({ onNext }) {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState("");
  const [row, setRow] = useState({ name: "", category: "Women Hair", price: "", duration_min: "30" });

  const refresh = () => api.get("/services").then(r => setCount(r.data.filter(s => s.active !== false).length)).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const importPreset = async () => {
    setBusy("preset");
    try {
      const { data } = await api.post("/services/import-preset");
      toast.success(`${data.added} services added from the salon catalog 🎉`);
      refresh();
    } catch (err) { toast.error(err.response?.data?.detail || "Import failed"); }
    finally { setBusy(""); }
  };

  const addOne = async () => {
    if (!row.name.trim() || !row.price) { toast.error("Service name and price required"); return; }
    setBusy("add");
    try {
      await api.post("/services", { name: row.name.trim(), category: row.category, price: Number(row.price), duration_min: Number(row.duration_min) || 30 });
      toast.success(`${row.name} added`);
      setRow({ ...row, name: "", price: "" });
      refresh();
    } catch (err) { toast.error(err.response?.data?.detail || "Add failed"); }
    finally { setBusy(""); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-800">Quick start: import our ready-made salon menu</p>
          <p className="text-xs text-slate-500 mt-0.5">25+ popular services (hair, skin, mani-pedi) with typical prices — edit anytime later.</p>
        </div>
        <button onClick={importPreset} disabled={!!busy} data-testid="setup-import-preset-btn"
          className="text-xs px-4 py-2.5 rounded-xl bg-fuchsia-600 text-white font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy === "preset" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Import preset services
        </button>
      </div>
      <div className="grid sm:grid-cols-4 gap-2">
        <input value={row.name} onChange={e => setRow({ ...row, name: e.target.value })} placeholder="Service name"
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm" data-testid="setup-service-name" />
        <select value={row.category} onChange={e => setRow({ ...row, category: e.target.value })}
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm" data-testid="setup-service-category">
          {["Women Hair", "Men Hair", "Skin", "Manicure", "Pedicure", "Makeup", "Spa"].map(c => <option key={c}>{c}</option>)}
        </select>
        <input value={row.price} onChange={e => setRow({ ...row, price: e.target.value })} placeholder="Price ₹" type="number"
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm" data-testid="setup-service-price" />
        <button onClick={addOne} disabled={!!busy} data-testid="setup-service-add-btn"
          className="px-3 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">+ Add</button>
      </div>
      <p className="text-xs text-slate-500" data-testid="setup-services-count">{count} services in your menu</p>
      <button onClick={onNext} data-testid="setup-services-next"
        className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold inline-flex items-center gap-1.5">
        Continue <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function StepStaff({ onNext }) {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [row, setRow] = useState({ name: "", role: "Stylist", phone: "" });

  const refresh = () => api.get("/staff").then(r => setCount((r.data || []).filter(s => s.active !== false).length)).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const addOne = async () => {
    if (!row.name.trim() || !row.phone.trim()) { toast.error("Name and phone required"); return; }
    setBusy(true);
    try {
      await pinApi.post("/staff", { name: row.name.trim(), role: row.role, phone: row.phone.trim() });
      toast.success(`${row.name} added to your team`);
      setRow({ name: "", role: row.role, phone: "" });
      refresh();
    } catch (err) { toast.error(err.response?.data?.detail || "Add failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-4 gap-2">
        <input value={row.name} onChange={e => setRow({ ...row, name: e.target.value })} placeholder="Staff name"
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm" data-testid="setup-staff-name" />
        <select value={row.role} onChange={e => setRow({ ...row, role: e.target.value })}
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm" data-testid="setup-staff-role">
          {["Stylist", "Beautician", "Manager", "Receptionist", "Helper"].map(r => <option key={r}>{r}</option>)}
        </select>
        <input value={row.phone} onChange={e => setRow({ ...row, phone: e.target.value })} placeholder="Phone"
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm" data-testid="setup-staff-phone" />
        <button onClick={addOne} disabled={busy} data-testid="setup-staff-add-btn"
          className="px-3 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">+ Add</button>
      </div>
      <p className="text-xs text-slate-500" data-testid="setup-staff-count">{count} team members added</p>
      <button onClick={onNext} data-testid="setup-staff-next"
        className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold inline-flex items-center gap-1.5">
        Continue <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function StepHours({ onNext }) {
  const [hours, setHours] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/settings/branding").then(r => setHours(r.data.hours || "")).catch(() => {}); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/settings/branding", { hours: hours || "Mon-Sun 10:00 AM - 9:00 PM" });
      onNext();
    } catch (err) { toast.error(err.response?.data?.detail || "Save failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <input value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. Mon-Sun 10:00 AM - 9:00 PM"
        className="border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm w-full max-w-md" data-testid="setup-hours-input" />
      <div className="flex flex-wrap gap-2">
        {["Mon-Sun 10:00 AM - 9:00 PM", "Mon-Sat 9:30 AM - 8:30 PM (Sun off)", "Daily 11:00 AM - 10:00 PM"].map(h => (
          <button key={h} onClick={() => setHours(h)} className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:border-fuchsia-400">{h}</button>
        ))}
      </div>
      <button onClick={save} disabled={busy} data-testid="setup-hours-next"
        className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold inline-flex items-center gap-1.5">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save & Continue <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function StepPayment({ onFinish }) {
  const [tax, setTax] = useState({ tax_enabled: false, gst_number: "", gst_legal_name: "", tax_pct: 18 });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/settings/tax").then(r => setTax(t => ({ ...t, ...r.data, tax_pct: r.data.tax_pct || 18 }))).catch(() => {}); }, []);

  const finish = async () => {
    setBusy(true);
    try {
      if (tax.tax_enabled) {
        await api.put("/settings/tax", { tax_enabled: true, gst_number: tax.gst_number, gst_legal_name: tax.gst_legal_name || null, tax_pct: Number(tax.tax_pct) });
      } else {
        await api.post("/setup/payment-done");
      }
      await api.post("/setup/complete");
      onFinish();
    } catch (err) { toast.error(err.response?.data?.detail || "Save failed"); setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" checked={tax.tax_enabled} onChange={e => setTax({ ...tax, tax_enabled: e.target.checked })}
          className="w-4 h-4 accent-fuchsia-600" data-testid="setup-tax-toggle" />
        Charge GST on invoices
      </label>
      {tax.tax_enabled && (
        <div className="grid sm:grid-cols-3 gap-2">
          <input value={tax.gst_number || ""} onChange={e => setTax({ ...tax, gst_number: e.target.value })} placeholder="GSTIN (15 chars)"
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm" data-testid="setup-gst-input" />
          <input value={tax.gst_legal_name || ""} onChange={e => setTax({ ...tax, gst_legal_name: e.target.value })} placeholder="Legal business name"
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
          <input value={tax.tax_pct} onChange={e => setTax({ ...tax, tax_pct: e.target.value })} type="number" placeholder="Tax %"
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm" data-testid="setup-tax-pct" />
        </div>
      )}
      <button onClick={finish} disabled={busy} data-testid="setup-finish-btn"
        className="px-6 py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Finish setup — my salon is live!
      </button>
    </div>
  );
}

export default function SetupWizard() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const finish = () => {
    toast.success("🎉 Your salon is fully set up!");
    navigate("/");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="setup-wizard-page">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New Salon Setup</h1>
        <p className="text-slate-500 text-sm mt-1">5 quick steps and your salon is ready to take bookings.</p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <button key={s.key} onClick={() => setStep(i)} data-testid={`setup-step-tab-${s.key}`}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border transition-colors ${
                i === step ? "bg-slate-900 text-white border-slate-900" : i < step ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-slate-500 border-slate-200"}`}>
              {i < step ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />} {s.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Step {step + 1}: {STEPS[step].label}</h2>
        {step === 0 && <StepProfile onNext={next} />}
        {step === 1 && <StepServices onNext={next} />}
        {step === 2 && <StepStaff onNext={next} />}
        {step === 3 && <StepHours onNext={next} />}
        {step === 4 && <StepPayment onFinish={finish} />}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
          className="text-xs text-slate-500 inline-flex items-center gap-1 disabled:opacity-30" data-testid="setup-back-btn">
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>
        <button onClick={() => navigate("/")} className="text-xs text-slate-400 hover:text-slate-600" data-testid="setup-skip-btn">
          Skip for now — I&apos;ll finish later
        </button>
      </div>
    </div>
  );
}
