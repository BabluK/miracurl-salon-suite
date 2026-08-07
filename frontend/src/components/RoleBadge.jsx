import { Crown, ShieldCheck, KeyRound, User } from "lucide-react";

const STYLES = {
  super_admin: { label: "SUPER ADMIN", cls: "from-violet-500 to-fuchsia-600 text-white shadow-fuchsia-500/30", Icon: Crown },
  admin:       { label: "ADMIN",       cls: "from-amber-300 to-yellow-600 text-black shadow-amber-500/30",    Icon: ShieldCheck },
  manager:     { label: "MANAGER",     cls: "from-sky-400 to-blue-600 text-white shadow-sky-500/30",          Icon: KeyRound },
  staff:       { label: "STAFF",       cls: "from-emerald-400 to-teal-600 text-white shadow-emerald-500/30",  Icon: User },
};

export function RoleBadge({ role, size = "sm" }) {
  const key = (role || "staff").toLowerCase();
  const s = STYLES[key] || STYLES.staff;
  const Icon = s.Icon;
  return (
    <span data-testid={`role-badge-${key}`}
      className={`inline-flex items-center gap-1 bg-gradient-to-r ${s.cls} font-extrabold rounded-full shadow-lg tracking-[0.12em] ${
        size === "xs" ? "text-[8px] px-1.5 py-[2px]" : "text-[9px] px-2.5 py-1"}`}>
      <Icon className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} strokeWidth={2.6} />
      {s.label}
    </span>
  );
}
