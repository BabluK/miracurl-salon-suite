import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Database, Trash2, RefreshCw, Search, ShieldAlert, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { confirmAsync, promptAsync } from "@/components/ConfirmDialog";

const PAGE = 20;

export const DatabasePanel = () => {
  const [colls, setColls] = useState([]);
  const [sel, setSel] = useState(null);
  const [docs, setDocs] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [health, setHealth] = useState(null);
  const [auditing, setAuditing] = useState(false);

  const loadHealth = (refresh = false) => {
    if (refresh) setAuditing(true);
    api.get("/super/db/health", { params: refresh ? { refresh: true } : {} })
      .then(r => setHealth(r.data)).catch(() => {})
      .finally(() => setAuditing(false));
  };

  const healthClick = async () => {
    if (!health || health.orphans === 0) return loadHealth(true);
    const lines = Object.entries(health.per_collection || {}).sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c} (${n})`).join(" · ");
    if (!await confirmAsync(`Permanently delete ${health.orphans} orphan records? They belong to salons that no longer exist — ${lines}. This cannot be undone.`, { title: "Clean up orphan records", confirmLabel: "Delete permanently", danger: true })) return;
    setAuditing(true);
    try {
      const { data } = await api.post("/super/db/purge-orphans");
      toast.success(`🧹 ${data.removed} orphan record${data.removed === 1 ? "" : "s"} deleted permanently — database healthy`);
      loadColls();
      if (sel) loadDocs(sel, 0);
    } catch (e) { toast.error(e.response?.data?.detail || "Cleanup failed"); }
    loadHealth(true);
  };

  const loadColls = () => { api.get("/super/db/collections").then(r => setColls(r.data.collections)).catch(() => toast.error("Couldn't load collections")); };
  useEffect(() => { loadColls(); loadHealth(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDocs = (name, newSkip = 0, query = q) => {
    api.get(`/super/db/${name}/docs`, { params: { skip: newSkip, limit: PAGE, q: query } })
      .then(r => { setDocs(r.data.docs); setTotal(r.data.total); setSkip(newSkip); setSel(name); setExpanded(null); })
      .catch(e => toast.error(e.response?.data?.detail || "Couldn't load documents"));
  };

  const delDoc = async (doc) => {
    const key = doc.id || doc._id;
    if (!await confirmAsync(`Delete this document from "${sel}"?\n\nid: ${key}\n\nThis cannot be undone.`)) return;
    try {
      await api.delete(`/super/db/${sel}/doc/${key}`);
      toast.success("Document deleted");
      loadDocs(sel, skip);
      loadColls();
    } catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
  };

  const purge = async () => {
    const meta = colls.find(c => c.name === sel);
    if (meta?.purge_protected) { toast.error(`"${sel}" is protected — purge disabled`); return; }
    const typed = await promptAsync(`⚠️ PURGE ALL ${total} documents from "${sel}"?\n\nType the collection name to confirm:`);
    if (typed === null) return;
    try {
      const { data } = await api.post(`/super/db/${sel}/purge`, { confirm: typed.trim() });
      toast.success(`Purged ${data.deleted} documents from ${sel}`);
      loadDocs(sel, 0);
      loadColls();
    } catch (e) { toast.error(e.response?.data?.detail || "Purge failed"); }
  };

  const docKey = (d, i) => d.id || d._id || i;
  const preview = (d) => {
    const skipKeys = new Set(["_id"]);
    const parts = [];
    for (const [k, v] of Object.entries(d)) {
      if (skipKeys.has(k) || parts.length >= 4) continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
        parts.push(`${k}: ${String(v).slice(0, 36)}`);
    }
    return parts.join(" · ");
  };

  return (
    <div className="space-y-4" data-testid="database-panel">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-playfair text-3xl flex items-center gap-2"><Database className="w-6 h-6 text-sky-500" /> Database</h1>
          <p className="text-slate-500 text-sm mt-1">Browse every table, inspect rows and clean up data. Deletions are permanent — use with care.</p>
        </div>
        {health && (
          <button onClick={healthClick} disabled={auditing}
            title={health.orphans === 0 ? "Weekly auto-audit: docs pointing at deleted salons. Click to re-run now." : "Click to delete these orphan records permanently"}
            data-testid="db-health-badge"
            className={`inline-flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-full border transition ${health.orphans === 0
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              : "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"}`}>
            {auditing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : health.orphans === 0 ? <ShieldCheck className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
            {health.orphans === 0
              ? `Healthy · 0 orphan records · ${health.tenants} tenants`
              : `⚠ ${health.orphans} orphan records found · tap to delete`}
            <span className="font-normal opacity-70">· audited {(health.checked_at || "").slice(0, 10)}</span>
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="w-full lg:w-64 shrink-0 bg-white border border-slate-200 rounded-2xl p-2 max-h-[520px] overflow-y-auto" data-testid="db-collection-list">
          {colls.map(c => (
            <button key={c.name} data-testid={`db-coll-${c.name}`} onClick={() => { setQ(""); loadDocs(c.name, 0, ""); }}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between gap-2 transition ${sel === c.name ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              <span className="truncate flex items-center gap-1.5">
                {c.purge_protected && <ShieldAlert className="w-3 h-3 text-amber-500 shrink-0" />}
                {c.name}
              </span>
              <span className={`text-[10px] ${sel === c.name ? "text-white/60" : "text-slate-400"}`}>{c.count}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 w-full">
          {!sel ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-400">
              Select a collection to inspect its documents.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-800 text-sm">{sel}</span>
                <span className="text-xs text-slate-400">{total} docs</span>
                <div className="relative ml-auto">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && loadDocs(sel, 0)}
                    placeholder="Search id / name / email / phone…" data-testid="db-search-input"
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs w-56 focus:outline-none focus:ring-2 focus:ring-sky-300" />
                </div>
                <button onClick={() => loadDocs(sel, skip)} data-testid="db-refresh-btn"
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw className="w-3.5 h-3.5" /></button>
                <button onClick={purge} data-testid="db-purge-btn"
                  disabled={colls.find(c => c.name === sel)?.purge_protected}
                  className="text-xs px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 font-medium hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  Purge all
                </button>
              </div>

              <div className="space-y-1.5 max-h-[420px] overflow-y-auto" data-testid="db-doc-list">
                {docs.map((d, i) => (
                  <div key={docKey(d, i)} className="border border-slate-100 rounded-xl">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button onClick={() => setExpanded(expanded === i ? null : i)} className="flex-1 text-left min-w-0" data-testid={`db-doc-row-${i}`}>
                        <span className="text-[11px] font-mono text-slate-600 truncate block">{preview(d) || (d.id || d._id)}</span>
                      </button>
                      <button onClick={() => delDoc(d)} data-testid={`db-doc-delete-${i}`}
                        className="shrink-0 w-7 h-7 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100 flex items-center justify-center" title="Delete document">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {expanded === i && (
                      <pre className="text-[10px] bg-slate-50 border-t border-slate-100 rounded-b-xl p-3 overflow-x-auto max-h-64 overflow-y-auto">{JSON.stringify(d, null, 2)}</pre>
                    )}
                  </div>
                ))}
                {docs.length === 0 && <div className="text-center text-xs text-slate-400 py-6">No documents{q ? " match your search" : ""}.</div>}
              </div>

              {total > PAGE && (
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <button disabled={skip === 0} onClick={() => loadDocs(sel, Math.max(0, skip - PAGE))} data-testid="db-prev-page"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"><ChevronLeft className="w-3 h-3" /> Prev</button>
                  <span>{skip + 1}–{Math.min(skip + PAGE, total)} of {total}</span>
                  <button disabled={skip + PAGE >= total} onClick={() => loadDocs(sel, skip + PAGE)} data-testid="db-next-page"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Next <ChevronRight className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
