import { useEffect, useRef, useState } from "react";
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
  const [showClean, setShowClean] = useState(false);
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
            <button type="button" onClick={() => setShowClean(v => !v)} data-testid="import-clean-toggle"
              className="mt-3 text-[11px] text-ink-secondary hover:text-gold underline underline-offset-2">
              {showClean ? "Hide" : "Wrong salon? Undo / move an import…"}
            </button>
            {showClean && <ImportCleanPanel tenant={tenant} onDone={onDone} />}
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

function ImportCleanPanel({ tenant, onDone }) {
  const [date, setDate] = useState("");
  const [tenants, setTenants] = useState([]);
  const [target, setTarget] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/super-admin/tenants").then(r => setTenants((r.data || []).filter(t => t.id !== tenant.id))).catch(() => {});
  }, [tenant.id]);

  async function run(action) {
    if (!date) { toast.error("Pick the day the guests were added"); return; }
    if (action === "move" && !target) { toast.error("Pick the salon to move them into"); return; }
    if (action !== "preview" && !window.confirm(`${action === "delete" ? "Delete" : "Move"} ${preview?.matched ?? "these"} untouched guests added on ${date} ${action === "delete" ? `from ${tenant.name}` : "to the selected salon"}? This can't be undone.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/super-admin/tenants/${tenant.id}/customers/import-clean`, { date, action, target_tid: target || null });
      setPreview(data);
      if (action === "delete") { toast.success(`Deleted ${data.deleted} guests from ${tenant.name}`); onDone?.(); }
      if (action === "move") { toast.success(`Moved ${data.moved} guests to ${data.target?.name}${data.duplicates_removed ? ` · ${data.duplicates_removed} duplicates dropped` : ""}`); onDone?.(); }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't process");
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-3 card-luxe p-4 space-y-3" data-testid="import-clean-panel">
      <div className="text-sm font-medium">Undo / move an import</div>
      <p className="text-[11px] text-ink-secondary">Finds guests added to <span className="text-gold">{tenant.name}</span> on one day who were never billed (0 visits, ₹0). Preview first, then delete them or move them to the right salon (phones already there are skipped).</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={date} onChange={e => { setDate(e.target.value); setPreview(null); }} data-testid="import-clean-date" className="input-luxe py-1.5 text-xs w-auto" />
        <select value={target} onChange={e => setTarget(e.target.value)} data-testid="import-clean-target" className="input-luxe py-1.5 text-xs w-auto max-w-[220px]">
          <option value="">Move to… (optional)</option>
          {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button type="button" onClick={() => run("preview")} disabled={busy || !date} className="btn-ghost py-1.5 text-xs" data-testid="import-clean-preview-btn">Preview</button>
      </div>
      {preview && (
        <div className="space-y-2" data-testid="import-clean-result">
          <div className="text-sm"><b className="text-gold" data-testid="import-clean-matched">{preview.matched}</b> untouched guests added on {preview.date}
            {preview.deleted != null && <span className="text-red-400"> · {preview.deleted} deleted</span>}
            {preview.moved != null && <span className="text-emerald-400"> · {preview.moved} moved to {preview.target?.name}{preview.duplicates_removed ? ` · ${preview.duplicates_removed} duplicates dropped` : ""}</span>}
          </div>
          {preview.sample?.length > 0 && preview.action === "preview" && (
            <div className="text-[11px] text-ink-secondary font-mono">{preview.sample.map(s => `${s.name} · ${s.phone}`).join("  |  ")}{preview.matched > preview.sample.length ? " …" : ""}</div>
          )}
          {preview.action === "preview" && preview.matched > 0 && (
            <div className="flex gap-2">
              <button type="button" onClick={() => run("delete")} disabled={busy} className="flex-1 rounded-lg border border-red-400/40 text-red-300 text-xs font-bold py-2 hover:bg-red-500/10" data-testid="import-clean-delete-btn">
                {busy ? "Working…" : `Delete ${preview.matched} from ${tenant.name}`}
              </button>
              <button type="button" onClick={() => run("move")} disabled={busy || !target} className="btn-gold flex-1 text-xs py-2" data-testid="import-clean-move-btn">
                Move to {tenants.find(t => t.id === target)?.name || "…"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
