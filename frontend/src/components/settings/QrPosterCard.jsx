import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { QrCode, Download, Loader2, Eye } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const DESIGNS = [
  { key: "blush", label: "Blush & Gold" },
  { key: "rosegold", label: "Rose Gold Silk" },
  { key: "lavender", label: "Lavender Glam" },
  { key: "ivory", label: "Boho Ivory" },
];
const RESTO_DESIGNS = [{ key: "bistro", label: "Warm Bistro" }];

export function QrPosterCard() {
  const { tenant } = useAuth();
  const resto = tenant?.business_type === "restaurant";
  const designs = resto ? RESTO_DESIGNS : DESIGNS;
  const [design, setDesign] = useState(resto ? "bistro" : "blush");
  const [kind, setKind] = useState("booking");
  const [fmt, setFmt] = useState("poster");
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState(null);

  const fetchPoster = async (mode) => {
    setBusy(mode);
    try {
      const { data } = await api.get("/settings/qr-poster", {
        params: { origin: window.location.origin, design, kind, fmt },
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      if (mode === "preview") {
        setPreview({ url, design });
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${kind}-${fmt}-${design}.png`;
        a.click();
        toast.success("HD file downloaded — ready to print 🖨️");
      }
    } catch {
      toast.error("Couldn't generate the poster — try again");
    }
    setBusy("");
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="qr-poster-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-500 flex items-center justify-center shrink-0">
          <QrCode className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Booking QR Poster (HD)</h2>
          <p className="text-xs text-slate-500 mt-1">
            Print-ready designer poster for your {resto ? "restaurant" : "salon"} entrance — your name, Mon–Sun timings (from this Settings page), phone, Mira AI and a scan-to-book QR. {resto ? "Warm bistro design with hand-painted dishes:" : "Pick a design:"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-5">
        {[["booking", "📅 Booking QR"], ["review", "⭐ Review QR"]].map(([k, label]) => (
          <button key={k} onClick={() => { setKind(k); setPreview(null); }} data-testid={`poster-kind-${k}`}
            className={`text-xs font-bold px-4 py-2 rounded-xl border ${kind === k ? "border-rose-400 bg-rose-50 text-rose-600" : "border-slate-200 text-slate-500"}`}>{label}</button>
        ))}
        <span className="w-px bg-slate-200 mx-1" />
        {[["poster", "🖼️ Wall Poster"], ["tent", "🪧 Desk Tent Card"]].map(([k, label]) => (
          <button key={k} onClick={() => { setFmt(k); setPreview(null); }} data-testid={`poster-fmt-${k}`}
            className={`text-xs font-bold px-4 py-2 rounded-xl border ${fmt === k ? "border-rose-400 bg-rose-50 text-rose-600" : "border-slate-200 text-slate-500"}`}>{label}</button>
        ))}
      </div>
      {kind === "review" && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2">⭐ Review QR redirects scanners to your Google review link (set it in salon profile). If not set, it opens your public salon page.</p>
      )}

      <div className="grid grid-cols-4 gap-3 mt-3">
        {designs.map(d => (
          <button key={d.key} onClick={() => { setDesign(d.key); setPreview(null); }}
            data-testid={`poster-design-${d.key}`}
            className={`rounded-xl overflow-hidden border-2 transition-colors ${design === d.key ? "border-rose-400 shadow-md" : "border-slate-200 hover:border-slate-300"}`}>
            <img src={`/assets/posters/${d.key}.png`} alt={d.label} className="w-full h-28 object-cover" />
            <p className={`text-[10px] font-bold py-1.5 ${design === d.key ? "bg-rose-50 text-rose-600" : "text-slate-500"}`}>{d.label}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-2 mt-4">
        <button onClick={() => fetchPoster("preview")} disabled={!!busy} data-testid="poster-preview-btn"
          className="flex-1 border border-slate-300 text-slate-700 rounded-xl py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">
          {busy === "preview" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Preview
        </button>
        <button onClick={() => fetchPoster("download")} disabled={!!busy} data-testid="poster-download-btn"
          className="flex-1 bg-slate-900 text-white rounded-xl py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">
          {busy === "download" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download HD
        </button>
      </div>

      {preview && (
        <img src={preview.url} alt="Poster preview" data-testid="poster-preview-img"
          className="mt-4 rounded-xl border border-slate-200 w-full max-w-sm mx-auto block" />
      )}
    </div>
  );
}
