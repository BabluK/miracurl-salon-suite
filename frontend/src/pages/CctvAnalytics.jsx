import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Cctv, Users, Armchair, Clock, UserX, Camera, RefreshCw, Save } from "lucide-react";

export default function CctvAnalytics() {
  const [data, setData] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(() => {
    api.get("/cctv/latest").then(r => setData(r.data)).catch(() => {});
    api.get("/cctv/config").then(r => setCfg(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const saveCfg = async () => {
    setSaving(true);
    try {
      await api.put("/cctv/config", cfg);
      toast.success("Camera settings saved");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Couldn't save"); }
    finally { setSaving(false); }
  };

  const testSnap = async () => {
    setTesting(true);
    try {
      const { data: out } = await api.post("/cctv/test-snapshot");
      toast.success(`Analyzed! ${out.observation.people_total} people, ${out.observation.chairs_empty} empty chairs`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Snapshot test failed"); }
    finally { setTesting(false); }
  };

  const obs = data?.observation;
  const ago = obs ? Math.round((Date.now() - new Date(obs.at).getTime()) / 60000) : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6" data-testid="cctv-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">AI CCTV Analytics</div>
          <h1 className="font-playfair text-3xl mt-1 flex items-center gap-3"><Cctv className="w-7 h-7 text-gold" /> Salon floor, live</h1>
          <p className="text-white/60 text-sm mt-1">Vision AI reads a camera frame every few minutes — waiting guests, empty chairs, queue and idle staff.</p>
        </div>
        <Link to="/cctv-capture" data-testid="open-capture-btn"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-gold to-blush text-bg-base text-sm font-semibold hover:opacity-90">
          <Camera className="w-4 h-4" /> Open capture mode
        </Link>
      </div>

      {/* Live stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Users} label="Waiting customers" value={obs ? obs.waiting_customers : "—"} testid="cctv-stat-waiting" alert={obs?.waiting_customers >= 3} />
        <Stat icon={Armchair} label="Empty chairs" value={obs ? obs.chairs_empty : "—"} testid="cctv-stat-empty" />
        <Stat icon={Clock} label="Queue length" value={obs ? obs.queue_length : "—"} testid="cctv-stat-queue" alert={obs?.queue_length >= 3} />
        <Stat icon={UserX} label="Idle staff" value={obs ? obs.staff_idle : "—"} testid="cctv-stat-idle" alert={obs?.staff_idle >= 2} />
      </div>

      {obs && (
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 rounded-2xl bg-[#0F0F0F] border border-white/5 p-5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-2">Last analysis · {ago <= 1 ? "just now" : `${ago} min ago`}</div>
            <p className="text-sm text-white/80" data-testid="cctv-scene-notes">"{obs.scene_notes}"</p>
            <div className="mt-3 text-xs text-white/50 flex flex-wrap gap-x-4 gap-y-1">
              <span>👥 {obs.people_total} people total</span>
              <span>💇 {obs.customers_in_service} in service</span>
              <span>🪑 {obs.chairs_total} chairs visible</span>
              <span>🧑‍💼 {obs.staff_visible} staff visible</span>
              <span>{data.observations_today} frames analyzed today</span>
            </div>
          </div>
          {data.last_frame_b64 && (
            <div className="lg:w-72 rounded-2xl bg-[#0F0F0F] border border-white/5 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-2 px-1">Last analyzed frame</div>
              <img src={`data:image/jpeg;base64,${data.last_frame_b64}`} alt="Last analyzed frame" className="rounded-lg w-full" data-testid="cctv-last-frame" />
            </div>
          )}
        </div>
      )}

      {/* Hourly trend */}
      {data?.trend?.length > 0 && (
        <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5" data-testid="cctv-trend">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-4">Today · hourly averages</div>
          <div className="space-y-2">
            {data.trend.map(h => (
              <div key={h.hour} className="flex items-center gap-3 text-xs">
                <span className="w-12 text-white/50 font-mono">{String(h.hour).padStart(2, "0")}:00</span>
                <Bar label="waiting" value={h.waiting} max={8} color="bg-amber-400" />
                <Bar label="empty" value={h.empty_chairs} max={10} color="bg-sky-400" />
                <span className="text-white/40 whitespace-nowrap">queue max {h.max_queue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Setup */}
      {cfg && (
        <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 space-y-4" data-testid="cctv-setup">
          <div className="font-playfair text-lg">Camera connection</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ModeBtn active={cfg.mode === "device"} onClick={() => setCfg({ ...cfg, mode: "device" })} testid="cctv-mode-device"
              title="📱 Tablet / phone camera" desc="Mount a spare device facing the floor and run Capture mode. Works today, zero setup." />
            <ModeBtn active={cfg.mode === "snapshot_url"} onClick={() => setCfg({ ...cfg, mode: "snapshot_url" })} testid="cctv-mode-url"
              title="🎥 DVR snapshot URL" desc="We poll your Hikvision/DVR ISAPI snapshot link automatically (needs port-forwarding on your router)." />
          </div>
          {cfg.mode === "snapshot_url" && (
            <div className="space-y-3">
              <div className="text-xs text-amber-300/80 bg-amber-400/10 border border-amber-400/20 rounded-lg p-3">
                ℹ️ <b>Hik-Connect note:</b> the app's share-QR can't be used by servers. To use this mode, enable port-forwarding on your router to the DVR (port 80/HTTP), then use:{" "}
                <code className="bg-black/40 px-1 rounded">http://YOUR-PUBLIC-IP:PORT/ISAPI/Streaming/channels/101/picture</code>{" "}
                with your DVR admin username/password. Otherwise, use Tablet capture mode — it works right now.
              </div>
              <input value={cfg.snapshot_url} onChange={e => setCfg({ ...cfg, snapshot_url: e.target.value })}
                placeholder="http://your-dvr-ip:port/ISAPI/Streaming/channels/101/picture"
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2.5 text-sm font-mono" data-testid="cctv-url-input" />
              <div className="grid grid-cols-2 gap-3">
                <input value={cfg.username} onChange={e => setCfg({ ...cfg, username: e.target.value })} placeholder="DVR username (admin)"
                  className="bg-black/40 border border-white/10 rounded-md px-3 py-2.5 text-sm" data-testid="cctv-user-input" />
                <input type="password" value={cfg.password} onChange={e => setCfg({ ...cfg, password: e.target.value })} placeholder="DVR password"
                  className="bg-black/40 border border-white/10 rounded-md px-3 py-2.5 text-sm" data-testid="cctv-pass-input" />
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-white/60 flex items-center gap-2">
              Analyze every
              <select value={cfg.interval_min} onChange={e => setCfg({ ...cfg, interval_min: +e.target.value })}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-sm" data-testid="cctv-interval-select">
                {[2, 3, 5, 10, 15, 30].map(m => <option key={m} value={m}>{`${m} min`}</option>)}
              </select>
            </label>
            <label className="text-xs text-white/60 flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg({ ...cfg, enabled: e.target.checked })} data-testid="cctv-enabled-toggle" />
              Auto-polling on (9 AM – 9 PM)
            </label>
            <div className="flex-1" />
            {cfg.mode === "snapshot_url" && (
              <button onClick={testSnap} disabled={testing} data-testid="cctv-test-btn"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white/5 border border-white/15 text-sm hover:bg-white/10 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${testing ? "animate-spin" : ""}`} /> Test snapshot now
              </button>
            )}
            <button onClick={saveCfg} disabled={saving} data-testid="cctv-save-btn"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-to-r from-gold to-blush text-bg-base text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
          {data?.last_error && <div className="text-xs text-rose-400">Last poll error: {data.last_error}</div>}
        </div>
      )}

      {!obs && (
        <div className="rounded-2xl bg-[#0F0F0F] border border-dashed border-white/15 p-10 text-center text-white/50 text-sm" data-testid="cctv-empty">
          No frames analyzed yet. Tap <b className="text-gold">Open capture mode</b> on a device facing your salon floor — the first analysis appears here within a minute.
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, testid, alert }) {
  return (
    <div className={`rounded-xl bg-[#0F0F0F] border p-4 ${alert ? "border-rose-500/50" : "border-white/5"}`} data-testid={testid}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/40 mb-2">
        <Icon className={`w-3.5 h-3.5 ${alert ? "text-rose-400" : ""}`} /> {label}
      </div>
      <div className={`font-playfair text-3xl ${alert ? "text-rose-300" : "text-gold"}`}>{value}</div>
    </div>
  );
}

function Bar({ label, value, max, color }) {
  return (
    <div className="flex-1 flex items-center gap-1.5">
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
      <span className="text-white/50 w-16 whitespace-nowrap">{value} {label}</span>
    </div>
  );
}

function ModeBtn({ active, onClick, title, desc, testid }) {
  return (
    <button onClick={onClick} data-testid={testid}
      className={`text-left rounded-xl border p-4 transition ${active ? "border-gold bg-gold/10" : "border-white/10 bg-white/[0.02] hover:bg-white/5"}`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-white/50 mt-1 leading-relaxed">{desc}</div>
    </button>
  );
}
