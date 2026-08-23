import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import pinApi from "@/lib/ownerPin";
import { ManualAttendanceModal } from "@/components/ManualAttendanceModal";
import { ConfirmDialog, askConfirm } from "@/components/ConfirmDialog";
import { getSelectedBranch, mainSalonLabel } from "@/lib/branch";
import { toast } from "sonner";
import {
  Clock, CheckCircle2, CircleAlert, UserCheck, Calendar, ArrowLeft, MapPin, QrCode, Download, Mail,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const STATUS_STYLES = {
  on_shift: { label: "On shift", cls: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  completed: { label: "Completed", cls: "bg-sky-100 text-sky-700 border-sky-200", dot: "bg-sky-500" },
  absent: { label: "Not checked in", cls: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  on_leave: { label: "On leave", cls: "bg-violet-100 text-violet-700 border-violet-200", dot: "bg-violet-500" },
  week_off: { label: "🏖️ Week off", cls: "bg-teal-50 text-teal-700 border-teal-200", dot: "bg-teal-500" },
};

export default function Attendance() {
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // {sid, name} for history modal
  const [showQr, setShowQr] = useState(false);
  const qrBranch = getSelectedBranch();
  const qrUrl = `${API}/attendance/desk-qr${qrBranch ? `?branch=${encodeURIComponent(qrBranch)}` : ""}`;
  const [showManual, setShowManual] = useState(false);
  const [dlg, setDlg] = useState(null); // {title, message, inputLabel?, defaultValue?, confirmLabel, danger, action}

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = getSelectedBranch();
      const { data } = await api.get("/attendance/today", { params: b ? { date, branch: b } : { date } });
      setData(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener("branch-changed", load);
    return () => window.removeEventListener("branch-changed", load);
  }, [load]);

  async function waiveFine(r, note) {
    if (!r.record_id) return;
    try {
      await pinApi.post(`/attendance/${r.record_id}/waive-fine`, { note });
      toast.success(`₹${r.late_penalty} fine waived for ${r.name}`);
      setDlg(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't waive fine");
    }
  }

  async function undoWaiveFine(r) {
    if (!r.record_id) return;
    try {
      await pinApi.post(`/attendance/${r.record_id}/undo-waive-fine`);
      toast.success(`₹${r.late_penalty_waived} fine restored for ${r.name}`);
      setDlg(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't undo waiver");
    }
  }

  async function waiveHalfDay(r, note) {
    if (!r.record_id) return;
    try {
      await pinApi.post(`/attendance/${r.record_id}/waive-half-day`, { note });
      toast.success(`Half-day waived for ${r.name}`);
      setDlg(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't waive half-day");
    }
  }

  async function undoCheckout(r) {
    try {
      await pinApi.post(`/attendance/${r.record_id}/undo-checkout`, {});
      toast.success(`${r.name}'s check-out undone — still checked in ✓`);
      setDlg(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't undo the check-out"); }
  }

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-playfair text-2xl sm:text-3xl">Attendance</h1>
          <p className="text-slate-500 text-sm mt-1">
            See who checked in, who&apos;s still on shift, and download history.
            {getSelectedBranch() && (
              <span data-testid="attendance-branch-filter-tag" className="ml-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 font-medium">
                <MapPin className="w-3 h-3" /> {getSelectedBranch()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid="manual-attendance-btn" onClick={() => setShowManual(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-full bg-slate-900 text-white hover:bg-slate-700">
            <UserCheck className="w-3.5 h-3.5" /> Manual Check-In
          </button>
          {showManual && (
            <ManualAttendanceModal roster={data?.roster || []} onClose={() => setShowManual(false)} onDone={load} />
          )}
          {dlg && (
            <ConfirmDialog open {...dlg} onConfirm={(note) => dlg.action(note)} onClose={() => setDlg(null)} />
          )}
          <button data-testid="desk-qr-btn" onClick={() => setShowQr(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">
            <QrCode className="w-3.5 h-3.5" /> Desk QR
          </button>
          {showQr && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="desk-qr-modal" onClick={() => setShowQr(false)}>
              <div className="bg-white rounded-2xl p-5 text-center max-w-sm w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h3 className="font-playfair text-xl">Staff Check-in QR</h3>
                {qrBranch && <p className="text-[11px] font-bold text-violet-600 mt-0.5" data-testid="desk-qr-branch-tag">📍 {qrBranch}</p>}
                <p className="text-xs text-slate-500 mt-1">Print & keep this poster at the salon desk — staff scan it with their phone camera to check in instantly (no GPS needed). Late fines & half-day rules still apply.</p>
                <img src={qrUrl} alt="Staff check-in QR poster" data-testid="desk-qr-img"
                  className="w-64 mx-auto my-4 rounded-xl shadow-lg border border-slate-200" />
                <div className="flex gap-2 justify-center flex-wrap">
                  <button data-testid="desk-qr-download" onClick={async () => {
                    try {
                      const res = await fetch(qrUrl, { credentials: "include" });
                      const blob = await res.blob();
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = "staff-checkin-qr.png";
                      a.click();
                      URL.revokeObjectURL(a.href);
                      toast.success("QR poster downloaded");
                    } catch { toast.error("Download failed"); }
                  }} className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-full bg-amber-500 text-black font-bold hover:bg-amber-400">
                    <Download className="w-3.5 h-3.5" /> Download poster
                  </button>
                  <a href={qrUrl} target="_blank" rel="noreferrer" data-testid="desk-qr-print"
                    className="text-xs px-4 py-2 rounded-full border border-slate-200 hover:bg-slate-50 inline-flex items-center">Open full size / print</a>
                  <button onClick={() => setShowQr(false)} data-testid="desk-qr-close" className="text-xs px-4 py-2 rounded-full bg-slate-900 text-white">Done</button>
                </div>
              </div>
            </div>
          )}
          <button data-testid="attendance-email-month-btn" onClick={async () => {
            try {
              const { data } = await api.post("/reports/attendance-month/email");
              toast.success(data.ok ? `Monthly attendance sheet emailed to ${data.recipients.join(", ")}` : (data.error || "Email failed"));
            } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Couldn't send"); }
          }}
            title="Email me this month's per-staff sheet of half-days, lates & fines (also sent automatically on the 1st)"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Mail className="w-3.5 h-3.5" /> Email monthly sheet
          </button>
          <Calendar className="w-4 h-4 text-slate-500" />
          <input
            data-testid="attendance-date-input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="input-light py-1.5"
          />
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <SummaryTile label="Total staff" value={data?.total_staff ?? 0} icon={UserCheck} tone="slate" testid="sum-total" />
        <SummaryTile label="On shift" value={data?.on_shift ?? 0} icon={Clock} tone="emerald" testid="sum-on-shift" />
        <SummaryTile label="Completed" value={data?.completed ?? 0} icon={CheckCircle2} tone="sky" testid="sum-completed" />
        <SummaryTile label="Absent" value={data?.absent ?? 0} icon={CircleAlert} tone="rose" testid="sum-absent" />
        <SummaryTile label="On leave" value={data?.on_leave ?? 0} icon={Calendar} tone="violet" testid="sum-on-leave" />
        <SummaryTile label="Week off" value={data?.week_off ?? 0} icon={Calendar} tone="teal" testid="sum-week-off" />
      </div>

      <GeoFenceCard />

      <LeaveManager roster={data?.roster || []} onChanged={load} />

      <WeekOffManager onChanged={load} />

      {/* Roster table */}
      <div className="card-light p-0 overflow-x-auto" data-testid="attendance-roster">
        <table className="luxe-table-light min-w-[720px]">
          <thead>
            <tr>
              <th className="text-left">Staff</th>
              <th>Status</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Hours</th>
              <th>Fine / OT</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="text-center py-6 text-slate-400">Loading…</td></tr>
            )}
            {!loading && data?.roster?.map(r => {
              const st = STATUS_STYLES[r.status] || STATUS_STYLES.absent;
              return (
                <tr key={r.staff_id} data-testid={`roster-row-${r.staff_id}`}>
                  <td>
                    <div className="flex items-center gap-3">
                      <img
                        src={r.image_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100"}
                        alt={r.name}
                        className="w-9 h-9 rounded-full object-cover"
                      />
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-slate-500">
                          {r.role}
                          {r.branch && <span className="ml-1 text-violet-500" title={r.branch}>· 📍 {r.branch.length > 24 ? r.branch.slice(0, 24) + "…" : r.branch}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${st.cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                    {!r.has_login && (
                      <span className="ml-2 text-[10px] text-slate-400 italic">no login</span>
                    )}
                  </td>
                  <td className="tabular-nums">
                    {fmtTime(r.check_in_at)}
                    {r.check_in_method === "manual_admin" && (
                      <span data-testid={`manual-badge-${r.staff_id}`} title={r.marked_by ? `Marked by ${r.marked_by}` : "Marked by owner"}
                        className="ml-1.5 inline-flex items-center text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">by owner</span>
                    )}
                    {r.check_in_method === "qr" && (
                      <span className="ml-1.5 text-[9px] uppercase text-sky-500 font-semibold" title="Checked in via desk QR">qr</span>
                    )}
                    {r.week_off_override && (
                      <span data-testid={`week-off-worked-${r.staff_id}`} title="Worked on their week-off day — confirmed owner approval at check-in"
                        className="ml-1.5 inline-flex items-center text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 border border-teal-200">week-off ⚠</span>
                    )}
                  </td>
                  <td className="tabular-nums">
                    {fmtTime(r.check_out_at)}
                    {r.check_out_method === "manual_admin" && (
                      <span title={r.marked_by ? `Marked by ${r.marked_by}` : "Marked by owner"}
                        className="ml-1.5 inline-flex items-center text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">by owner</span>
                    )}
                    {r.check_out_at && r.record_id && (
                      <button data-testid={`undo-checkout-${r.staff_id}`}
                        title="Mistaken check-out? Undo it — they'll stay checked in"
                        onClick={() => setDlg({
                          title: "Undo check-out", danger: true, confirmLabel: "Undo check-out",
                          message: `Undo ${r.name}'s check-out? They'll be marked as still checked in.`,
                          action: () => undoCheckout(r),
                        })}
                        className="ml-1.5 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border border-rose-200 text-rose-500 hover:bg-rose-50">↩ undo</button>
                    )}
                  </td>
                  <td className="tabular-nums font-medium">
                    {r.hours > 0 ? `${r.hours}h` : "—"}
                    {r.auto_checked_out && <span className="ml-1 text-[9px] text-amber-600 uppercase">auto</span>}
                  </td>
                  <td>
                    <div className="flex flex-col gap-0.5 text-[11px]">
                      {r.half_day && (
                        <span className="text-amber-700 font-semibold flex items-center gap-1.5" data-testid={`half-day-${r.staff_id}`}>
                          ½ day {r.no_show && !r.check_in_at ? "(no show)" : "(3h+ late)"} −₹{r.half_day_deduction}
                          <button
                            data-testid={`waive-half-day-${r.staff_id}`}
                            title="Waive this half-day (wrongly applied)"
                            onClick={() => setDlg({
                              title: "Waive half-day", confirmLabel: "Waive half-day",
                              message: `Waive the ½-day mark (−₹${r.half_day_deduction}) for ${r.name}?`,
                              inputLabel: "Short reason", defaultValue: "Applied by mistake",
                              action: (note) => waiveHalfDay(r, note),
                            })}
                            className="text-[9px] uppercase px-1.5 py-0.5 rounded border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-300"
                          >waive</button>
                        </span>
                      )}
                      {r.check_in_method === "qr" && <span className="text-sky-600">via desk QR</span>}
                      {r.late_penalty > 0 && (
                        <span className="text-red-600 flex items-center gap-1.5" data-testid={`late-fine-${r.staff_id}`}>
                          −₹{r.late_penalty} ({r.late_minutes}m late)
                          <button
                            data-testid={`waive-fine-${r.staff_id}`}
                            title="Waive this fine (wrongly applied)"
                            onClick={() => setDlg({
                              title: "Waive late fine", confirmLabel: "Waive fine",
                              message: `Waive the ₹${r.late_penalty} late fine for ${r.name}?`,
                              inputLabel: "Short reason", defaultValue: "Applied by mistake",
                              action: (note) => waiveFine(r, note),
                            })}
                            className="text-[9px] uppercase px-1.5 py-0.5 rounded border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-300"
                          >waive</button>
                        </span>
                      )}
                      {r.late_penalty_waived > 0 && !(r.late_penalty > 0) && (
                        <span className="text-emerald-600 flex items-center gap-1.5" data-testid={`fine-waived-${r.staff_id}`}>
                          ₹{r.late_penalty_waived} fine waived ✓
                          <button
                            data-testid={`undo-waive-fine-${r.staff_id}`}
                            title="Undo this waiver (restore the fine)"
                            onClick={() => undoWaiveFine(r)}
                            className="text-[9px] uppercase px-1.5 py-0.5 rounded border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300"
                          >↩ undo</button>
                        </span>
                      )}
                      {r.overtime_pay > 0 && (
                        <span className="text-emerald-600" data-testid={`ot-pay-${r.staff_id}`}>+₹{r.overtime_pay} OT ({r.overtime_hours}h)</span>
                      )}
                      {!(r.late_penalty > 0) && !(r.overtime_pay > 0) && !(r.late_penalty_waived > 0) && <span className="text-slate-300">—</span>}
                    </div>
                  </td>
                  <td>
                    <button
                      onClick={() => setSelected({ sid: r.staff_id, name: r.name })}
                      className="text-xs text-sky-600 hover:underline"
                      data-testid={`view-history-${r.staff_id}`}
                    >
                      History
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && data?.roster?.length === 0 && (
              <tr><td colSpan={7} className="text-center py-6 text-slate-400">No active staff — add staff first.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <HistoryModal
          sid={selected.sid}
          staffName={selected.name}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function GeoFenceCard() {
  const [tenant, setTenant] = useState(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(""); // "" = main salon, else branch name
  const [fenceM, setFenceM] = useState(300);
  const [mapsLink, setMapsLink] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get("/tenants/current"); setTenant(data); } catch { /* non-admin */ }
    try { const { data } = await api.get("/settings/late-fines"); setFenceM(data.geo_fence_m || 300); } catch { /* default */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const branches = tenant?.branches || [];
  const targetBranch = branches.find(b => b.name === target);
  const cur = target ? targetBranch : tenant;
  const isSet = cur?.latitude != null && cur?.longitude != null;
  const label = target ? `branch "${target}"` : "the main salon";

  async function setHere() {
    if (!navigator.geolocation) { toast.error("This device doesn't support GPS"); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          await api.put("/tenants/current/geo", { latitude: p.coords.latitude, longitude: p.coords.longitude, branch: target || null });
          toast.success(`Location pinned for ${label} — check-in geo-fenced to ${fenceM}m`);
          load();
        } catch (e) {
          toast.error(formatApiError(e.response?.data?.detail) || "Couldn't save location");
        } finally { setBusy(false); }
      },
      () => { toast.error("Allow location access to pin the salon"); setBusy(false); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function saveFromLink() {
    const url = mapsLink.trim();
    if (!url) { toast.error("Paste a Google Maps link first"); return; }
    setLinkBusy(true);
    try {
      const { data } = await api.post("/tenants/current/geo/from-link", { url, branch: target || null });
      toast.success(`Location saved for ${label}${data.resolved ? ` — ${data.resolved}` : ""} (${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)}) — fence ${fenceM}m`);
      setMapsLink("");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't read that link");
    } finally { setLinkBusy(false); }
  }

  async function clear() {
    askConfirm({
      title: "Remove geo-fence?", message: `The GPS check-in fence for ${label} will be removed.`, confirmLabel: "Yes, remove", danger: true,
      action: async () => {
        try {
          await api.delete(`/tenants/current/geo${target ? `?branch=${encodeURIComponent(target)}` : ""}`);
          toast.success("Geo-fence removed");
          load();
        } catch { toast.error("Couldn't remove"); }
      },
    });
  }

  return (
    <div className="card-light space-y-3" data-testid="geo-fence-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isSet ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
              GPS check-in fence
              {branches.length > 0 && (
                <select data-testid="geo-target-select" value={target} onChange={e => setTarget(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white max-w-[220px]">
                  <option value="">🏠 {mainSalonLabel(tenant)} (Main)</option>
                  {branches.map(b => <option key={b.id || b.name} value={b.name}>{b.name}{b.latitude != null ? " ✓" : ""}</option>)}
                </select>
              )}
              <span className={isSet ? "text-emerald-600" : "text-amber-600"}>{isSet ? "· ON" : "· OFF"}</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {isSet
                ? `Staff assigned to ${label} can only check in within ${fenceM}m (pinned at ${Number(cur.latitude).toFixed(4)}, ${Number(cur.longitude).toFixed(4)}). Late fines are active. Adjust the radius in Settings → Late check-in fines.`
                : `Not pinned for ${label} — those staff can check in from anywhere and NO late fines apply. Paste the salon's Google Maps link below, or pin from the salon.`}
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button data-testid="set-salon-geo-btn" onClick={setHere} disabled={busy} className="btn-slate text-xs py-2 px-3 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> {busy ? "Locating…" : "Pin my current location"}
          </button>
          {isSet && (
            <button data-testid="clear-salon-geo-btn" onClick={clear} className="btn-slate text-xs py-2 px-3">Remove</button>
          )}
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center border-t border-slate-100 pt-3">
        <input
          data-testid="geo-maps-link-input"
          value={mapsLink}
          onChange={e => setMapsLink(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") saveFromLink(); }}
          placeholder={`Paste Google Maps link for ${label}, or type its name & area (e.g. Miracurl Salon Marathahalli)`}
          className="input-light text-xs flex-1 min-w-0"
        />
        <button data-testid="geo-maps-link-save-btn" onClick={saveFromLink} disabled={linkBusy || !mapsLink.trim()}
          className="btn-blue text-xs py-2 px-4 shrink-0 disabled:opacity-50">
          {linkBusy ? "Reading link…" : isSet ? "Update from link" : "Save location from link"}
        </button>
      </div>
      <div className="text-[11px] text-slate-400 -mt-1">
        In Google Maps: search your salon → Share → Copy link, then paste it here — or just type the salon name + area. Works with short links (maps.app.goo.gl) and full browser URLs.
      </div>
      {isSet && (
        <div className="rounded-lg overflow-hidden border border-slate-200" data-testid="geo-map-preview">
          <iframe
            title={`Pinned location of ${label}`}
            src={`https://maps.google.com/maps?q=${cur.latitude},${cur.longitude}&z=17&output=embed`}
            className="w-full h-44 block"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 text-[11px] text-slate-500">
            <span>Pin for {label} — staff must check in within {fenceM}m of this point. Wrong spot? Paste a new link above.</span>
            <a href={`https://www.google.com/maps?q=${cur.latitude},${cur.longitude}`} target="_blank" rel="noreferrer"
              className="text-sky-600 hover:underline shrink-0" data-testid="geo-map-open-link">Open in Google Maps</a>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, icon: Icon, tone, testid }) {
  const toneMap = {
    slate: "text-slate-600 bg-slate-100",
    emerald: "text-emerald-600 bg-emerald-100",
    sky: "text-sky-600 bg-sky-100",
    rose: "text-rose-600 bg-rose-100",
    violet: "text-violet-600 bg-violet-100",
    teal: "text-teal-600 bg-teal-100",
  };
  return (
    <div className="card-light" data-testid={testid}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
          <div className="font-playfair text-2xl">{value}</div>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ sid, staffName, onClose }) {
  const [month, setMonth] = useState(currentMonth());
  const [hist, setHist] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/attendance/staff/${sid}`, { params: { month } });
        if (!cancelled) setHist(data);
      } catch (e) {
        if (!cancelled) toast.error(formatApiError(e.response?.data?.detail) || "Failed");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [sid, month]);

  const monthOptions = (() => {
    const arr = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      arr.push({
        value: `${y}-${m}`,
        label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
      });
    }
    return arr;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="card-light w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-800">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h3 className="font-playfair text-xl text-center">{staffName}</h3>
            <p className="text-xs text-slate-500 text-center">Attendance history</p>
          </div>
          <div className="w-6" />
        </div>

        <div className="mb-4">
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="input-light w-full"
            data-testid="history-month-select"
          >
            {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {loading || !hist ? (
          <div className="text-center py-8 text-slate-400 text-sm">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">Days present</div>
                <div className="font-playfair text-2xl text-slate-800">{hist.days_present}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">Total hours</div>
                <div className="font-playfair text-2xl text-slate-800">{hist.total_hours}h</div>
              </div>
            </div>

            {hist.records.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-sm">No records this month.</div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {hist.records.map(r => (
                  <div key={r.id || r.date} className="px-3 py-2.5 flex items-center justify-between text-sm">
                    <div className="text-slate-800">
                      {new Date(r.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                    </div>
                    <div className="text-slate-600 text-xs tabular-nums">
                      {fmtTime(r.check_in_at)} → {fmtTime(r.check_out_at)}
                      {r.hours_worked ? <span className="ml-2 text-sky-600 font-medium">{r.hours_worked}h</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LeaveManager({ roster, onChanged }) {
  const [pending, setPending] = useState([]);
  const [showMark, setShowMark] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const load = () => api.get("/leave-requests?status=pending").then(r => setPending(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function decide(rid, action) {
    setBusy(rid);
    try {
      await api.post(`/leave-requests/${rid}/${action}`, {});
      toast.success(action === "approve" ? "Leave approved — they'll show On leave" : "Leave rejected");
      load(); onChanged?.();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
    finally { setBusy(""); }
  }

  async function markLeave() {
    if (!staffId || !from || !to) { toast.error("Pick staff and both dates"); return; }
    setBusy("mark");
    try {
      await api.post("/leave-requests/admin-mark", { staff_id: staffId, from_date: from, to_date: to, reason });
      toast.success("Leave marked — hidden from booking page & shown as On leave for those dates");
      setShowMark(false); setStaffId(""); setFrom(""); setTo(""); setReason("");
      load(); onChanged?.();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Couldn't mark leave"); }
    finally { setBusy(""); }
  }

  return (
    <div className="card-light" data-testid="leave-manager-card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="font-medium text-sm flex items-center gap-2">
          🌴 Leave
          {pending.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{pending.length} pending</span>}
        </div>
        <button data-testid="mark-leave-btn" onClick={() => setShowMark(s => !s)}
          className="btn-blue text-xs py-2 px-4">{showMark ? "Close" : "Mark leave"}</button>
      </div>
      {showMark && (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
          <select data-testid="mark-leave-staff" value={staffId} onChange={e => setStaffId(e.target.value)} className="input-light text-xs">
            <option value="">Pick staff…</option>
            {roster.map(r => <option key={r.staff_id} value={r.staff_id}>{r.name}</option>)}
          </select>
          <input data-testid="mark-leave-from" type="date" value={from} onChange={e => setFrom(e.target.value)} className="input-light text-xs" />
          <input data-testid="mark-leave-to" type="date" value={to} onChange={e => setTo(e.target.value)} className="input-light text-xs" />
          <input data-testid="mark-leave-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)" className="input-light text-xs" />
          <button data-testid="mark-leave-save" onClick={markLeave} disabled={busy === "mark"}
            className="btn-blue text-xs py-2 disabled:opacity-50">{busy === "mark" ? "Saving…" : "Save leave"}</button>
        </div>
      )}
      {pending.length === 0 ? (
        <p className="text-xs text-slate-400">No pending leave requests. Staff can apply from their portal — requests appear here for approval.</p>
      ) : (
        <div className="space-y-2">
          {pending.map(r => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2" data-testid={`pending-leave-${r.id}`}>
              <div className="text-xs text-slate-700">
                <b>{r.staff_name}</b> · {r.from_date} → {r.to_date} ({r.days} day{r.days > 1 ? "s" : ""})
                {r.reason && <span className="text-slate-400"> · {r.reason}</span>}
              </div>
              <div className="flex gap-2">
                <button data-testid={`approve-leave-${r.id}`} disabled={busy === r.id} onClick={() => decide(r.id, "approve")}
                  className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button>
                <button data-testid={`reject-leave-${r.id}`} disabled={busy === r.id} onClick={() => decide(r.id, "reject")}
                  className="text-xs px-3 py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeekOffManager({ onChanged }) {
  const [pending, setPending] = useState([]);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState("");
  const load = () => {
    api.get("/week-off-requests?status=pending").then(r => setPending(r.data)).catch(() => {});
    api.get("/week-off-requests?status=approved").then(r => setRecent(r.data.slice(0, 4))).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function decide(rid, action) {
    setBusy(rid);
    try {
      const { data } = await api.post(`/week-off-requests/${rid}/${action}`, {});
      toast.success(action === "approve"
        ? `Week-off change approved — effective from ${data.effective_from} (next day)`
        : "Week-off change rejected");
      load(); onChanged?.();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Action failed"); }
    finally { setBusy(""); }
  }

  const fmt = (iso) => iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";
  const cap = (d) => d ? d[0].toUpperCase() + d.slice(1) : "—";

  return (
    <div className="card-light" data-testid="week-off-manager-card">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="font-semibold flex items-center gap-2">📅 Week-Off Change Requests</div>
        {pending.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-semibold">{pending.length} pending</span>}
      </div>
      <p className="text-xs text-slate-400 mb-3">Staff can request a new week-off day (Mon–Thu only, never Fri/Sat/Sun, never same-day). Request & approval times are locked. Approved changes take effect the NEXT day.</p>
      {pending.length === 0 ? (
        <p className="text-xs text-slate-400">No pending week-off change requests.</p>
      ) : (
        <div className="space-y-2">
          {pending.map(r => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2" data-testid={`pending-week-off-${r.id}`}>
              <div className="text-sm">
                <b>{r.staff_name}</b> · {cap(r.current_day)} → <b className="text-violet-600">{cap(r.requested_day)}</b>
                <span className="text-slate-400 text-xs"> · requested {fmt(r.requested_at)} 🔒</span>
                {r.reason && <span className="text-slate-400 text-xs"> · {r.reason}</span>}
              </div>
              <div className="flex gap-2">
                <button data-testid={`approve-week-off-${r.id}`} disabled={busy === r.id} onClick={() => decide(r.id, "approve")}
                  className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button>
                <button data-testid={`reject-week-off-${r.id}`} disabled={busy === r.id} onClick={() => decide(r.id, "reject")}
                  className="text-xs px-3 py-1.5 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50">Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
          {recent.map(r => (
            <div key={r.id} className="text-xs text-slate-500" data-testid={`approved-week-off-${r.id}`}>
              ✅ {r.staff_name}: {cap(r.current_day)} → <b>{cap(r.requested_day)}</b> · approved {fmt(r.decided_at)} · effective {r.effective_from}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
