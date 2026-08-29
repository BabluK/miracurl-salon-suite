import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Stamp, Download, Loader2, X, Send } from "lucide-react";

const GIFT_PRESETS = ["Free Hair Spa", "Free Hair Cut", "Free D-Tan", "10% off any service",
  "Pay ₹1000 → get ₹1500 services", "Pay ₹2000 → get ₹2500 services"];

const QR_BGS = [
  { key: "deco", label: "Gold Deco" },
  { key: "dining", label: "Fine Dining" },
  { key: "emerald", label: "Royal Emerald" },
  { key: "burgundy", label: "Burgundy Rose" },
  { key: "midnight", label: "Midnight Stars" },
];

export function LoyaltyStampsCard() {
  const [cfg, setCfg] = useState(null);
  const [isResto, setIsResto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dl, setDl] = useState(false);
  const [giftInput, setGiftInput] = useState("");
  const [qrBg, setQrBg] = useState("");
  const [logoShape, setLogoShape] = useState("circle");
  const [nudging, setNudging] = useState(false);

  const sendNudges = async () => {
    if (!window.confirm("Text every member who is 1-2 stamps from their gift? (1 SMS point each, max once per guest per 14 days)\n\nNote: this also runs automatically every Monday at 9 AM.")) return;
    setNudging(true);
    try {
      const { data } = await api.post("/loyalty/stamps/send-nudges", {});
      toast.success(`📲 Nudged ${data.sent} guest${data.sent === 1 ? "" : "s"}${data.skipped ? ` · ${data.skipped} skipped (recently nudged / no points)` : ""}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't send nudges");
    }
    setNudging(false);
  };

  const gifts = cfg?.surprise_gifts || [];
  const addGift = (g) => {
    const v = String(g || "").trim();
    if (!v || gifts.includes(v) || gifts.length >= 12) return;
    setCfg({ ...cfg, surprise_gifts: [...gifts, v] });
    setGiftInput("");
  };

  const downloadQr = async () => {
    setDl(true);
    try {
      const { data } = await api.get("/settings/loyalty-qr-poster.png", {
        params: { origin: window.location.origin, design: qrBg || undefined, logo_shape: logoShape }, responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "loyalty-club-qr.jpg";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't download the Loyalty QR — save the card first");
    }
    setDl(false);
  };

  useEffect(() => {
    api.get("/settings/loyalty-stamps").then(r => setCfg(r.data)).catch(() => {});
    api.get("/tenants/current").then(r => setIsResto(r.data?.business_type === "restaurant")).catch(() => {});
  }, []);

  if (!cfg) return null;

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings/loyalty-stamps", cfg);
      toast.success("Loyalty stamp card saved ✦");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-6" data-testid="loyalty-stamps-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Stamp className="w-4 h-4 text-amber-600" /> Signature Loyalty Card
        </h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={cfg.enabled} data-testid="loyalty-stamps-toggle"
            onChange={e => setCfg({ ...cfg, enabled: e.target.checked })}
            className="w-4 h-4 accent-amber-500" />
          <span className="text-sm text-slate-600">{cfg.enabled ? "Enabled" : "Disabled"}</span>
        </label>
      </div>
      <p className="text-xs text-slate-400 mt-1">Guests earn a gold stamp every billed visit (staff can add extras in POS). A full card unlocks their treat — visible on your booking page too.</p>
      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        <div>
          <label className="text-xs text-slate-500 font-medium">Stamps to fill the card</label>
          <input type="number" min={2} max={12} value={cfg.stamps_needed} data-testid="loyalty-stamps-needed-input"
            onChange={e => setCfg({ ...cfg, stamps_needed: Math.max(2, Math.min(12, Number(e.target.value) || 5)) })}
            className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Reward (shown to guests)</label>
          <input value={cfg.reward_label} maxLength={80} data-testid="loyalty-stamps-reward-input"
            onChange={e => setCfg({ ...cfg, reward_label: e.target.value })}
            placeholder={isResto ? "e.g. Free Dessert or 20% off the table" : "e.g. Free Hair Spa or 20% off next visit"}
            className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Discount % (guide for billing)</label>
          <input type="number" min={0} max={100} value={cfg.reward_discount_pct} data-testid="loyalty-stamps-pct-input"
            onChange={e => setCfg({ ...cfg, reward_discount_pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {Array.from({ length: cfg.stamps_needed }).map((_, i) => (
          <span key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 ${i < cfg.stamps_needed - 1 ? "border-amber-300 text-amber-400" : "bg-gradient-to-br from-amber-400 to-yellow-600 border-amber-300 text-white"}`}>
            {i < cfg.stamps_needed - 1 ? "✦" : "🎁"}
          </span>
        ))}
        <span className="text-[11px] text-slate-400 ml-1">how guests see it</span>
      </div>
      <div className="mt-5 rounded-xl border border-dashed border-amber-300/70 bg-amber-50/40 p-4">
        <p className="text-xs font-bold text-amber-700">🎁 Surprise gift options <span className="font-normal text-amber-600/80">— only you &amp; staff see these; guests just know "a surprise awaits"</span></p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {gifts.map(g => (
            <span key={g} className="inline-flex items-center gap-1 text-[11px] bg-white border border-amber-300 text-amber-800 rounded-full px-2.5 py-1" data-testid="surprise-gift-chip">
              {g}
              <button onClick={() => setCfg({ ...cfg, surprise_gifts: gifts.filter(x => x !== g) })} className="text-amber-500 hover:text-red-500"><X className="w-3 h-3" /></button>
            </span>
          ))}
          {gifts.length === 0 && <span className="text-[11px] text-slate-400">No gift options yet — add a few below</span>}
        </div>
        <div className="flex gap-2 mt-2.5">
          <input value={giftInput} maxLength={80} data-testid="surprise-gift-input"
            onChange={e => setGiftInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addGift(giftInput); } }}
            placeholder={isResto ? 'e.g. "Free dessert platter"' : 'e.g. "Free Hair Spa"'}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <button onClick={() => addGift(giftInput)} data-testid="surprise-gift-add-btn"
            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-xs font-bold hover:brightness-105">Add</button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {GIFT_PRESETS.filter(p => !gifts.includes(p)).map(p => (
            <button key={p} onClick={() => addGift(p)} className="text-[10px] px-2 py-1 rounded-full border border-slate-200 text-slate-500 hover:border-amber-400 hover:text-amber-700">+ {p}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <button onClick={save} disabled={saving} data-testid="loyalty-stamps-save-btn"
          className="px-5 py-2 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 text-white text-sm font-semibold shadow hover:brightness-105 disabled:opacity-50">
          {saving ? "Saving…" : "Save loyalty card"}
        </button>
        <button onClick={downloadQr} disabled={dl || !cfg.enabled} data-testid="loyalty-qr-download-btn"
          title={cfg.enabled ? "Polished poster — guests scan to join with name, phone & email" : "Enable the card first"}
          className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full border-2 border-amber-400 text-amber-700 text-sm font-semibold hover:bg-amber-50 disabled:opacity-50">
          {dl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {dl ? "Preparing…" : "Download Loyalty Club QR"}
        </button>
        <button onClick={sendNudges} disabled={nudging || !cfg.enabled} data-testid="loyalty-nudge-btn"
          title="SMS members who are 1-2 stamps from their surprise gift"
          className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full border-2 border-emerald-400 text-emerald-700 text-sm font-semibold hover:bg-emerald-50 disabled:opacity-50">
          {nudging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {nudging ? "Sending…" : "Nudge guests near their gift"}
        </button>
        <span className="text-[11px] text-slate-400" data-testid="loyalty-auto-nudge-note">⏰ Auto-runs every Monday 9 AM</span>
      </div>
      <div className="mt-3">
        <p className="text-[11px] font-bold text-slate-500">Poster background</p>
        <div className="grid grid-cols-5 gap-2 mt-1.5 max-w-md">
          {QR_BGS.map(b => {
            const active = qrBg === b.key || (!qrBg && b.key === (isResto ? "dining" : "deco"));
            return (
              <button key={b.key} onClick={() => setQrBg(b.key)} data-testid={`loyalty-bg-${b.key}`}
                className={`rounded-lg overflow-hidden border-2 text-center ${active ? "border-amber-500 ring-2 ring-amber-200" : "border-slate-200 hover:border-amber-300"}`}>
                <img src={`/assets/loyalty-bgs/${b.key}.jpg`} alt={b.label} className="w-full h-16 object-cover" />
                <span className="block text-[9px] font-semibold text-slate-600 py-0.5">{b.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3">
        <p className="text-[11px] font-bold text-slate-500">Logo style on poster</p>
        <div className="flex gap-2 mt-1.5">
          {[["circle", "◯ Circle"], ["square", "▢ Square"], ["blend", "✦ Blend with background"]].map(([k, label]) => (
            <button key={k} onClick={() => setLogoShape(k)} data-testid={`loyalty-logo-shape-${k}`}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${logoShape === k
                ? "bg-slate-900 text-amber-200 border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-amber-400"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
