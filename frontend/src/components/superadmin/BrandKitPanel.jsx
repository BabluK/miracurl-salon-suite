import { Download, FileText, Palette } from "lucide-react";

const ASSETS = [
  { file: "miracurl-rosegold-full.png", label: "Primary — Rose Gold Logo", note: "App, print & trademark registration", dark: false },
  { file: "miracurl-rosegold-icon.png", label: "Rose Gold Icon", note: "Favicon, PWA app icon, WhatsApp DP", dark: false },
  { file: "miracurl-pink-primary.png", label: "Pink Magenta Logo", note: "Social media & vibrant marketing", dark: false },
  { file: "miracurl-gold.png", label: "Pure Gold Logo", note: "Premium print material", dark: false },
  { file: "miracurl-darkmode.png", label: "Dark Mode Logo", note: "Dark banners & video intros", dark: true },
  { file: "miracurl-pink-icon.png", label: "Pink Icon", note: "Social avatars", dark: false },
];

const COLORS = [
  ["#e8918f", "Rose"], ["#d4af37", "Gold"], ["#e8a0a8", "Blush"],
  ["#ec4899", "Brand Pink"], ["#16120d", "Charcoal"], ["#fdf7f2", "Cream"],
];

export const BrandKitPanel = () => (
  <div className="space-y-6" data-testid="brand-kit-panel">
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 className="font-playfair text-3xl flex items-center gap-2"><Palette className="w-6 h-6 text-rose-400" /> Brand Kit</h1>
        <p className="text-slate-500 text-sm mt-1">Official Miracurl logos, colors & guidelines — download anytime.</p>
      </div>
      <a href="/brand/miracurl-brand-kit.pdf" download data-testid="brand-kit-pdf-download"
         className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-400 via-pink-500 to-amber-500 text-white text-sm font-semibold shadow-[0_8px_20px_-6px_rgba(232,145,143,0.65)] hover:-translate-y-0.5 transition-transform">
        <FileText className="w-4 h-4" /> Download Brand Kit PDF
      </a>
    </div>

    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {ASSETS.map((a) => (
        <div key={a.file} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow" data-testid={`brand-asset-${a.file}`}>
          <div className={`rounded-xl flex items-center justify-center h-40 ${a.dark ? "bg-[#16120d]" : "bg-[#fdf7f2]"}`}>
            <img src={`/brand/${a.file}`} alt={a.label} className="max-h-32 max-w-[80%] object-contain" loading="lazy" />
          </div>
          <div className="mt-3 flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-800">{a.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{a.note}</div>
            </div>
            <a href={`/brand/${a.file}`} download data-testid={`brand-download-${a.file}`}
               className="shrink-0 w-8 h-8 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100 flex items-center justify-center transition" title="Download PNG">
              <Download className="w-4 h-4" />
            </a>
          </div>
        </div>
      ))}
    </div>

    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="text-sm font-semibold text-slate-800">Brand Colors</div>
      <div className="flex flex-wrap gap-3 mt-3">
        {COLORS.map(([hex, name]) => (
          <div key={hex} className="text-center">
            <div className="w-16 h-12 rounded-lg border border-slate-200" style={{ background: hex }} />
            <div className="text-[11px] font-medium text-slate-700 mt-1">{name}</div>
            <div className="text-[10px] text-slate-400 uppercase">{hex}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 mt-4">
        Wordmark: Playfair Display — "MIRA" solid + "CURL" rose-gold gradient · Tagline: "AI SALON SUITE" letter-spaced uppercase.
        Keep clear space around the logo and never stretch or recolor it outside this palette.
      </p>
    </div>
  </div>
);
