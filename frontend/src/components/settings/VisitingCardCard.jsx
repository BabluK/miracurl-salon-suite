import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Contact, Download, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export function VisitingCardCard() {
  const { tenant } = useAuth();
  const resto = tenant?.business_type === "restaurant";
  const [dl, setDl] = useState(false);
  const src = `${BACKEND_URL}/api/settings/visiting-card.png?origin=${encodeURIComponent(window.location.origin)}`;
  const srcBack = `${src}&side=back`;

  const download = async (side) => {
    setDl(true);
    try {
      const { data } = await api.get("/settings/visiting-card.png", {
        params: { origin: window.location.origin, side }, responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `visiting-card-${side}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't generate the visiting card");
    }
    setDl(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-6" data-testid="visiting-card-card">
      <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
        <Contact className="w-5 h-5 text-amber-500" /> Visiting Card
      </h2>
      <p className="text-xs text-slate-500 mt-1">
        Print-ready luxury card (3.5"×2", 300 DPI) — your logo, {resto ? "restaurant" : "salon"} name, branch, phone and a scan-to-{resto ? "order" : "book"} QR.
      </p>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <div>
          <img src={src} alt="Visiting card front" data-testid="visiting-card-preview"
            className="w-full rounded-xl border border-slate-200 shadow" loading="lazy" />
          <button onClick={() => download("front")} disabled={dl} data-testid="visiting-card-download-btn"
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border-2 border-amber-400 text-amber-700 text-xs font-semibold hover:bg-amber-50 disabled:opacity-50">
            {dl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Front
          </button>
        </div>
        <div>
          <img src={srcBack} alt="Visiting card back" data-testid="visiting-card-back-preview"
            className="w-full rounded-xl border border-slate-200 shadow" loading="lazy" />
          <button onClick={() => download("back")} disabled={dl} data-testid="visiting-card-back-download-btn"
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border-2 border-amber-400 text-amber-700 text-xs font-semibold hover:bg-amber-50 disabled:opacity-50">
            {dl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Back
          </button>
        </div>
      </div>
    </div>
  );
}
