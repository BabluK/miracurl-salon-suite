const TONES = {
  rose: "bg-rose-50 text-[#9b3a4e]", amber: "bg-amber-50 text-amber-600", sky: "bg-sky-50 text-sky-600",
  emerald: "bg-emerald-50 text-emerald-600", violet: "bg-violet-50 text-violet-600",
};

export function SectionCard({ icon: Icon, tone = "rose", title, subtitle, right, children, testid, flush = false, className = "" }) {
  return (
    <div className={`rounded-2xl bg-white border border-slate-200 shadow-sm ${flush ? "overflow-hidden" : "p-5"} ${className}`} data-testid={testid}>
      <div className={`flex items-start justify-between gap-4 flex-wrap ${flush ? "p-5" : ""}`}>
        <div className="flex items-start gap-4">
          {Icon && <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${TONES[tone]}`}><Icon className="w-5 h-5" /></div>}
          <div>
            <h3 className="font-playfair text-2xl text-slate-900 leading-tight">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export const TH = "text-left text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold px-4 py-3.5 whitespace-nowrap";
export const THEAD = "bg-slate-50/70 border-y border-slate-100";
export const TR = "border-b border-slate-50 hover:bg-[#fdf6f7] transition-colors";
export const TD = "px-4 py-3";

export function StatusPill({ tone = "emerald", children, testid }) {
  const c = { emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", rose: "bg-rose-50 text-rose-600", slate: "bg-slate-100 text-slate-600" }[tone];
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${c}`} data-testid={testid}><span className="w-1.5 h-1.5 rounded-full bg-current" />{children}</span>;
}
