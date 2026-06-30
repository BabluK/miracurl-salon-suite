import { Scissors } from "lucide-react";

/**
 * Animated Miracurl brand mark.
 * - Pink-magenta gradient pill containing the scissors icon (a subtle "snip" tilt on loop)
 * - "MIRA" + "CURL" two-tone wordmark (CURL has a continuous gradient shimmer)
 * - Slow glow pulse around the pill
 *
 * Variants
 * @prop {"light"|"dark"} variant — light = MIRA in slate-900 (for white surfaces / login).
 *                                  dark = MIRA in white (for dark sidebar).
 * @prop {"sm"|"md"|"lg"} size — pill + text size; sm for sidebar, lg for login.
 */
export default function BrandMark({ variant = "dark", size = "md" }) {
  const sizes = {
    sm: { pill: "w-10 h-10", icon: "w-5 h-5", word: "text-xl", sub: "text-[9px]" },
    md: { pill: "w-12 h-12", icon: "w-6 h-6", word: "text-3xl", sub: "text-[10px]" },
    lg: { pill: "w-12 h-12", icon: "w-6 h-6", word: "text-4xl", sub: "text-[10px]" },
  }[size];

  const miraColor = variant === "light" ? "text-slate-900" : "text-white";
  const subColor = variant === "light" ? "text-slate-400" : "text-slate-400";

  return (
    <div className="inline-flex items-center gap-3 select-none brand-mark" data-testid="brand-mark">
      <div className={`brand-pill ${sizes.pill} rounded-xl flex items-center justify-center shadow-lg relative overflow-hidden`}>
        <Scissors className={`${sizes.icon} text-white brand-scissors relative z-10`} />
      </div>
      <div className="leading-none">
        <div className={`font-playfair ${sizes.word} tracking-tight ${miraColor}`}>
          MIRA<span className="brand-curl">CURL</span>
        </div>
        <div className={`tracking-[0.3em] uppercase ${subColor} mt-1 ${sizes.sub}`}>Salon Suite</div>
      </div>
    </div>
  );
}
