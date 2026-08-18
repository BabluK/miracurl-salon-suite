import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Store, Star, Instagram, MessageCircle, Save } from "lucide-react";

const EMPTY = { google_review_url: "", maps_url: "", hours: "", open_time: "10:00", close_time: "21:00", phone: "", location: "", hero_image: "", instagram_url: "", whatsapp_number: "", reception_phone: "", manager_phone: "" };

const TIME_OPTS = Array.from({ length: 36 }, (_, i) => {
  const m = 6 * 60 + i * 30; // 06:00 → 23:30
  const h = Math.floor(m / 60), mm = m % 60;
  const label = `${(h % 12) || 12}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return { value: `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, label };
});
const inputCls = "mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200";

function flattenDetail(raw, fallback) {
  if (Array.isArray(raw)) {
    return raw.map((err) => {
      const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : "field";
      const clean = String(err.msg || "").replace(/^Value error,?\s*/i, "");
      return `${field}: ${clean}`;
    }).join(" · ");
  }
  return typeof raw === "string" ? raw : fallback;
}

export function BrandingCard() {
  const [branding, setBranding] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings/branding").then(r => {
      if (r.data) setBranding(Object.fromEntries(Object.keys(EMPTY).map(k => [k, r.data[k] || ""])));
    }).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data } = await api.put("/settings/branding", branding);
      // Re-sync with server-normalized values (e.g. whatsapp digits-only)
      if (data) setBranding(b => Object.fromEntries(Object.keys(EMPTY).map(k => [k, data[k] ?? b[k]])));
      toast.success("Salon Profile saved successfully ✦");
    } catch (e) {
      toast.error(flattenDetail(e?.response?.data?.detail, e?.message || "Couldn't save profile"));
    } finally { setSaving(false); }
  }

  const field = (key) => ({ value: branding[key], onChange: (e) => setBranding(b => ({ ...b, [key]: e.target.value })), className: inputCls });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="settings-branding-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
          <Store className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">Salon profile</h2>
          <p className="text-xs text-slate-500 mt-1">
            These details show on your public booking page and review pages. Keep them up to date so customers find you easily.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        <div className="md:col-span-2">
          <label className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> Google review link
          </label>
          <input data-testid="settings-google-review-url" placeholder="https://g.page/r/your-business/review" {...field("google_review_url")} />
          <p className="text-[11px] text-slate-400 mt-1">
            Get this from Google Business Profile → <i>Get more reviews</i> → copy short link. 4★+ customers will see a one-tap CTA to leave you a Google review.
          </p>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" /> Google Maps location link (main salon)
          </label>
          <input data-testid="settings-maps-url" placeholder="https://maps.app.goo.gl/…" {...field("maps_url")} />
          <p className="text-[11px] text-slate-400 mt-1">
            Open your salon on Google Maps → <i>Share</i> → copy link. Shown as the “Get Directions” button in the <b>Our Locations</b> section of your booking page.
          </p>
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Working hours</label>
          <input data-testid="settings-hours" placeholder="Mon–Sun · 10:00 AM – 9:00 PM" {...field("hours")} />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Booking slots — Open & Close time</label>
          <div className="flex gap-2">
            <select data-testid="settings-open-time" {...field("open_time")}>
              {TIME_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select data-testid="settings-close-time" {...field("close_time")}>
              {TIME_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">The public booking page only offers slots inside these hours.</p>
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Phone</label>
          <input data-testid="settings-phone" placeholder="+91 98765 00000" {...field("phone")} />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Receptionist number</label>
          <input data-testid="settings-reception-phone" placeholder="+91 98765 11111" {...field("reception_phone")} />
          <p className="text-[10px] text-slate-400 mt-1">Mira connects guests here when they ask for a human.</p>
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Manager number</label>
          <input data-testid="settings-manager-phone" placeholder="+91 98765 22222" {...field("manager_phone")} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-slate-500 font-medium">Location / Address</label>
          <input data-testid="settings-location" placeholder="Marathahalli, Bangalore" {...field("location")} />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <Instagram className="w-3.5 h-3.5 text-fuchsia-500" /> Instagram URL
          </label>
          <input data-testid="settings-instagram-url" placeholder="https://www.instagram.com/your_handle/" {...field("instagram_url")} />
          <p className="text-[11px] text-slate-400 mt-1">Shown as an icon on your public booking page.</p>
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5 text-emerald-500" /> WhatsApp number
          </label>
          <input data-testid="settings-whatsapp-number" placeholder="+91 98765 43210" {...field("whatsapp_number")} />
          <p className="text-[11px] text-slate-400 mt-1">Include country code. Powers the &quot;Chat on WhatsApp&quot; button.</p>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-slate-500 font-medium">Hero image URL</label>
          <input data-testid="settings-hero-image" placeholder="https://images.unsplash.com/photo-..." {...field("hero_image")} />
          <p className="text-[11px] text-slate-400 mt-1">Shows at the top of your public booking page. Paste any Unsplash, your salon&apos;s Instagram image, or upload to imgur and use that URL.</p>
        </div>
      </div>

      <div className="flex justify-end mt-6">
        <button
          data-testid="settings-save-branding-btn"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold text-sm hover:from-violet-600 hover:to-fuchsia-600 shadow-sm disabled:opacity-60"
        >
          <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}
