import confetti from "canvas-confetti";
import { toast } from "sonner";

const GOLD = ["#e8c37f", "#f3dfae", "#b8932e", "#fff7e0", "#22c55e"];

export function celebrateUpgrade(c) {
  if (!c) return;
  const sym = c.currency === "USD" ? "$" : "₹";
  const fire = (x, angle) => confetti({ particleCount: 90, spread: 70, startVelocity: 45, origin: { x, y: 0.7 }, angle, colors: GOLD, scalar: 1.1, zIndex: 100000 });
  fire(0.15, 60); fire(0.85, 120);
  setTimeout(() => confetti({ particleCount: 140, spread: 110, origin: { y: 0.55 }, colors: GOLD, zIndex: 100000 }), 350);
  const headline = c.saved > 0
    ? `You saved ${sym}${Number(c.saved).toLocaleString("en-IN")} 🎉`
    : `Welcome to ${c.to_label} 🎉`;
  const sub = c.saved > 0
    ? `${c.to_label} is yours — ${sym}${Number(c.credit).toLocaleString("en-IN")} of unused days were credited and you paid only the difference.`
    : `${sym}${Number(c.credit).toLocaleString("en-IN")} of unused days were credited — you paid only the difference.`;
  toast.success(headline, { description: sub, duration: 9000, id: "upgrade-celebration",
    className: "!bg-[#1c1c22] !text-[#f3dfae] !border-[#e8c37f]/50", descriptionClassName: "!text-white/70" });
}
