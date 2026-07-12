import { useEffect, useState } from "react";
import api, { API } from "@/lib/api";
import { toast } from "sonner";
import { FileText, Download, BookOpenCheck, ScrollText, Layers, ShieldCheck } from "lucide-react";

const ICONS = { onboarding_policy: BookOpenCheck, hiring_policy: ShieldCheck, suite_overview: Layers, terms_conditions: ScrollText };

export function DocsPanel() {
  const [docs, setDocs] = useState([]);
  const [busyKey, setBusyKey] = useState("");
  useEffect(() => {
    api.get("/super-admin/documents").then(r => setDocs(r.data.documents)).catch(() => toast.error("Couldn't load documents"));
  }, []);

  const download = async (d) => {
    setBusyKey(d.key);
    try {
      const res = await fetch(`${API}/super-admin/documents/${d.key}/pdf`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not generate PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `miracurl-${d.key.replace(/_/g, "-")}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${d.title} downloaded`);
    } catch (e) { toast.error(e.message); }
    setBusyKey("");
  };

  return (
    <div className="space-y-6" data-testid="docs-panel">
      <div>
        <h1 className="font-playfair text-3xl flex items-center gap-3"><FileText className="w-7 h-7 text-amber-500" /> Documents Center</h1>
        <p className="text-slate-500 text-sm mt-1">The complete onboarding pack — download and share these PDFs when onboarding a new tenant or employee.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {docs.map(d => {
          const I = ICONS[d.key] || FileText;
          return (
            <div key={d.key} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col" data-testid={`doc-card-${d.key}`}>
              <div className="flex items-center gap-3 mb-2">
                <span className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center"><I className="w-5 h-5 text-amber-600" /></span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-800 text-sm leading-tight">{d.title}</h3>
                  <p className="text-[11px] text-slate-400">{d.subtitle}</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 flex-1">{d.description}</p>
              <button onClick={() => download(d)} disabled={busyKey === d.key} data-testid={`doc-download-${d.key}`}
                className="mt-4 self-start px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center gap-2 hover:bg-slate-700 disabled:opacity-50">
                <Download className="w-3.5 h-3.5" /> {busyKey === d.key ? "Generating…" : "Download PDF"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
