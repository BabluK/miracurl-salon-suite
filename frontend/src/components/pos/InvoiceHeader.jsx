import { Search, X, UserPlus, Calendar, MapPin } from "lucide-react";

export function InvoiceHeader({
  tenant, branchId, onBranchChange, branchLocked = false,
  guestBoxRef, guestQuery, setGuestQuery, customerId, setCustomerId,
  guestOpen, setGuestOpen, guestMatches, selectGuest, clearGuest, onAddGuest,
  staff, staffId, setStaffId, customer, cartHasItems,
  benefits, canRedeem, redeemCap, redeemPoints, setRedeemPoints, loyaltyRules, onRedeemPackage,
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-700">Invoice</h3>
        <div className="flex items-center gap-3">
          {(tenant?.branches || []).length > 0 && (
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-sky-500" />
              <select
                data-testid="pos-branch-select"
                value={branchId}
                onChange={e => onBranchChange(e.target.value)}
                disabled={branchLocked}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200 max-w-[220px] disabled:opacity-80 disabled:cursor-not-allowed"
                title={branchLocked ? "Your login is locked to this branch — every bill is tagged to it" : "Bills are tagged to this branch for per-branch collection reports"}
              >
                <option value="">Main — {tenant?.location || "primary location"}</option>
                {tenant.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-1 text-sm text-slate-500">
            <Calendar className="w-4 h-4" />
            {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600 font-medium">Guest :</label>
        <div className="relative flex-1 max-w-md" ref={guestBoxRef}>
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            data-testid="pos-guest-search"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search by name, phone or Member ID (MC-…)"
            value={guestQuery}
            onChange={e => {
              setGuestQuery(e.target.value);
              if (customerId) setCustomerId("");
              setGuestOpen(e.target.value.trim().length > 0);
            }}
            onFocus={() => { if (guestQuery.trim()) setGuestOpen(true); }}
            className="text-slate-800 w-full pl-10 pr-9 py-2 rounded-lg bg-white border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
          {(guestQuery || customerId) && (
            <button
              type="button"
              data-testid="pos-guest-clear"
              onClick={clearGuest}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              aria-label="Clear guest"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {guestOpen && guestQuery.trim() && (
            <div
              data-testid="pos-guest-dropdown"
              className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto"
            >
              {guestMatches.length === 0 ? (
                <div className="px-3 py-3 text-sm text-slate-500">
                  No guests match &quot;{guestQuery}&quot;. <button onClick={() => { setGuestOpen(false); onAddGuest(); }} className="text-sky-600 font-medium hover:underline" data-testid="pos-guest-add-from-search">Add new guest</button>
                </div>
              ) : (
                guestMatches.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    data-testid={`pos-guest-option-${c.id}`}
                    onClick={() => selectGuest(c)}
                    className="w-full text-left px-3 py-2 hover:bg-sky-50 border-b last:border-b-0 border-slate-100"
                  >
                    <div className="text-sm text-slate-800">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.phone}{c.email ? ` · ${c.email}` : ""}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <button
          data-testid="pos-add-guest-btn"
          onClick={onAddGuest}
          className="flex items-center gap-1.5 text-sky-600 hover:text-sky-700 font-medium text-sm"
        >
          <UserPlus className="w-4 h-4" /> Add Guest
        </button>
        <select
          data-testid="pos-staff-select"
          value={staffId}
          onChange={e => setStaffId(e.target.value)}
          className="ml-auto py-2 px-3 rounded-lg bg-white border border-slate-200 text-sm"
        >
          <option value="">— Default Stylist —</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {customerId && customer && (
        <div className="mt-2 inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700" data-testid="pos-guest-chip">
          <UserPlus className="w-3 h-3" /> {customer.name} · {customer.phone}
        </div>
      )}

      {customerId && benefits && (
        <BenefitsPanel
          benefits={benefits}
          canRedeem={canRedeem}
          redeemCap={redeemCap}
          redeemPoints={redeemPoints}
          setRedeemPoints={setRedeemPoints}
          loyaltyRules={loyaltyRules}
          onRedeemPackage={onRedeemPackage}
        />
      )}

      {!customerId && cartHasItems && (
        <p className="text-red-500 text-xs mt-2" data-testid="pos-guest-warning">Please select guest</p>
      )}
    </div>
  );
}

function BenefitsPanel({ benefits, canRedeem, redeemCap, redeemPoints, setRedeemPoints, loyaltyRules, onRedeemPackage }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="pos-benefits-panel">
      <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium" data-testid="pos-loyalty-chip">
        🪙 {benefits.loyalty_points} pts (₹{benefits.loyalty_points})
      </span>
      {benefits.loyalty_points > 0 && (
        canRedeem ? (
          redeemPoints > 0 ? (
            <button type="button" data-testid="pos-redeem-applied-btn"
              onClick={() => setRedeemPoints(0)}
              title="Tap to remove the redeemed points"
              className="text-xs px-2.5 py-1 rounded-full bg-emerald-500 text-white font-semibold hover:bg-emerald-600">
              ✓ {redeemPoints} pts redeemed (−₹{redeemPoints}) · ✕
            </button>
          ) : (
            <button type="button" data-testid="pos-redeem-btn"
              onClick={() => setRedeemPoints(Math.min(benefits.loyalty_points, redeemCap))}
              className="text-xs px-2.5 py-1 rounded-full bg-amber-500 text-white font-semibold hover:bg-amber-600 shadow-sm">
              Redeem {Math.min(benefits.loyalty_points, redeemCap)} pts (−₹{Math.min(benefits.loyalty_points, redeemCap)})
            </button>
          )
        ) : (
          <span className="text-[10px] text-slate-400" data-testid="pos-redeem-locked">
            🔒 Points redeemable on bills of ₹{Number(loyaltyRules.min_bill_to_redeem || 0).toLocaleString("en-IN")}+
          </span>
        )
      )}
      {benefits.birthday_week && (
        <span className="text-xs px-2.5 py-1 rounded-full bg-pink-50 border border-pink-200 text-pink-700 font-medium" data-testid="pos-birthday-chip">
          🎂 Birthday week — treat them with a special discount!
        </span>
      )}
      {benefits.anniversary_week && (
        <span className="text-xs px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-medium" data-testid="pos-anniversary-chip">
          💞 Anniversary week — a little extra off goes a long way!
        </span>
      )}
      {benefits.membership && (
        <span className="text-xs px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-700 font-medium" data-testid="pos-membership-chip">
          👑 {benefits.membership.name} · {benefits.membership.discount_pct}% off services
        </span>
      )}
      {benefits.packages.map(p => (
        <button key={p.id} type="button" data-testid={`pos-package-redeem-${p.id}`}
          onClick={() => onRedeemPackage(p)}
          className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium hover:bg-emerald-100">
          📦 {p.package_name}: {p.sessions_left} left — Use session
        </button>
      ))}
    </div>
  );
}
