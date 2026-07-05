import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { QrCode, Download, Loader2 } from "lucide-react";

export function QrPosterCard() {
  const [downloading, setDownloading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get(`/settings/qr-poster?origin=${encodeURIComponent(window.location.origin)}`, { responseType: "blob" });
        if (alive) setPreview(URL.createObjectURL(res.data));
      } catch { if (alive) setError(true); }
    })();
    return () => { alive = false; };
  }, []);

  async function download() {
    setDownloading(true);
    try {
      let url = preview;
      if (!url) {
        const res = await api.get(`/settings/qr-poster?origin=${encodeURIComponent(window.location.origin)}`, { responseType: "blob" });
        url = URL.createObjectURL(res.data);
        setPreview(url);
      }
      const a = document.createElement("a");
      a.href = url; a.download = "booking-qr-poster.png"; a.click();
      toast.success("QR poster downloaded — print it for your reception desk ✦");
    } catch { toast.error("Couldn't generate poster — please try again"); }
    finally { setDownloading(false); }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="settings-qr-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
          <QrCode className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">Booking QR poster</h2>
          <p className="text-xs text-slate-500 mt-1">
            A print-ready poster for your reception desk. Clients scan it with their phone camera → your booking page opens → they install the Miracurl Book app and self-book their next visit.
          </p>
        </div>
        <button
          data-testid="download-qr-poster-btn"
          onClick={download}
          disabled={downloading}
          className="btn-blue flex items-center gap-2 flex-shrink-0 disabled:opacity-60"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {downloading ? "Generating…" : "Download poster"}
        </button>
      </div>
      <div className="mt-5 flex justify-center bg-slate-50 border border-slate-200 rounded-xl p-4" data-testid="qr-poster-preview">
        {preview ? (
          <img src={preview} alt="Booking QR poster preview" className="max-h-96 rounded-lg shadow-md" />
        ) : error ? (
          <div className="text-xs text-rose-500 py-8">Couldn&apos;t load the poster preview — tap &quot;Download poster&quot; to retry.</div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Generating your QR poster…
          </div>
        )}
      </div>
    </div>
  );
}
