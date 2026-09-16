import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

const TONES = {
  green: "bg-emerald-50 text-emerald-600", blue: "bg-sky-50 text-sky-600", violet: "bg-violet-50 text-violet-600",
  rose: "bg-rose-50 text-rose-500", amber: "bg-amber-50 text-amber-600",
};

export function BriefKpi({ icon: Icon, tone, label, value, sub, to, testid, extra }) {
  return (
    <Link to={to} data-testid={testid} className="group rounded-2xl bg-white/85 border border-white shadow-[0_10px_30px_-18px_rgba(120,80,20,.35)] p-4 flex items-center gap-4 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-16px_rgba(120,80,20,.4)] transition-[transform,box-shadow]">
      <span className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${TONES[tone]}`}><Icon className="w-6 h-6" strokeWidth={1.7} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-slate-500">{label}</span>
        <span className="flex items-baseline gap-2"><span className="font-playfair text-3xl text-slate-900 leading-tight">{value}</span>{extra}</span>
        <span className="block text-xs text-slate-400 truncate">{sub}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-[color,transform]" />
    </Link>
  );
}

export function BriefCard({ tone = "white", className = "", children, testid }) {
  const bg = { white: "bg-white/85 border-white", rose: "bg-rose-50/70 border-rose-100", green: "bg-emerald-50/60 border-emerald-100",
    violet: "bg-violet-50/60 border-violet-100", amber: "bg-white/80 border-amber-300", sky: "bg-sky-50/70 border-sky-100" }[tone];
  return <div className={`rounded-2xl border shadow-[0_10px_30px_-18px_rgba(120,80,20,.3)] ${bg} ${className}`} data-testid={testid}>{children}</div>;
}

const AV = ["bg-rose-100 text-rose-600", "bg-sky-100 text-sky-600", "bg-emerald-100 text-emerald-600", "bg-violet-100 text-violet-600", "bg-amber-100 text-amber-700"];
export function InitialAvatar({ name, i = 0, size = "w-11 h-11 text-sm" }) {
  const initials = (name || "?").trim().split(/\s+/).slice(0, 2).map(s => s[0]).join("").toUpperCase();
  return <span className={`${size} rounded-full inline-flex items-center justify-center font-bold ${AV[i % AV.length]}`}>{initials}</span>;
}

export function Script({ children, className = "" }) {
  return <span className={`font-playfair italic text-[#c9a24a] leading-tight select-none ${className}`}>{children}</span>;
}

export const PILL = "inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-full transition-[filter,background-color] disabled:opacity-50";
export const BTN = "inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-[filter,background-color] disabled:opacity-50";
