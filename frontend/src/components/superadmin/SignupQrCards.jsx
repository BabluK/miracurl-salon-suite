import { useEffect, useState } from "react";
import { QrCode, Printer, Download, Copy } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// HQ → Documents: printable QR cards for the four dedicated signup links (sales team onboards owners on the spot).
export function SignupQrCards() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/super-admin/signup-qr").then(r => setD(r.data)).catch(() => setD({ cards: [] })); }, []);
  if (!d) return null;
  const copy = (url) => navigator.clipboard?.writeText(url).then(() => toast.success("Link copied")).catch(() => toast.error("Copy failed"));
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5" data-testid="signup-qr-cards">
      <style>{`@media print { body * { visibility: hidden !important; } #signup-qr-sheet, #signup-qr-sheet * { visibility: visible !important; }
        #signup-qr-sheet { position: fixed; inset: 0; padding: 24px; background: #fff; display: grid !important; grid-template-columns: 1fr 1fr; gap: 24px; }
        #signup-qr-sheet .no-print { display: none !important; } }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Sales kit</div>
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><QrCode className="w-4 h-4 text-[#b8932e]" /> Signup QR cards</h3>
          <p className="text-xs text-slate-500 mt-1">Owners scan → land on the right India/US salon or restaurant signup page. Scans are tagged <code>utm_source=qr</code> so they show up in Traffic vs Conversion.</p>
        </div>
        <button onClick={() => window.print()} data-testid="signup-qr-print" className="btn-blue !h-9 !px-4 text-xs inline-flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> Print all 4 cards</button>
      </div>
      <div id="signup-qr-sheet" className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {d.cards.map(c => (
          <div key={c.key} data-testid={`signup-qr-card-${c.key}`} className="rounded-2xl border-2 border-[#d4af37]/40 bg-[#fffdf8] p-4 flex flex-col items-center text-center break-inside-avoid">
            <img src="/assets/ms-logo-gold.png" alt="Miracurl Suite" className="w-10 h-10 mb-1" />
            <div className="font-playfair text-xs tracking-[0.12em] text-[#8a6d1f] font-semibold">MIRACURL SUITE</div>
            <div className="text-sm font-bold text-slate-800 mt-2">{c.label}</div>
            <div className="text-[10px] text-slate-500">{c.note}</div>
            <img src={`${BACKEND_URL}/api/super-admin/signup-qr/${c.key}.png`} alt={`QR ${c.label}`} data-testid={`signup-qr-img-${c.key}`} className="w-44 h-44 my-3 rounded-lg border border-slate-200 bg-white" />
            <div className="text-[10px] font-mono text-slate-600 break-all">{c.base.replace(/^https?:\/\//, "")}{c.path}</div>
            <div className="text-[9px] text-slate-400 mt-1">Scan to start your free trial · no credit card</div>
            <div className="no-print flex items-center gap-2 mt-3">
              <button onClick={() => copy(c.url)} data-testid={`signup-qr-copy-${c.key}`} className="btn-slate !h-8 !px-3 text-[11px] inline-flex items-center gap-1"><Copy className="w-3 h-3" /> Copy link</button>
              <a href={`${BACKEND_URL}/api/super-admin/signup-qr/${c.key}.png`} download={`miracurl-signup-${c.key}.png`} data-testid={`signup-qr-download-${c.key}`} className="btn-slate !h-8 !px-3 text-[11px] inline-flex items-center gap-1"><Download className="w-3 h-3" /> PNG</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
