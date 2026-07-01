import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Sunrise, CreditCard, Banknote, Smartphone, Users, Receipt, X, ChevronDown, ChevronUp, Trophy } from "lucide-react";

const DISMISS_KEY_PREFIX = "miracurl_daily_report_seen_";

const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/**
 * Daily revenue report banner shown on Dashboard.
 * - Fetches yesterday's numbers (IST) from /api/reports/daily
 * - Renders a warm morning greeting card with Card/UPI/Cash split + top staff
 * - Owner can dismiss for the current calendar day (persists in localStorage)
 * - Silently hides if there were zero invoices yesterday (no salt-in-the-wound)
 */
export default function DailyReportBanner({ ownerName }) {
  const [report, setReport] = useState(null);
  const [showStaff, setShowStaff] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.get("/reports/daily")
      .then((r) => setReport(r.data))
      .catch(() => setReport(null));
  }, []);

  useEffect(() => {
    if (!report?.date) return;
    try {
      const seen = localStorage.getItem(DISMISS_KEY_PREFIX + report.date);
      if (seen === "1") setDismissed(true);
    } catch { /* localStorage unavailable — treat as not dismissed */ }
  }, [report]);

  if (!report || report.is_empty || dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY_PREFIX + report.date, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  const { revenue, invoices, new_guests, staff, date_label } = report;
  const firstName = (ownerName || "").split(" ")[0] || "Boss";
  const cardPlusUpi = (revenue.card || 0) + (revenue.upi || 0);

  return (
    <div
      className="relative rounded-2xl overflow-hidden shadow-lg border border-amber-200/60"
      data-testid="daily-report-banner"
    >
      {/* Warm morning gradient — sunrise gold, unlike the sky-blue hero below */}
      <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md flex-shrink-0">
              <Sunrise className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-amber-700 font-semibold">
                Good morning, {firstName} ✦ Yesterday&apos;s Report
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1 leading-tight" data-testid="daily-report-total">
                {inr(revenue.total)}
              </div>
              <div className="text-xs text-slate-600 mt-0.5">{date_label} · {invoices} invoice{invoices === 1 ? "" : "s"}</div>
            </div>
          </div>
          <button
            onClick={dismiss}
            data-testid="daily-report-dismiss"
            className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-white/60 transition flex-shrink-0"
            aria-label="Dismiss for today"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Split by payment mode */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <PaymentTile icon={CreditCard} label="Card" value={revenue.card} accent="indigo" testid="daily-report-card" />
          <PaymentTile icon={Smartphone} label="UPI" value={revenue.upi} accent="fuchsia" testid="daily-report-upi" />
          <PaymentTile icon={Banknote} label="Cash" value={revenue.cash} accent="emerald" testid="daily-report-cash" />
          <PaymentTile icon={Users} label="New guests" value={new_guests} accent="rose" isCount testid="daily-report-new-guests" />
        </div>

        {/* Card+UPI vs Cash quick contrast line (helps owners see who prefers cash) */}
        {revenue.total > 0 && (
          <div className="mt-4 flex items-center gap-3 text-[11px] text-slate-500">
            <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500"
                style={{ width: `${(cardPlusUpi / revenue.total) * 100}%` }}
              />
            </div>
            <span>
              <b className="text-indigo-600">{Math.round((cardPlusUpi / revenue.total) * 100)}% digital</b>
              {" · "}
              <b className="text-emerald-600">{Math.round(((revenue.cash || 0) / revenue.total) * 100)}% cash</b>
            </span>
          </div>
        )}

        {/* Staff breakdown toggle */}
        {staff && staff.length > 0 && (
          <div className="mt-5 border-t border-amber-200/70 pt-4">
            <button
              type="button"
              onClick={() => setShowStaff((v) => !v)}
              data-testid="daily-report-toggle-staff"
              className="w-full flex items-center justify-between text-sm font-medium text-slate-700 hover:text-slate-900"
            >
              <span className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-600" />
                Business by staff · {staff.length} stylist{staff.length === 1 ? "" : "s"}
              </span>
              {showStaff ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showStaff && (
              <ul className="mt-3 space-y-2" data-testid="daily-report-staff-list">
                {staff.map((s, idx) => {
                  const pctOfTotal = revenue.total > 0 ? (s.gross / revenue.total) * 100 : 0;
                  return (
                    <li
                      key={s.staff_id}
                      className="flex items-center gap-3 bg-white/70 border border-white/80 rounded-lg px-3 py-2"
                      data-testid={`daily-report-staff-${s.staff_id}`}
                    >
                      <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                        idx === 0 ? "bg-amber-400 text-white" : idx === 1 ? "bg-slate-300 text-slate-800" : idx === 2 ? "bg-orange-300 text-white" : "bg-slate-100 text-slate-500"
                      }`}>{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{s.staff_name}</div>
                        <div className="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${Math.min(100, pctOfTotal)}%` }} />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-semibold text-slate-800">{inr(s.gross)}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">{s.invoices} bill{s.invoices === 1 ? "" : "s"}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentTile({ icon: Icon, label, value, accent, isCount, testid }) {
  const accents = {
    indigo: { bg: "bg-indigo-100", text: "text-indigo-600" },
    fuchsia: { bg: "bg-fuchsia-100", text: "text-fuchsia-600" },
    emerald: { bg: "bg-emerald-100", text: "text-emerald-600" },
    rose: { bg: "bg-rose-100", text: "text-rose-600" },
  };
  const a = accents[accent] || accents.indigo;
  return (
    <div className="bg-white/70 backdrop-blur-sm border border-white/80 rounded-xl p-3 flex items-center gap-3" data-testid={testid}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${a.bg}`}>
        <Icon className={`w-4 h-4 ${a.text}`} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
        <div className="text-lg font-semibold text-slate-800 truncate">
          {isCount ? (Number(value) || 0) : inr(value)}
        </div>
      </div>
    </div>
  );
}
