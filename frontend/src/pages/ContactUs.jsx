import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Instagram, Facebook, MessageSquare, MapPin, ArrowLeft, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { LogoLockup, WHO_CAN_USE } from "./Landing";

const Field = ({ label, value, onChange, placeholder, type = "text", testid }) => (
  <label className="block">
    <span className="text-xs uppercase tracking-[0.2em] text-white/50 font-semibold">{label}</span>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      data-testid={testid}
      className="mt-1.5 w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#DFB78C]/60" />
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

  return (
    <div className="min-h-screen bg-[#050505] text-white font-outfit" data-testid="contact-us-page">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-black/70 border-b border-[#DFB78C]/15">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 py-3.5 flex items-center justify-between">
          <LogoLockup />
          <div className="flex items-center gap-4 text-sm">
            <Link to="/" className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors" data-testid="contact-back-home">
              <ArrowLeft className="w-4 h-4" /> Home
            </Link>
            <Link to="/signup-salon"
              className="px-4 py-2 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#050505] text-xs sm:text-sm font-bold shadow-[0_8px_24px_-6px_rgba(223,183,140,0.5)]">
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 sm:px-10 py-16 sm:py-20">
        <span className="text-xs uppercase tracking-[0.25em] text-[#DFB78C] font-semibold">Contact Us</span>
        <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl font-light mt-4">We'd love to hear from you</h1>
        <p className="text-white/60 mt-4 max-w-2xl">Questions, demos, partnerships — reach us any way you like, and we'll get back within a few hours.</p>

        <div className="grid lg:grid-cols-2 gap-10 mt-12">
          <div className="space-y-8">
            <div className="rounded-3xl border border-[#DFB78C]/20 p-8 space-y-5"
              style={{ background: "linear-gradient(135deg, rgba(223,183,140,0.07) 0%, rgba(5,5,5,0.4) 60%)" }}>
              <a href={`mailto:${site?.contact_email || "admin@miracurl-suite.com"}`} data-testid="contact-page-email"
                className="flex items-center gap-3 text-white/85 hover:text-[#DFB78C] transition-colors">
                <span className="w-11 h-11 rounded-2xl bg-[#DFB78C]/15 border border-[#DFB78C]/30 flex items-center justify-center"><Mail className="w-5 h-5 text-[#DFB78C]" /></span>
                <span><span className="block text-xs text-white/40 uppercase tracking-wide">Email</span>{site?.contact_email || "admin@miracurl-suite.com"}</span>
              </a>
              {site?.whatsapp && (
                <a href={`https://wa.me/${(site.whatsapp || "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer" data-testid="contact-page-whatsapp"
                  className="flex items-center gap-3 text-white/85 hover:text-emerald-300 transition-colors">
                  <span className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center"><MessageSquare className="w-5 h-5 text-emerald-400" /></span>
                  <span><span className="block text-xs text-white/40 uppercase tracking-wide">WhatsApp</span>{site.whatsapp}</span>
                </a>
              )}
              {site?.instagram && (
                <a href={site.instagram} target="_blank" rel="noreferrer" data-testid="contact-page-instagram"
                  className="flex items-center gap-3 text-white/85 hover:text-[#E35A89] transition-colors">
                  <span className="w-11 h-11 rounded-2xl bg-[#E35A89]/10 border border-[#E35A89]/30 flex items-center justify-center"><Instagram className="w-5 h-5 text-[#E35A89]" /></span>
                  <span><span className="block text-xs text-white/40 uppercase tracking-wide">Instagram</span>Follow us</span>
                </a>
              )}
              {site?.facebook && (
                <a href={site.facebook} target="_blank" rel="noreferrer" data-testid="contact-page-facebook"
                  className="flex items-center gap-3 text-white/85 hover:text-sky-300 transition-colors">
                  <span className="w-11 h-11 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center"><Facebook className="w-5 h-5 text-sky-400" /></span>
                  <span><span className="block text-xs text-white/40 uppercase tracking-wide">Facebook</span>Like our page</span>
                </a>
              )}
              <div className="flex items-center gap-3 text-white/70">
                <span className="w-11 h-11 rounded-2xl bg-white/5 border border-white/15 flex items-center justify-center"><MapPin className="w-5 h-5 text-[#E35A89]" /></span>
                <span><span className="block text-xs text-white/40 uppercase tracking-wide">Office</span>Marathahalli, Bangalore, India</span>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 p-8">
              <span className="text-xs uppercase tracking-[0.25em] text-emerald-300 font-semibold">Who can use Miracurl Suite</span>
              <div className="mt-4 flex flex-wrap gap-2" data-testid="contact-who-can-use">
                {WHO_CAN_USE.map((w) => (
                  <span key={w} className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-white/70">{w}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[#DFB78C]/20 p-8 h-fit"
            style={{ background: "linear-gradient(135deg, rgba(227,90,137,0.06) 0%, rgba(5,5,5,0.4) 60%)" }}>
            <h2 className="font-playfair text-2xl font-light">Request a callback</h2>
            <p className="text-white/50 text-sm mt-2">Tell us about your business — our team will call you with a free demo.</p>
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
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#050505] font-bold hover:brightness-110 disabled:opacity-50 transition-all">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send message
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-white/40">
        © {new Date().getFullYear()} Miracurl Suite · Manage. Automate. Grow. ·{" "}
        <Link to="/" className="hover:text-white transition-colors">Back to Home</Link>
      </footer>
    </div>
  );
}
