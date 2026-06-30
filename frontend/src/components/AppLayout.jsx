import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, Calendar, Users, UserCog, Scissors, Package,
  ShoppingCart, BarChart3, LogOut, Bell, ChevronDown, Star
} from "lucide-react";
import { useState } from "react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/appointments", label: "Appointments", icon: Calendar, testid: "nav-appointments" },
  { to: "/customers", label: "CRM", icon: Users, testid: "nav-customers" },
  { to: "/staff", label: "Staff", icon: UserCog, testid: "nav-staff" },
  { to: "/services", label: "Services", icon: Scissors, testid: "nav-services" },
  { to: "/inventory", label: "Inventory", icon: Package, testid: "nav-inventory" },
  { to: "/pos", label: "POS / Billing", icon: ShoppingCart, testid: "nav-pos" },
  { to: "/reviews", label: "Reviews", icon: Star, testid: "nav-reviews" },
  { to: "/reports", label: "Reports", icon: BarChart3, testid: "nav-reports" },
];

export default function AppLayout() {
  const { user, tenant, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const today = new Date().toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });

  const current = NAV.find(n => loc.pathname.startsWith(n.to));

  return (
    <div className="min-h-screen flex bg-bg-base text-ink-primary">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0A0A0A] border-r border-white/5 flex flex-col fixed h-screen">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold flex items-center justify-center shadow-gold-glow">
              <Scissors className="w-5 h-5 text-bg-base" />
            </div>
            <div>
              <div className="font-playfair text-xl leading-none">Miracurl</div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-gold mt-1">Salon Suite</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={item.testid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm transition-all border-l-2 ${
                  isActive
                    ? "bg-gradient-to-r from-gold/15 to-transparent border-gold text-gold"
                    : "text-white/60 hover:text-white hover:bg-white/5 border-transparent"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5">
          <button
            data-testid="logout-btn"
            onClick={async () => { await logout(); nav("/login"); }}
            className="flex items-center gap-2 text-sm text-white/60 hover:text-gold w-full px-2 py-2 rounded-md hover:bg-white/5 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 ml-64 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 h-16 px-8 flex items-center justify-between bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/5">
          <div className="flex items-center gap-3">
            <div>
              <div className="font-playfair text-lg leading-none">{current?.label || "Miracurl"}</div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-white/40 mt-1">
                {tenant?.name || "Miracurl Salon"}{tenant?.location ? ` • ${tenant.location}` : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-xs text-white/50 tracking-wider">{today}</div>
            <button className="relative p-2 rounded-md hover:bg-white/5 transition" data-testid="notif-btn">
              <Bell className="w-4 h-4 text-white/70" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-gold" />
            </button>
            <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-white/5 transition" data-testid="profile-menu-btn">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-blush flex items-center justify-center text-bg-base font-semibold text-sm">
                  {(user?.name || "A").charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-medium">{user?.name}</div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">{user?.role}</div>
                </div>
                <ChevronDown className="w-3 h-3 text-white/50" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-[#121212] border border-white/10 rounded-md shadow-card-luxe py-1">
                  <div className="px-4 py-2 text-xs text-white/50 border-b border-white/5">{user?.email}</div>
                  <button onClick={async () => { await logout(); nav("/login"); }} className="w-full text-left px-4 py-2 text-sm hover:bg-white/5 text-red-400">
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-8 animate-fade-up" data-testid="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
