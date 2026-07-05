import { useEffect, useState } from "react";
import api from "@/lib/api";
import { CheckCircle2, Circle, Gauge } from "lucide-react";

const CHECKS = [
  { key: "logo_url", label: "Salon logo", hint: "Upload in Logo Studio" },
  { key: "hero_image", label: "Hero image", hint: "Salon profile below" },
  { key: "location", label: "Address", hint: "Salon profile below" },
  { key: "phone", label: "Phone", hint: "Salon profile below" },
  { key: "whatsapp_number", label: "WhatsApp", hint: "Salon profile below" },
  { key: "hours", label: "Working hours", hint: "Salon profile below" },
  { key: "google_review_url", label: "Google review link", hint: "Salon profile below" },
  { key: "maps_url", label: "Google Maps link", hint: "Salon profile below" },
  { key: "instagram_url", label: "Instagram", hint: "Salon profile below" },
  { key: "_gps", label: "GPS check-in pin", hint: "Attendance page" },
];

export function ProfileCompletenessCard() {
  const [tenant, setTenant] = useState(null);
  useEffect(() => {
    api.get("/tenants/current").then(r => setTenant(r.data)).catch(() => {});
  }, []);
  if (!tenant) return null;

  const done = (c) => c.key === "_gps"
    ? Boolean(tenant.latitude && tenant.longitude)
    : Boolean((tenant[c.key] || "").toString().trim());
  const doneCount = CHECKS.filter(done).length;
  const pct = Math.round((doneCount / CHECKS.length) * 100);
  const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";
  const message = pct === 100
    ? "Perfect — your booking page is fully dressed to convert visitors ✦"
    : "Complete profiles convert more booking-page visitors into appointments.";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="settings-completeness-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center flex-shrink-0">
          <Gauge className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-800">Profile completeness</h2>
            <span data-testid="completeness-pct" className={`text-sm font-bold ${pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-rose-600"}`}>
              {pct}%
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">{message}</p>
        </div>
      </div>

      <div className="mt-4 h-2.5 rounded-full bg-slate-100 overflow-hidden" data-testid="completeness-bar">
        <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {CHECKS.map(c => {
          const ok = done(c);
          return (
            <div
              key={c.key}
              data-testid={`check-${c.key}`}
              title={ok ? `${c.label} — done` : `Missing — add via: ${c.hint}`}
              className={`flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg border ${ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-slate-50 border-slate-200 text-slate-400"}`}
            >
              {ok ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <Circle className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="truncate">{c.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
