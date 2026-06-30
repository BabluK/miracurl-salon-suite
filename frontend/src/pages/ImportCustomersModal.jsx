import { useRef, useState } from "react";
import { X, Upload, FileText, ClipboardPaste, Loader2, CheckCircle2, AlertCircle, Copy } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const STATUS_COLOR = {
  added: "text-emerald-400",
  skipped: "text-amber-400",
  invalid: "text-red-400",
};

const SAMPLE_HINT = `Examples:
Priya Sharma, +91 98765 43210
Rahul, 9988776655
9876543210`;

export default function ImportCustomersModal({ tenant, onClose, onDone }) {
  const [text, setText] = useState("");
  const [format, setFormat] = useState("auto");
  const [result, setResult] = useState(null); // {summary, rows}
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast.error("File too large (max 2 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result || ""));
      if (f.name.toLowerCase().endsWith(".vcf")) setFormat("vcard");
    };
    reader.onerror = () => toast.error("Couldn't read file");
    reader.readAsText(f);
  }

  async function submit() {
    if (!text.trim()) { toast.error("Paste contacts or upload a .vcf file"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(
        `/super-admin/tenants/${tenant.id}/customers/import`,
        { text, format },
      );
      setResult(data);
      toast.success(`Imported ${data.summary.added} new · skipped ${data.summary.skipped}`);
      onDone?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Import failed");
    } finally { setBusy(false); }
  }

  function reset() {
    setText("");
    setResult(null);
    setFormat("auto");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function copyCode(code) {
    try { await navigator.clipboard.writeText(code); toast.success("Referral code copied"); }
    catch { toast.error("Copy not available"); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="card-luxe w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="import-customers-modal">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-playfair text-2xl">Import Customers</h3>
            <p className="text-xs text-ink-secondary mt-1">Bulk-add to <span className="text-gold">{tenant.name}</span> · <span className="font-mono text-[10px]">{tenant.slug}</span></p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-white" data-testid="import-close-btn"><X className="w-5 h-5" /></button>
        </div>

        {!result && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="card-luxe text-left p-4 hover:border-gold/40 transition-all"
                data-testid="import-pick-file-btn"
              >
                <Upload className="w-5 h-5 text-gold mb-2" />
                <div className="font-medium text-sm">Upload .vcf</div>
                <div className="text-[11px] text-ink-secondary mt-1">WhatsApp → Contact → Share via vCard</div>
                <input ref={fileRef} type="file" accept=".vcf,.txt,.csv,text/plain,text/x-vcard,text/vcard" className="hidden" onChange={onFile} data-testid="import-file-input" />
              </button>
              <div className="card-luxe p-4">
                <ClipboardPaste className="w-5 h-5 text-gold mb-2" />
                <div className="font-medium text-sm">Or paste below</div>
                <div className="text-[11px] text-ink-secondary mt-1">One contact per line · name + phone</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="label-luxe">Contacts</label>
                <select
                  data-testid="import-format-select"
                  value={format}
                  onChange={e => setFormat(e.target.value)}
                  className="input-luxe py-1 text-xs w-auto"
                >
                  <option value="auto">Auto-detect</option>
                  <option value="vcard">vCard (.vcf)</option>
                  <option value="text">Plain text / CSV</option>
                </select>
              </div>
              <textarea
                data-testid="import-text-area"
                rows={10}
                className="input-luxe font-mono text-xs"
                placeholder={SAMPLE_HINT}
                value={text}
                onChange={e => setText(e.target.value)}
              />
              <div className="text-[10px] text-ink-muted flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {text.length.toLocaleString()} chars · phone numbers will be normalised (country-code 91 prefix stripped)
              </div>
            </div>

            <div className="flex gap-3 pt-4 mt-4 border-t border-white/5">
              <button onClick={onClose} className="btn-ghost flex-1" data-testid="import-cancel-btn">Cancel</button>
              <button
                onClick={submit}
                disabled={busy || !text.trim()}
                className="btn-gold flex-1 flex items-center justify-center gap-2"
                data-testid="import-submit-btn"
              >
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : "Preview & Import"}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-4" data-testid="import-result-panel">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Parsed" value={result.summary.total_parsed} testid="import-stat-parsed" />
              <Stat label="Added" value={result.summary.added} accent="text-emerald-400" testid="import-stat-added" />
              <Stat label="Skipped" value={result.summary.skipped} accent="text-amber-400" testid="import-stat-skipped" />
            </div>

            <div className="card-luxe p-0 overflow-hidden">
              <div className="max-h-72 overflow-y-auto">
                <table className="luxe-table">
                  <thead>
                    <tr><th>Name</th><th>Phone</th><th>Status</th><th>Referral</th></tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <tr key={`${r.phone}-${i}`} data-testid={`import-row-${i}`}>
                        <td className="text-sm">{r.name}</td>
                        <td className="font-mono text-xs">{r.phone}</td>
                        <td>
                          <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider ${STATUS_COLOR[r.status] || "text-ink-muted"}`}>
                            {r.status === "added" ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                            {r.status}
                          </span>
                          {r.reason && <div className="text-[10px] text-ink-muted">{r.reason}</div>}
                        </td>
                        <td>
                          {r.referral_code ? (
                            <button onClick={() => copyCode(r.referral_code)} className="flex items-center gap-1 text-[11px] font-mono text-gold hover:text-gold-hover">
                              {r.referral_code} <Copy className="w-3 h-3" />
                            </button>
                          ) : <span className="text-ink-muted text-[10px]">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3 pt-2 border-t border-white/5">
              <button onClick={reset} className="btn-ghost flex-1" data-testid="import-again-btn">Import more</button>
              <button onClick={onClose} className="btn-gold flex-1" data-testid="import-done-btn">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "", testid }) {
  return (
    <div className="card-luxe" data-testid={testid}>
      <div className="label-luxe">{label}</div>
      <div className={`font-playfair text-3xl mt-1 ${accent}`}>{value}</div>
    </div>
  );
}
