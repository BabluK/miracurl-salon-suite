import { useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertTriangle, Loader2, Download } from "lucide-react";

const ALIASES = {
  name: ["name", "customer", "customer name", "client", "client name", "guest", "full name"],
  phone: ["phone", "mobile", "number", "phone number", "mobile number", "contact", "whatsapp", "cell"],
  email: ["email", "e-mail", "mail", "email id"],
  gender: ["gender", "sex"],
};

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}

function autoMap(headers) {
  const m = {};
  headers.forEach((h, i) => {
    const k = h.trim().toLowerCase();
    for (const [field, list] of Object.entries(ALIASES)) if (m[field] === undefined && list.includes(k)) m[field] = i;
  });
  return m;
}

export function ImportCustomersModal({ onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [map, setMap] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef();

  function load(file) {
    const r = new FileReader();
    r.onload = () => {
      const all = parseCsv(String(r.result || ""));
      if (all.length < 2) { toast.error("The file needs a header row and at least one guest"); return; }
      setHeaders(all[0]); setMap(autoMap(all[0])); setRows(all.slice(1)); setResult(null);
    };
    r.readAsText(file);
  }
  const pick = (r, f) => (map[f] === undefined ? "" : (r[map[f]] || "").trim());
  const ready = rows && map.name !== undefined && map.phone !== undefined;

  async function run() {
    setBusy(true);
    try {
      const payload = rows.map(r => ({ name: pick(r, "name"), phone: pick(r, "phone"), email: pick(r, "email") || null, gender: pick(r, "gender") || null }));
      const { data } = await api.post("/customers/import-rows", { rows: payload, update_existing: true });
      setResult(data); onDone?.();
      toast.success(`Imported: ${data.added} new · ${data.updated} updated · ${data.skipped} skipped`);
    } catch (e) { toast.error(e.response?.data?.detail || "Import failed"); } finally { setBusy(false); }
  }

  const sel = "border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white";
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" onClick={onClose} data-testid="import-customers-modal">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Import guests from CSV / Excel</h3>
            <p className="text-xs text-slate-500 mt-1">Columns: <b>Name</b>, <b>Number</b>, Email, Gender. Existing numbers are never duplicated — blank fields get filled. Save your Excel as CSV first.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="import-close-btn"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {!rows && (
            <div onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) load(f); }}
              className="border-2 border-dashed border-slate-300 hover:border-emerald-400 rounded-2xl p-10 text-center cursor-pointer transition" data-testid="import-dropzone">
              <Upload className="w-8 h-8 mx-auto text-slate-400" />
              <div className="text-sm font-medium text-slate-700 mt-2">Drop your CSV here or click to choose</div>
              <div className="text-xs text-slate-400 mt-1">Up to 5,000 guests per file</div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => e.target.files?.[0] && load(e.target.files[0])} data-testid="import-file-input" />
              <a href={`data:text/csv;charset=utf-8,${encodeURIComponent("Name,Number,Email,Gender\nPriya Sharma,9876543210,priya@example.com,Female\nRahul Verma,9123456780,,Male\n")}`} download="miracurl-guests-template.csv"
                onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-emerald-700 mt-4 hover:underline" data-testid="import-template-link"><Download className="w-3 h-3" /> Download template</a>
            </div>
          )}
          {rows && !result && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {["name", "phone", "email", "gender"].map(f => (
                  <label key={f} className="text-[10px] uppercase tracking-wide text-slate-500">{f === "phone" ? "Number" : f}{(f === "name" || f === "phone") && " *"}
                    <select value={map[f] ?? ""} onChange={e => setMap({ ...map, [f]: e.target.value === "" ? undefined : Number(e.target.value) })} className={`${sel} w-full mt-0.5`} data-testid={`import-map-${f}`}>
                      <option value="">— not in file —</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2">Number</th><th className="text-left px-3 py-2">Email</th><th className="text-left px-3 py-2">Gender</th></tr></thead>
                  <tbody>{rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-slate-100"><td className="px-3 py-1.5">{pick(r, "name")}</td><td className="px-3 py-1.5">{pick(r, "phone")}</td><td className="px-3 py-1.5 text-slate-500">{pick(r, "email")}</td><td className="px-3 py-1.5 text-slate-500">{pick(r, "gender")}</td></tr>
                  ))}</tbody>
                </table>
                {rows.length > 5 && <div className="px-3 py-2 text-[11px] text-slate-400 bg-slate-50">…and {rows.length - 5} more</div>}
              </div>
              <div className="flex items-center justify-between gap-3">
                <button onClick={() => { setRows(null); setResult(null); }} className="text-xs text-slate-500 hover:text-slate-800" data-testid="import-choose-another">Choose another file</button>
                <button onClick={run} disabled={!ready || busy} className="btn-blue flex items-center gap-2 disabled:opacity-50" data-testid="import-run-btn">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import {rows.length} guests
                </button>
              </div>
              {!ready && <div className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Map the Name and Number columns to continue.</div>}
            </>
          )}
          {result && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5" data-testid="import-result">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold"><CheckCircle2 className="w-5 h-5" /> Import complete</div>
              <div className="grid grid-cols-3 gap-3 mt-3 text-center">
                {[["Added", result.added], ["Updated", result.updated], ["Skipped", result.skipped]].map(([l, v]) => (
                  <div key={l} className="bg-white rounded-xl p-3 border border-emerald-100"><div className="text-2xl font-bold text-slate-800">{v}</div><div className="text-[11px] uppercase tracking-wide text-slate-500">{l}</div></div>
                ))}
              </div>
              {result.errors?.length > 0 && <ul className="mt-3 text-[11px] text-amber-700 space-y-0.5">{result.errors.slice(0, 5).map(e => <li key={e.row}>Row {e.row}: {e.reason}</li>)}</ul>}
              <button onClick={onClose} className="btn-slate mt-4" data-testid="import-done-btn">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
