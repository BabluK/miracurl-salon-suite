export function RangeChips({ ranges, value, onChange, testPrefix, tone = "rose" }) {
  const on = tone === "amber"
    ? "bg-gradient-to-r from-[#c47a12] to-[#e0961f] text-white border-transparent shadow-[0_8px_20px_-10px_rgba(196,122,18,.8)]"
    : "bg-gradient-to-r from-[#7f2d3f] to-[#a83d54] text-white border-transparent shadow-[0_8px_20px_-10px_rgba(155,58,78,.8)]";
  return (
    <div className="flex gap-2 flex-wrap">
      {ranges.map(r => (
        <button key={r.k} onClick={() => onChange(r.k)} data-testid={`${testPrefix}-${r.k}`}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${value === r.k ? on : "bg-white text-slate-700 border-slate-200 hover:border-[#9b3a4e]/40"}`}>
          {r.label}
        </button>
      ))}
    </div>
  );
}
