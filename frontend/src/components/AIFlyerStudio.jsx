import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Wand2, Loader2, Download, Trash2, Store } from "lucide-react";

const TEMPLATES = [
  ["pink_glam", "Pink Glam", "bg-[#c2185b]", "text-yellow-200"],
  ["royal_gold", "Royal Gold", "bg-[#1a1408]", "text-amber-300"],
  ["bridal_blush", "Bridal Blush", "bg-[#f8e3e0]", "text-rose-900"],
  ["emerald_luxe", "Emerald Luxe", "bg-[#0d3326]", "text-amber-200"],
  ["mens_edge", "Men's Edge", "bg-[#241d16]", "text-amber-200"],
  ["festive_sparkle", "Festive Sparkle", "bg-[#5c1010]", "text-yellow-300"],
  ["navy_classic", "Navy Classic", "bg-[#1a2440]", "text-amber-300"],
  ["dark_glam", "Dark Glam", "bg-[#17141c]", "text-amber-200"],
  ["purple_pop", "Purple Pop", "bg-[#5b2ea6]", "text-yellow-300"],
  ["rose_wave", "Rose Wave", "bg-[#f6dfe2]", "text-rose-900"],
];

export const AIFlyerStudio = () => {
  const [template, setTemplate] = useState("pink_glam");
  const [headline, setHeadline] = useState("Festive Special Offer");
  const [offerText, setOfferText] = useState("Get 30% OFF on all services");
  const [services, setServices] = useState("Haircut ₹299, Hair Spa ₹599, Facial ₹499");
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [aboutBusy, setAboutBusy] = useState(false);
  const [aboutText, setAboutText] = useState("");
  const [aboutOffer, setAboutOffer] = useState("Book now and get 20% OFF any service!");
  const [flyers, setFlyers] = useState([]);

  const load = () => { api.get("/offers/flyers").then(r => setFlyers(r.data.flyers)).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      await api.post("/offers/flyer", {
        template, headline, offer_text: offerText, valid_until: validUntil,
        services: services.split(",").map(s => s.trim()).filter(Boolean),
      });
      toast.success("Flyer ready! ✦");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Generation failed — try again"); }
    finally { setBusy(false); }
  };

  const generateAbout = async () => {
    setAboutBusy(true);
    try {
      await api.post("/offers/about-poster", { template, about_text: aboutText, offer_line: aboutOffer }, { timeout: 300000 });
      toast.success("About-Us poster ready — perfect for shop-front printing! ✦");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Generation failed — try again"); }
    finally { setAboutBusy(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this flyer permanently?")) return;
    try { await api.delete(`/offers/flyers/${id}`); toast.success("Flyer deleted — removed from the booking page too"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
  };

  const [expiry, setExpiry] = useState({});

  const togglePublish = async (f) => {
    try {
      if (f.gallery_id) {
        await api.post(`/offers/flyers/${f.id}/unpublish`);
        toast.success("Removed from the public booking page");
      } else {
        await api.post(`/offers/flyers/${f.id}/publish`, { expires_on: expiry[f.id] || null });
        toast.success(expiry[f.id]
          ? `🟢 Live! It will drop off the booking page automatically after ${expiry[f.id]}`
          : "🟢 Live! Showing in 'Current offers' on your booking page (no expiry)");
      }
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Action failed"); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4" data-testid="ai-flyer-studio">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><Wand2 className="w-5 h-5 text-fuchsia-500" /> AI Flyer Studio</h2>
        <p className="text-xs text-slate-500 mt-0.5">Pick a professional template — Mira generates a salon flyer with your name, offer, services and booking link.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TEMPLATES.map(([id, label, bg, txt]) => (
          <button key={id} data-testid={`flyer-template-${id}`} onClick={() => setTemplate(id)}
            className={`rounded-xl p-3 h-20 flex flex-col justify-between text-left border-2 transition ${bg} ${template === id ? "border-fuchsia-400 ring-2 ring-fuchsia-200" : "border-transparent opacity-80 hover:opacity-100"}`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${txt}`}>Aa</span>
            <span className={`text-xs font-semibold ${txt}`}>{label}</span>
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <input value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Headline" data-testid="flyer-headline-input"
          className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
        <input value={offerText} onChange={e => setOfferText(e.target.value)} placeholder="Offer (e.g. 30% OFF)" data-testid="flyer-offer-input"
          className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
        <input value={services} onChange={e => setServices(e.target.value)} placeholder="Services, comma separated" data-testid="flyer-services-input"
          className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
        <input value={validUntil} onChange={e => setValidUntil(e.target.value)} placeholder="Valid until (e.g. 31 July)" data-testid="flyer-valid-input"
          className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
      </div>

      <button onClick={generate} disabled={busy || aboutBusy} data-testid="flyer-generate-btn"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white text-sm font-semibold disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
        {busy ? "Mira is designing… (~30–60s)" : "Generate flyer"}
      </button>

      <div className="border-t border-slate-100 pt-4 space-y-3" data-testid="about-poster-section">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Store className="w-4 h-4 text-fuchsia-500" /> About-Us Poster · A4 shop-front print</h3>
          <p className="text-xs text-slate-500 mt-0.5">Hero model + your logo + About Us story + 3 circular photos (from your gallery, or Mira creates them) + booking details. Uses the template selected above.</p>
        </div>
        <textarea value={aboutText} onChange={e => setAboutText(e.target.value)} rows={2} maxLength={400} data-testid="about-poster-text-input"
          placeholder="Your salon story (leave empty and Mira writes a classy default)"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
        <input value={aboutOffer} onChange={e => setAboutOffer(e.target.value)} maxLength={120} data-testid="about-poster-offer-input"
          placeholder="Offer line (e.g. Book now and get 20% OFF!)"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
        <button onClick={generateAbout} disabled={busy || aboutBusy} data-testid="about-poster-generate-btn"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold disabled:opacity-50">
          {aboutBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
          {aboutBusy ? "Mira is designing your shop poster… (~2 min)" : "Generate About-Us poster (A4)"}
        </button>
      </div>

      {flyers.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {flyers.map(f => (
            <div key={f.id} className="border border-slate-100 rounded-2xl p-2.5" data-testid={`flyer-card-${f.id}`}>
              <img src={f.url} alt={f.headline} className="w-full rounded-xl" loading="lazy" />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-slate-500 truncate">{f.headline} · {f.size_kb}KB</span>
                <div className="flex gap-1.5">
                  <a href={f.url} download={`flyer-${f.id}.jpg`} data-testid={`flyer-download-${f.id}`}
                    className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center"><Download className="w-3.5 h-3.5" /></a>
                  <button onClick={() => del(f.id)} data-testid={`flyer-delete-${f.id}`}
                    className="w-7 h-7 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {!f.gallery_id && (
                <div className="flex items-center gap-1.5 mt-2">
                  <input type="date" data-testid={`flyer-expiry-${f.id}`} value={expiry[f.id] || ""}
                    min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                    onChange={e => setExpiry(x => ({ ...x, [f.id]: e.target.value }))}
                    className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600"
                    title="Optional expiry — the offer drops off the booking page after this day" />
                  <button onClick={() => togglePublish(f)} data-testid={`flyer-publish-${f.id}`}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition">
                    Publish
                  </button>
                </div>
              )}
              {f.gallery_id && (
                <button onClick={() => togglePublish(f)} data-testid={`flyer-publish-${f.id}`}
                  className={`w-full mt-2 py-1.5 rounded-lg text-xs font-semibold border transition ${f.expires_on && f.expires_on < new Date().toISOString().slice(0, 10)
                    ? "bg-slate-50 text-slate-500 border-slate-200 hover:bg-rose-50 hover:text-rose-600"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"}`}>
                  {f.expires_on && f.expires_on < new Date().toISOString().slice(0, 10)
                    ? `⌛ Expired ${f.expires_on} — off the page · tap to clear`
                    : f.expires_on
                      ? `🟢 Live until ${f.expires_on} — tap to remove now`
                      : "🟢 Live on booking page — tap to remove"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
