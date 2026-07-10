import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Rocket, Trash2, CheckCircle2 } from "lucide-react";

export const DeploymentHistoryPanel = () => {
  const [releases, setReleases] = useState([]);
  const [version, setVersion] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, v] = await Promise.all([api.get("/super/releases"), api.get("/super/version")]);
      setReleases(r.data.releases || []);
      setVersion(v.data);
    } catch { toast.error("Couldn't load deployment history"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(r) {
    if (!window.confirm(`Delete ${r.tag} from the history? This cannot be undone.`)) return;
    try { await api.delete(`/super/releases/${r.id}`); toast.success("Entry deleted"); load(); }
    catch { toast.error("Delete failed"); }
  }

  return (
    <div className="space-y-6" data-testid="deployment-history-panel">
      <div>
        <h1 className="font-playfair text-3xl flex items-center gap-2"><Rocket className="w-7 h-7 text-sky-600" /> Deployment History</h1>
        <p className="text-slate-500 text-sm mt-1">
          Every release deployed to your live site, with what changed. New entries appear automatically after each deployment.
          Delete old ones to keep roughly the last 10.
        </p>
      </div>

      {version && (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl px-5 py-4" data-testid="server-build-banner">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold">This server is running</p>
          <p className="text-emerald-300 font-mono font-bold text-lg mt-1" data-testid="server-build-value">{version.latest_tag} · build {version.build}</p>
          <p className="text-[11px] text-slate-400 mt-1.5">
            Open this same tab on your <b className="text-slate-300">live site</b> and on the <b className="text-slate-300">preview</b> — if the build numbers differ,
            the live site is behind: click <b className="text-amber-300">Deploy</b> to push the newer build.
          </p>
        </div>
      )}

      {loading ? <div className="text-slate-400 py-8 text-center">Loading…</div> : releases.length === 0 ? (
        <div className="card-light text-center py-10 text-slate-400 text-sm" data-testid="releases-empty">No deployment records yet.</div>
      ) : (
        <div className="space-y-4">
          {releases.length > 10 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              You have {releases.length} entries — consider deleting the oldest to keep the last 10.
            </div>
          )}
          {releases.map(r => (
            <div key={r.id} className="card-light" data-testid={`release-${r.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1 rounded-full bg-slate-900 text-emerald-300 border border-slate-700" data-testid={`release-tag-${r.id}`}>
                    <Rocket className="w-3 h-3" /> {r.tag}
                  </span>
                  <span className="text-xs text-slate-400">{new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span>
                  {version && r.tag === version.latest_tag && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300" data-testid={`release-current-${r.id}`}>
                      <CheckCircle2 className="w-3 h-3" /> On this server
                    </span>
                  )}
                </div>
                <button data-testid={`release-delete-${r.id}`} onClick={() => remove(r)}
                  className="p-1.5 text-slate-400 hover:text-red-500 shrink-0" title="Delete this entry">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <ul className="mt-3 space-y-1.5">
                {(r.changes || []).map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
