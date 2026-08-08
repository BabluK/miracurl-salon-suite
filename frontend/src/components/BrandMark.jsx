import { Sparkles } from "lucide-react";

/**
 * Miracurl brand mark — rose-gold AI curl badge + two-tone wordmark.
 * @prop {"light"|"dark"} variant — light = MIRA in slate-900 (white surfaces / login).
 * @prop {"xs"|"sm"|"md"|"lg"} size — sm for sidebar, lg for login.
 */
export default function BrandMark({ variant = "dark", size = "md" }) {
  const sizes = {
    xs: { pill: "w-12 h-12", word: "text-lg", sub: "text-[8px]", gap: "gap-2", spark: "w-2 h-2" },
    sm: { pill: "w-14 h-14", word: "text-xl", sub: "text-[8px]", gap: "gap-3", spark: "w-2 h-2" },
    md: { pill: "w-16 h-16", word: "text-2xl", sub: "text-[9px]", gap: "gap-3", spark: "w-2.5 h-2.5" },
    lg: { pill: "w-20 h-20", word: "text-3xl", sub: "text-[10px]", gap: "gap-3", spark: "w-3 h-3" },
  }[size];

  const miraColor = variant === "light" ? "text-slate-900" : "text-white";
  const subColor = variant === "light" ? "text-slate-400" : "text-slate-400";

  return (
    <div className={`inline-flex items-center ${sizes.gap} select-none brand-mark`} data-testid="brand-mark">
      <div className={`brand-orb ${sizes.pill} relative flex items-center justify-center`}>
        <img
          src="/assets/brand/ms-ring.png"
          alt="Miracurl"
          className="w-full h-full object-contain drop-shadow-[0_4px_14px_rgba(212,150,120,0.45)]"
          draggable="false"
        />
        <Sparkles className={`brand-orb-spark absolute -top-1 -right-1 ${sizes.spark} text-amber-400`} />
      </div>
      <div className="leading-none">
        <div className={`font-playfair ${sizes.word} tracking-[0.04em] font-semibold gold-shine-text whitespace-nowrap`}>
          MIRACURL <span className="tracking-[0.12em]">SUITE</span>
        </div>
        <div className={`tracking-[0.28em] uppercase ${subColor} mt-1 ${sizes.sub}`}>
          Smart Salon Management Software
        </div>
      </div>
    </div>
  );
}
