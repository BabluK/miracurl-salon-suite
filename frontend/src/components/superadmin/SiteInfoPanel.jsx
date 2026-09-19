import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Globe, Loader2, Save, Upload, Instagram, Facebook, Mail, Crown } from "lucide-react";
import { NumberHealthCard } from "@/components/superadmin/NumberHealthCard";

const Input = ({ label, value, onChange, placeholder, testid, icon: Icon }) => (
  <label className="block">
    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
      {Icon && <Icon className="w-3.5 h-3.5" />} {label}
    </span>
    <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      data-testid={testid}
      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-900" />
  </label>
);

export const SiteInfoPanel = () => {
  const [info, setInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setInfo((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    api.get("/public/site-info").then((r) => setInfo(r.data)).catch(() => toast.error("Couldn't load site info"));
  }, []);

  const uploadPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 400 * 1024) { toast.error("Photo must be under 400 KB — please compress it"); return; }
    const reader = new FileReader();
    reader.onload = () => set("ceo_photo")(reader.result);
    reader.readAsDataURL(f);
  };

  const uploadLogo = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 400 * 1024) { toast.error("Logo must be under 400 KB — please compress it"); return; }
    const reader = new FileReader();
    reader.onload = () => set("platform_logo")(reader.result);
    reader.readAsDataURL(f);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/super/site-info", info);
      setInfo(data);
      toast.success("Website info saved — live on the landing page ✦");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't save");
    } finally { setSaving(false); }
  };

  if (!info) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>;

  return (
    <div className="space-y-6" data-testid="site-info-panel">
      <div>
        <h1 className="font-playfair text-3xl flex items-center gap-3"><Globe className="w-7 h-7 text-amber-500" /> Website & CEO</h1>
        <p className="text-slate-500 text-sm mt-1">Contact details, social links and the CEO profile shown on the public landing page.</p>
      </div>
      <NumberHealthCard />

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400" /> Contact & Social</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Contact Email" value={info.contact_email} onChange={set("contact_email")} placeholder="hello@miracurl-suite.com" testid="site-contact-email" icon={Mail} />
          <Input label="WhatsApp Number" value={info.whatsapp} onChange={set("whatsapp")} placeholder="+91 90000 00000" testid="site-whatsapp" />
          <Input label="Instagram URL" value={info.instagram} onChange={set("instagram")} placeholder="https://instagram.com/miracurlsuite" testid="site-instagram" icon={Instagram} />
          <Input label="Facebook URL" value={info.facebook} onChange={set("facebook")} placeholder="https://facebook.com/miracurlsuite" testid="site-facebook" icon={Facebook} />
          <Input label="YouTube URL" value={info.youtube} onChange={set("youtube")} placeholder="https://youtube.com/@miracurlsuite" testid="site-youtube" />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Globe className="w-4 h-4 text-amber-500" /> Platform Logo (HQ console)</h2>
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-full overflow-hidden border border-slate-200 bg-[#1c1c22] flex items-center justify-center">
            <img src={info.platform_logo || "/assets/ms-logo-emblem.png"} alt="logo" className={info.platform_logo ? "w-full h-full object-cover" : "w-11 h-11 object-contain"} data-testid="platform-logo-preview" />
          </div>
          <div>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-slate-50">
              <Upload className="w-3.5 h-3.5" /> Upload logo
              <input type="file" accept="image/*" onChange={uploadLogo} className="hidden" data-testid="platform-logo-input" />
            </label>
            {info.platform_logo && (
              <button onClick={() => set("platform_logo")("")} className="ml-2 text-xs text-rose-500 hover:underline" data-testid="platform-logo-reset">Use default</button>
            )}
            <p className="text-[11px] text-slate-400 mt-1.5">Shown in the Miracurl HQ header. Leave empty to use the default gold MS logo.</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Crown className="w-4 h-4 text-amber-500" /> CEO Profile</h2>
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="shrink-0 text-center">
            <div className="w-32 h-32 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 mx-auto">
              {info.ceo_photo ? (
                <img src={info.ceo_photo} alt="CEO" className="w-full h-full object-cover" data-testid="ceo-photo-preview" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300"><Crown className="w-10 h-10" /></div>
              )}
            </div>
            <label className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-slate-50">
              <Upload className="w-3.5 h-3.5" /> Upload photo
              <input type="file" accept="image/*" onChange={uploadPhoto} className="hidden" data-testid="ceo-photo-input" />
            </label>
          </div>
          <div className="flex-1 grid gap-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Name" value={info.ceo_name} onChange={set("ceo_name")} placeholder="Your name" testid="ceo-name" />
              <Input label="Title" value={info.ceo_title} onChange={set("ceo_title")} placeholder="Founder & CEO, Miracurl Suite" testid="ceo-title" />
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">About</span>
              <textarea value={info.ceo_about || ""} onChange={(e) => set("ceo_about")(e.target.value)} rows={4}
                data-testid="ceo-about"
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-900" />
            </label>
            <div className="grid sm:grid-cols-3 gap-4">
              <Input label="CEO Facebook" value={info.ceo_facebook} onChange={set("ceo_facebook")} placeholder="https://facebook.com/…" testid="ceo-facebook" icon={Facebook} />
              <Input label="CEO Instagram" value={info.ceo_instagram} onChange={set("ceo_instagram")} placeholder="https://instagram.com/…" testid="ceo-instagram" icon={Instagram} />
              <Input label="CEO LinkedIn" value={info.ceo_linkedin} onChange={set("ceo_linkedin")} placeholder="https://linkedin.com/in/…" testid="ceo-linkedin" />
            </div>
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving} data-testid="site-info-save-btn"
        className="inline-flex items-center gap-2 bg-slate-900 text-white font-semibold px-6 py-3 rounded-xl hover:bg-slate-800 disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save & publish
      </button>
    </div>
  );
};
