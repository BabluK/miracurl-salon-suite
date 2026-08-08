import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Instagram, Facebook, MessageSquare, MapPin, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { WHO_CAN_USE } from "./Landing";
import { SiteHeader } from "@/components/SiteHeader";
import SalesChatWidget from "@/components/SalesChatWidget";

const Field = ({ label, value, onChange, placeholder, type = "text", testid }) => (
  <label className="block">
    <span className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">{label}</span>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      data-testid={testid} style={{ backgroundColor: "#fff", color: "#0f172a" }}
      className="mt-1.5 w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500" />
  </label>
);

export default function ContactUs() {
  const [site, setSite] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", salon_name: "", city: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    api.get("/public/site-info").then((r) => setSite(r.data)).catch(() => {});
    window.scrollTo(0, 0);
  }, []);

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      toast.error("Please fill your name, email and phone");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/public/demo-request", { ...form, source: "contact_us_page" });
      toast.success(data.message || "Thanks! We'll reach out shortly ✦");
      setForm({ name: "", email: "", phone: "", salon_name: "", city: "" });
    } catch (e) {
      toast.error(e.response?.data?.detail?.[0]?.msg || e.response?.data?.detail || "Couldn't send — please email us instead");
    } finally { setBusy(false); }
  };

  const Card = ({ children }) => (
    <div className="rounded-3xl border border-[#e9d9ae] bg-white/80 backdrop-blur p-8 shadow-[0_20px_60px_-30px_rgba(184,134,59,0.35)]">{children}</div>
  );

  return (
    <div className="min-h-screen relative overflow-hidden bg-white text-slate-800 font-outfit" data-testid="contact-us-page">
      <SiteHeader variant="light" site={site} />
      <SalesChatWidget />
      {/* rose-gold blobs — same language as staff registry */}
      <div className="pointer-events-none absolute -right-32 -top-24 w-[480px] h-[480px] rounded-full opacity-30"
        style={{ background: "radial-gradient(circle at 30% 30%, #f5d78e, #e8918f 55%, transparent 75%)" }} />
      <div className="pointer-events-none absolute -left-40 bottom-0 w-[520px] h-[520px] rounded-full opacity-25"
        style={{ background: "radial-gradient(circle at 60% 40%, #e8b96a, #ec4899 60%, transparent 80%)" }} />

      <main className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 py-14 sm:py-16">
        <span className="text-xs uppercase tracking-[0.25em] text-[#a87e2f] font-semibold">Contact Us</span>
        <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl font-light mt-4 text-slate-900">We'd love to hear from you</h1>
        <p className="text-slate-600 mt-4 max-w-2xl">Questions, demos, partnerships — reach us any way you like, and we'll get back within a few hours.</p>

        <div className="grid lg:grid-cols-2 gap-10 mt-12">
          <div className="space-y-8">
            <Card>
              <div className="space-y-5">
                <a href={`mailto:${site?.contact_email || "admin@miracurl-suite.com"}`} data-testid="contact-page-email"
                  className="flex items-center gap-3 text-slate-800 hover:text-[#a87e2f] transition-colors">
                  <span className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center"><Mail className="w-5 h-5 text-[#b8863b]" /></span>
                  <span><span className="block text-xs text-slate-400 uppercase tracking-wide">Email</span>{site?.contact_email || "admin@miracurl-suite.com"}</span>
                </a>
                {site?.whatsapp && (
                  <a href={`https://wa.me/${(site.whatsapp || "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer" data-testid="contact-page-whatsapp"
                    className="flex items-center gap-3 text-slate-800 hover:text-emerald-600 transition-colors">
                    <span className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center"><MessageSquare className="w-5 h-5 text-emerald-500" /></span>
                    <span><span className="block text-xs text-slate-400 uppercase tracking-wide">WhatsApp</span>{site.whatsapp}</span>
                  </a>
                )}
                {site?.instagram && (
                  <a href={site.instagram} target="_blank" rel="noreferrer" data-testid="contact-page-instagram"
                    className="flex items-center gap-3 text-slate-800 hover:text-[#E35A89] transition-colors">
                    <span className="w-11 h-11 rounded-2xl bg-pink-50 border border-pink-200 flex items-center justify-center"><Instagram className="w-5 h-5 text-[#E35A89]" /></span>
                    <span><span className="block text-xs text-slate-400 uppercase tracking-wide">Instagram</span>Follow us</span>
                  </a>
                )}
                {site?.facebook && (
                  <a href={site.facebook} target="_blank" rel="noreferrer" data-testid="contact-page-facebook"
                    className="flex items-center gap-3 text-slate-800 hover:text-sky-600 transition-colors">
                    <span className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center"><Facebook className="w-5 h-5 text-sky-500" /></span>
                    <span><span className="block text-xs text-slate-400 uppercase tracking-wide">Facebook</span>Like our page</span>
                  </a>
                )}
                <div className="flex items-center gap-3 text-slate-700">
                  <span className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center"><MapPin className="w-5 h-5 text-[#E35A89]" /></span>
                  <span><span className="block text-xs text-slate-400 uppercase tracking-wide">Office</span>Marathahalli, Bangalore, India</span>
                </div>
              </div>
            </Card>

            <Card>
              <span className="text-xs uppercase tracking-[0.25em] text-emerald-600 font-semibold">Who can use Miracurl Suite</span>
              <div className="mt-4 flex flex-wrap gap-2" data-testid="contact-who-can-use">
                {WHO_CAN_USE.map((w) => (
                  <span key={w} className="text-xs px-3 py-1.5 rounded-full border border-[#e9d9ae] bg-amber-50/60 text-[#8a6420]">{w}</span>
                ))}
              </div>
            </Card>
          </div>

          <div className="rounded-3xl border border-[#e9d9ae] p-8 h-fit bg-gradient-to-br from-amber-50/80 to-white shadow-[0_20px_60px_-30px_rgba(184,134,59,0.4)]">
            <h2 className="font-playfair text-2xl font-light text-slate-900">Request a callback</h2>
            <p className="text-slate-500 text-sm mt-2">Tell us about your business — our team will call you with a free demo.</p>
            <div className="mt-6 space-y-4">
              <Field label="Your Name" value={form.name} onChange={set("name")} placeholder="Full name" testid="contact-form-name" />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Email" value={form.email} onChange={set("email")} placeholder="you@example.com" type="email" testid="contact-form-email" />
                <Field label="Phone" value={form.phone} onChange={set("phone")} placeholder="+91 …" testid="contact-form-phone" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Business Name" value={form.salon_name} onChange={set("salon_name")} placeholder="Salon / spa / boutique" testid="contact-form-salon" />
                <Field label="City" value={form.city} onChange={set("city")} placeholder="Bangalore" testid="contact-form-city" />
              </div>
              <button onClick={submit} disabled={busy} data-testid="contact-form-submit"
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#1c160c] font-bold hover:brightness-110 disabled:opacity-50 transition-all">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send message
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-[#e9d9ae]/60 py-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Miracurl Suite · Manage. Automate. Grow. ·{" "}
        <Link to="/" className="hover:text-slate-700 transition-colors">Back to Home</Link>
      </footer>
    </div>
  );
}
