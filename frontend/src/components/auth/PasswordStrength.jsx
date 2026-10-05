import { useMemo } from "react";
import { Check, X } from "lucide-react";

export const PASSWORD_RULES = [
  ["len", "At least 8 characters", (p) => p.length >= 8],
  ["upper", "An uppercase letter (A–Z)", (p) => /[A-Z]/.test(p)],
  ["lower", "A lowercase letter (a–z)", (p) => /[a-z]/.test(p)],
  ["digit", "A number (0–9)", (p) => /\d/.test(p)],
  ["symbol", "A symbol (!@#$…)", (p) => /[^A-Za-z0-9]/.test(p)],
];
const STRENGTH = ["", "Weak", "Weak", "Fair", "Good", "Strong"];
const BARS = ["bg-slate-200", "bg-rose-500", "bg-rose-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"];

export const isStrongPassword = (p) => PASSWORD_RULES.every(([, , ok]) => ok(p));

// Live strength meter + requirement checklist. Used on signup and password reset.
export function PasswordStrength({ password, compact = false }) {
  const passed = useMemo(() => PASSWORD_RULES.filter(([, , ok]) => ok(password)).length, [password]);
  const strong = passed === PASSWORD_RULES.length;
  return (
    <div data-testid="password-strength" className="space-y-2">
      <div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(i => <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${password && i <= passed ? BARS[passed] : "bg-slate-200"}`} />)}
        </div>
        <div className="flex items-center justify-between mt-1 text-[11px]">
          <span className="text-slate-400">Password strength</span>
          <span className={`font-semibold ${strong ? "text-emerald-600" : passed >= 3 ? "text-amber-600" : "text-rose-500"}`} data-testid="password-strength-label">{password ? STRENGTH[passed] : "—"}</span>
        </div>
      </div>
      <ul className={`grid gap-x-3 gap-y-1 rounded-xl bg-[#fdf9f4] border border-[#efe3c4] p-2.5 ${compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`} data-testid="password-rules">
        {PASSWORD_RULES.map(([k, text, ok]) => {
          const hit = ok(password);
          return (
            <li key={k} data-testid={`rule-${k}`} data-ok={hit} className={`flex items-center gap-1.5 text-[11px] ${hit ? "text-emerald-700" : "text-slate-500"}`}>
              {hit ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5 text-slate-300" />} {text}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
