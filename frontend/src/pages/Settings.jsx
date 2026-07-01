import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Receipt, Save, ShieldCheck, Info, Gift, Copy, Share2, Wallet, Star, Store, Instagram, MessageCircle, CreditCard, Check, Sparkles, Loader2 } from "lucide-react";

export default function Settings() {
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [gstNumber, setGstNumber] = useState("");
  const [gstLegalName, setGstLegalName] = useState("");
  const [taxPct, setTaxPct] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [affiliate, setAffiliate] = useState(null);
  const [branding, setBranding] = useState({ google_review_url: "", hours: "", phone: "", location: "", hero_image: "", instagram_url: "", whatsapp_number: "" });
  const [savingBrand, setSavingBrand] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/settings/tax"),
      api.get("/settings/affiliate").catch(() => ({ data: null })),
      api.get("/settings/branding").catch(() => ({ data: null })),
    ])
      .then(([taxRes, affRes, brandRes]) => {
        setTaxEnabled(!!taxRes.data.tax_enabled);
        setGstNumber(taxRes.data.gst_number || "");
        setGstLegalName(taxRes.data.gst_legal_name || "");
        setTaxPct(Number(taxRes.data.tax_pct || 0));
        if (affRes.data) setAffiliate(affRes.data);
        if (brandRes.data) setBranding({
          google_review_url: brandRes.data.google_review_url || "",
          hours: brandRes.data.hours || "",
          phone: brandRes.data.phone || "",
          location: brandRes.data.location || "",
          hero_image: brandRes.data.hero_image || "",
          instagram_url: brandRes.data.instagram_url || "",
          whatsapp_number: brandRes.data.whatsapp_number || "",
        });
      })
      .catch(e => toast.error(e.response?.data?.detail || "Couldn't load settings"))
      .finally(() => setLoading(false));
  }, []);

  async function saveBranding() {
    setSavingBrand(true);
    try {
      const { data } = await api.put("/settings/branding", branding);
      // Re-sync with the server's normalized values (e.g. whatsapp_number is
      // stripped to digits by the backend validator). Without this, the field
      // still shows the pre-normalized text and the owner thinks "it didn't save".
      if (data) {
        setBranding((b) => ({
          ...b,
          google_review_url: data.google_review_url ?? b.google_review_url,
          hours: data.hours ?? b.hours,
          phone: data.phone ?? b.phone,
          location: data.location ?? b.location,
          hero_image: data.hero_image ?? b.hero_image,
          instagram_url: data.instagram_url ?? b.instagram_url,
          whatsapp_number: data.whatsapp_number ?? b.whatsapp_number,
        }));
      }
      toast.success(`Salon profile updated ✦${data?.phone ? `  📞 ${data.phone}` : ""}${data?.whatsapp_number ? `  💬 ${data.whatsapp_number}` : ""}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't save profile");
    } finally { setSavingBrand(false); }
  }

  async function save() {
    if (taxEnabled) {
      if (!gstNumber.trim()) { toast.error("Enter your GSTIN to enable tax"); return; }
      if (!Number(taxPct) || taxPct <= 0) { toast.error("Set a tax % greater than 0"); return; }
    }
    setSaving(true);
    try {
      await api.put("/settings/tax", {
        tax_enabled: taxEnabled,
        gst_number: gstNumber.trim() || null,
        gst_legal_name: gstLegalName.trim() || null,
        tax_pct: Number(taxPct) || 0,
      });
      toast.success(taxEnabled ? "Tax enabled — invoices will charge GST" : "Tax disabled — invoices have no GST");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't save settings");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;

  return (
    <div className="bg-slate-50 -mx-8 -my-8 px-8 py-8 min-h-[calc(100vh-4rem)]" data-testid="settings-page">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-slate-800">Salon Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure how billing, tax and your business identity behave on invoices.</p>

        {/* Salon Profile / Branding */}
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
              <input
                data-testid="settings-google-review-url"
                value={branding.google_review_url}
                onChange={e => setBranding(b => ({ ...b, google_review_url: e.target.value }))}
                placeholder="https://g.page/r/your-business/review"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Get this from Google Business Profile → <i>Get more reviews</i> → copy short link. 4★+ customers will see a one-tap CTA to leave you a Google review.
              </p>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium">Working hours</label>
              <input
                data-testid="settings-hours"
                value={branding.hours}
                onChange={e => setBranding(b => ({ ...b, hours: e.target.value }))}
                placeholder="Mon–Sun · 10:00 AM – 9:00 PM"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium">Phone</label>
              <input
                data-testid="settings-phone"
                value={branding.phone}
                onChange={e => setBranding(b => ({ ...b, phone: e.target.value }))}
                placeholder="+91 98765 00000"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-slate-500 font-medium">Location / Address</label>
              <input
                data-testid="settings-location"
                value={branding.location}
                onChange={e => setBranding(b => ({ ...b, location: e.target.value }))}
                placeholder="Marathahalli, Bangalore"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <Instagram className="w-3.5 h-3.5 text-fuchsia-500" /> Instagram URL
              </label>
              <input
                data-testid="settings-instagram-url"
                value={branding.instagram_url}
                onChange={e => setBranding(b => ({ ...b, instagram_url: e.target.value }))}
                placeholder="https://www.instagram.com/your_handle/"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
              <p className="text-[11px] text-slate-400 mt-1">Shown as an icon on your public booking page.</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-emerald-500" /> WhatsApp number
              </label>
              <input
                data-testid="settings-whatsapp-number"
                value={branding.whatsapp_number}
                onChange={e => setBranding(b => ({ ...b, whatsapp_number: e.target.value }))}
                placeholder="+91 98765 43210"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
              <p className="text-[11px] text-slate-400 mt-1">Include country code. Powers the &quot;Chat on WhatsApp&quot; button.</p>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-slate-500 font-medium">Hero image URL</label>
              <input
                data-testid="settings-hero-image"
                value={branding.hero_image}
                onChange={e => setBranding(b => ({ ...b, hero_image: e.target.value }))}
                placeholder="https://images.unsplash.com/photo-..."
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
              <p className="text-[11px] text-slate-400 mt-1">Shows at the top of your public booking page. Paste any Unsplash, your salon&apos;s Instagram image, or upload to imgur and use that URL.</p>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button
              data-testid="settings-save-branding-btn"
              onClick={saveBranding}
              disabled={savingBrand}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold text-sm hover:from-violet-600 hover:to-fuchsia-600 shadow-sm disabled:opacity-60"
            >
              <Save className="w-4 h-4" /> {savingBrand ? "Saving…" : "Save profile"}
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-800">Tax / GST on invoices</h2>
              <p className="text-xs text-slate-500 mt-1">
                By default, invoices do <b>not</b> charge any tax. Only enable this if your salon is GST registered and you intend to collect GST from guests.
              </p>
            </div>
          </div>

          <label className="flex items-center justify-between gap-4 mt-6 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div>
              <div className="font-medium text-slate-800 text-sm">Enable tax on invoices</div>
              <div className="text-xs text-slate-500 mt-0.5">When on, every POS invoice will add GST at the rate below.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={taxEnabled}
              data-testid="settings-tax-toggle"
              onClick={() => setTaxEnabled(v => !v)}
              className={`relative inline-flex h-6 w-11 rounded-full transition ${taxEnabled ? "bg-sky-500" : "bg-slate-300"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition mt-0.5 ${taxEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </label>

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 transition ${taxEnabled ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
            <div>
              <label className="text-xs text-slate-500 font-medium">GSTIN *</label>
              <input
                data-testid="settings-gstin"
                value={gstNumber}
                onChange={e => setGstNumber(e.target.value.toUpperCase())}
                placeholder="29ABCDE1234F1Z5"
                maxLength={15}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 font-mono uppercase tracking-wider"
              />
              <p className="text-[11px] text-slate-400 mt-1">15-character GST identification number</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium">Legal name (as on GSTIN)</label>
              <input
                data-testid="settings-gst-legal-name"
                value={gstLegalName}
                onChange={e => setGstLegalName(e.target.value)}
                placeholder="Your Salon Pvt Ltd"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium">Tax rate (%) *</label>
              <input
                data-testid="settings-tax-pct"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={taxPct}
                onChange={e => setTaxPct(e.target.value)}
                placeholder="18"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
              <p className="text-[11px] text-slate-400 mt-1">Salon services in India are typically 18% GST.</p>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              {taxEnabled ? (
                <>Tax will be added at <b>{Number(taxPct || 0).toFixed(2)}%</b> on every invoice. Guests will see a clear GST line.</>
              ) : (
                <>Tax is currently <b>off</b>. Invoices will show only Subtotal, Discount and Total. You can switch this on anytime.</>
              )}
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button
              data-testid="settings-save-btn"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-sky-500 to-blue-500 text-white font-semibold text-sm hover:from-sky-600 hover:to-blue-600 shadow-sm disabled:opacity-60"
            >
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>

        {affiliate && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="settings-affiliate-card">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
                <Gift className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-slate-800">Refer & Earn ₹1,000</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Share your unique link below. Every salon that signs up using it gets a 7-day free trial — and you get
                  <b className="text-rose-600"> ₹{Number(affiliate.reward_per_signup).toLocaleString("en-IN")}</b> credited to your renewal balance.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
              <div className="md:col-span-1 bg-gradient-to-br from-rose-50 to-fuchsia-50 border border-rose-100 rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-rose-700 font-semibold">
                  <Wallet className="w-3.5 h-3.5" /> Your balance
                </div>
                <div className="text-3xl font-bold text-slate-900 mt-2" data-testid="settings-affiliate-balance">
                  ₹{Number(affiliate.credits || 0).toLocaleString("en-IN")}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">{affiliate.count} salon{affiliate.count === 1 ? "" : "s"} referred so far</div>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-slate-500 font-medium">Your referral link</label>
                <AffiliateLinkRow slug={affiliate.slug} />
                <p className="text-[11px] text-slate-400 mt-2">Tip: post this in salon-owner WhatsApp groups, on your Instagram bio, or DM friends who run salons.</p>
              </div>
            </div>

            {affiliate.referrals && affiliate.referrals.length > 0 && (
              <div className="mt-6">
                <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Recent signups via your link</div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Salon</th>
                        <th className="text-left px-3 py-2 font-medium">Signed up</th>
                        <th className="text-right px-3 py-2 font-medium">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {affiliate.referrals.slice(0, 8).map(r => (
                        <tr key={r.id} className="border-t border-slate-100" data-testid={`affiliate-row-${r.referred_slug}`}>
                          <td className="px-3 py-2 text-slate-800">
                            {r.referred_salon_name}
                            <div className="text-[11px] text-slate-500">{r.referred_slug}</div>
                          </td>
                          <td className="px-3 py-2 text-slate-600 text-xs">
                            {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="px-3 py-2 text-right text-emerald-600 font-semibold">+₹{Number(r.credit_amount).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <RazorpayCard />

        <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Data isolation</h2>
              <p className="text-xs text-slate-500 mt-1">
                Your salon&apos;s customers, invoices and staff are isolated by tenant ID and never visible to other salons on Miracurl.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AffiliateLinkRow({ slug }) {
  const link = `${window.location.origin}/?ref=${slug}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied — share it anywhere");
    } catch {
      toast.error("Couldn't copy. Long-press the link to copy manually.");
    }
  };
  const share = async () => {
    const text = `Move your salon online with Miracurl — 7-day free trial, no card needed. Sign up using my link: ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Miracurl Salon Suite", text, url: link });
        return;
      } catch (err) {
        // User dismissed the native share sheet (AbortError) or it's unsupported.
        // Fall through to the WhatsApp fallback below — no toast needed.
        if (err?.name && err.name !== "AbortError") {
          console.warn("[share] navigator.share failed:", err.message);
        }
      }
    }
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="mt-1 flex items-center gap-2">
      <input
        readOnly
        value={link}
        data-testid="settings-affiliate-link"
        className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-sm font-mono"
        onFocus={e => e.target.select()}
      />
      <button
        type="button"
        onClick={copy}
        data-testid="settings-affiliate-copy"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
      >
        <Copy className="w-4 h-4" /> Copy
      </button>
      <button
        type="button"
        onClick={share}
        data-testid="settings-affiliate-share"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white text-sm font-medium hover:from-rose-600 hover:to-fuchsia-700"
      >
        <Share2 className="w-4 h-4" /> Share
      </button>
    </div>
  );
}

function loadRazorpayScript() {
  return new Promise(resolve => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function RazorpayCard() {
  const [cfg, setCfg] = useState(null);
  const [selected, setSelected] = useState("half_year");
  const [busy, setBusy] = useState(false);
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    api.get("/billing/razorpay/config").then(r => {
      setCfg(r.data);
      if (r.data.plans?.length) setSelected(r.data.plans[0].key);
    }).catch(() => setCfg({ enabled: false }));
    api.get("/tenants/current").then(r => setTenant(r.data)).catch(() => {});
  }, []);

  if (!cfg) return null;
  if (!cfg.enabled) return null;

  const chosen = cfg.plans.find(p => p.key === selected) || cfg.plans[0];

  async function pay() {
    if (!chosen) return;
    setBusy(true);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) { toast.error("Couldn't load Razorpay — check your internet"); return; }
      const { data: order } = await api.post("/billing/razorpay/order", { plan: chosen.key });
      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "Miracurl ✦ Salon Suite",
        description: `${order.plan_label} renewal`,
        order_id: order.order_id,
        theme: { color: "#ec4899" },
        prefill: {
          name: tenant?.name || "",
          email: tenant?.owner_email || "",
          contact: (tenant?.whatsapp_number || tenant?.phone || "").replace(/\D/g, "").slice(-10),
        },
        notes: {
          tenant_slug: tenant?.slug || "",
          plan: chosen.key,
        },
        handler: async (rzp) => {
          try {
            await api.post("/billing/razorpay/verify", {
              plan: chosen.key,
              razorpay_order_id: rzp.razorpay_order_id,
              razorpay_payment_id: rzp.razorpay_payment_id,
              razorpay_signature: rzp.razorpay_signature,
            });
            toast.success("Payment successful — subscription active ✦");
          } catch (e) {
            toast.error(e.response?.data?.detail || "Verification failed. Contact support.");
          }
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      };
      new window.Razorpay(options).open();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't start checkout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="settings-razorpay-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
          <CreditCard className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            Subscription & renewal
            {cfg.test_mode && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium uppercase tracking-wider">Test mode</span>}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Pay by card, UPI or NetBanking. Your affiliate credits are auto-applied at checkout.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
        {cfg.plans.map(p => (
          <button
            key={p.key}
            type="button"
            data-testid={`plan-${p.key}`}
            onClick={() => setSelected(p.key)}
            className={`text-left p-4 rounded-xl border-2 transition ${
              selected === p.key
                ? "border-indigo-500 bg-indigo-50/50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">{p.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{p.duration_days} days of access</div>
              </div>
              {selected === p.key && <Check className="w-5 h-5 text-indigo-600" />}
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900">₹{Number(p.price).toLocaleString("en-IN")}</div>
            {p.key === "annual" && (
              <div className="mt-1 text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Best value · one payment, whole year sorted
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-5 gap-3">
        <div className="text-xs text-slate-500">
          Payments secured by <b>Razorpay</b>. Cards / UPI / NetBanking accepted.
          {cfg.test_mode && (
            <span className="block mt-1 text-amber-700">
              🧪 Test mode: use card <span className="font-mono">4111 1111 1111 1111</span>, any CVV, any future expiry.
            </span>
          )}
        </div>
        <button
          data-testid="razorpay-pay-btn"
          onClick={pay}
          disabled={busy || !chosen}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 text-white font-semibold text-sm hover:from-indigo-600 hover:to-blue-700 shadow-sm disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          {busy ? "Opening…" : chosen ? `Pay ₹${Number(chosen.price).toLocaleString("en-IN")}` : "Choose a plan"}
        </button>
      </div>
    </div>
  );
}

