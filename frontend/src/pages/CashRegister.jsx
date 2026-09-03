import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Wallet, Plus, Trash2, Receipt, Send, ChevronLeft, ChevronRight, Banknote, AlertTriangle, Coffee } from "lucide-react";

const inr = (v) => `₹${Math.round(Number(v) || 0).toLocaleString("en-IN")}`;
const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const shift = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const CAT_LABEL = { tea: "☕ Tea / snacks", salon: "✂️ Salon supplies", cleaning: "🧹 Cleaning", travel: "🛵 Travel", repair: "🔧 Repair", other: "📦 Other" };

function Stat({ label, value, tone, sub, testid }) {
  const tones = { slate: "bg-white border-slate-200 text-slate-800", green: "bg-emerald-50 border-emerald-200 text-emerald-800", red: "bg-rose-50 border-rose-200 text-rose-800", dark: "bg-slate-900 border-slate-900 text-white" };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`} data-testid={testid}>
      <div className="text-[11px] uppercase tracking-[0.14em] opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-1 font-playfair">{value}</div>
      {sub && <div className="text-[11px] opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function CashRegister() {
  const { user } = useAuth();
  const isMgr = ["admin", "manager"].includes(user?.role);
  const [date, setDate] = useState(todayIST());
  const [day, setDay] = useState(null);
  const [form, setForm] = useState({ amount: "", purpose: "", category: "tea", has_bill: false, kind: "expense" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (d = date) => {
    try { const { data } = await api.get(`/cash/day?date=${d}`); setDay(data); }
    catch { toast.error("Couldn't load the cash register"); }
  }, [date]);
  useEffect(() => { load(date); }, [date, load]);

  const isToday = date === todayIST();
  const canLog = isToday || isMgr;

  async function add(e) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return toast.error("Enter the amount");
    if (form.purpose.trim().length < 2) return toast.error("What was it for?");
    setBusy(true);
    try {
      await api.post("/cash/expenses", { ...form, amount: Number(form.amount), date });
      toast.success(form.kind === "handover" ? `${inr(form.amount)} handed over recorded` : `Expense ${inr(form.amount)} logged`);
      setForm({ amount: "", purpose: "", category: form.category, has_bill: false, kind: "expense" });
      load(date);
    } catch (err) { toast.error(err.response?.data?.detail || "Couldn't save"); }
    finally { setBusy(false); }
  }
  async function remove(id) {
    if (!window.confirm("Remove this entry?")) return;
    try { await api.delete(`/cash/expenses/${id}`); load(date); } catch (err) { toast.error(err.response?.data?.detail || "Couldn't remove"); }
  }
  async function sendReport() {
    setBusy(true);
    try { const { data } = await api.post(`/cash/send-report?date=${date}`); toast.success(data.sent ? "Cash report emailed to the owner ✓" : "Report not sent — check owner email"); }
    catch (err) { toast.error(err.response?.data?.detail || "Couldn't send"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6" data-testid="cash-register-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="font-playfair text-3xl flex items-center gap-2"><Wallet className="w-7 h-7 text-emerald-600" /> Cash Register</h1>
          <p className="text-slate-500 text-sm mt-1">Today's cash − expenses = cash in hand. Yesterday's closing carries forward automatically. Owner gets this by email every evening.</p>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid="cash-prev-day" onClick={() => setDate(shift(date, -1))} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
          <input data-testid="cash-date" type="date" value={date} max={todayIST()} onChange={e => setDate(e.target.value)} className="input-light !w-auto" />
          <button data-testid="cash-next-day" onClick={() => setDate(shift(date, 1))} disabled={isToday} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          {isMgr && (
            <button data-testid="cash-send-report" onClick={sendReport} disabled={busy} className="btn-slate flex items-center gap-2 disabled:opacity-50"><Send className="w-4 h-4" /> Email owner now</button>
          )}
        </div>
      </div>

      {day && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat testid="cash-opening" label="Opening cash" value={inr(day.opening)} tone="slate" sub={day.opening_from ? `carried from ${day.opening_from}` : "no earlier balance"} />
            <Stat testid="cash-in" label="Cash collected" value={`+${inr(day.cash_in)}`} tone="green" sub={`${day.cash_bills} cash bill${day.cash_bills === 1 ? "" : "s"} (POS)`} />
            <Stat testid="cash-expenses" label={day.handover ? "Expenses + handed over" : "Expenses"} value={`−${inr(day.expenses + day.handover)}`} tone="red" sub={`${day.bills_kept} bill${day.bills_kept === 1 ? "" : "s"} kept at counter`} />
            <Stat testid="cash-closing" label="Cash in hand" value={inr(day.closing)} tone="dark" sub={day.short ? "⚠️ short — expenses exceed cash" : "closing balance"} />
          </div>
          {day.short && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700" data-testid="cash-short-alert">
              <AlertTriangle className="w-4 h-4 shrink-0" /> Expenses are more than the cash available (today + carried forward). Check the counter before closing.
            </div>
          )}

          <div className="grid lg:grid-cols-5 gap-6">
            <form onSubmit={add} className="lg:col-span-2 card-light space-y-3" data-testid="cash-expense-form">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Plus className="w-4 h-4 text-emerald-600" /> Log {form.kind === "handover" ? "cash handed over" : "an expense"}</h3>
                <div className="flex rounded-full border border-slate-200 overflow-hidden text-xs">
                  <button type="button" data-testid="cash-kind-expense" onClick={() => setForm({ ...form, kind: "expense" })} className={`px-3 py-1 ${form.kind === "expense" ? "bg-slate-900 text-white" : "text-slate-500"}`}>Expense</button>
                  <button type="button" data-testid="cash-kind-handover" onClick={() => setForm({ ...form, kind: "handover", has_bill: false })} className={`px-3 py-1 ${form.kind === "handover" ? "bg-slate-900 text-white" : "text-slate-500"}`}>To owner / bank</button>
                </div>
              </div>
              {!canLog && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Staff can log only today's entries — switch to today.</p>}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">Amount (₹)</label><input data-testid="cash-amount" type="number" min="1" step="1" className="input-light" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} disabled={!canLog} /></div>
                <div><label className="label-light block mb-1">Logged by</label><input className="input-light bg-slate-50" value={user?.name || user?.email || ""} readOnly /></div>
              </div>
              <div><label className="label-light block mb-1">{form.kind === "handover" ? "Given to" : "For what"}</label>
                <input data-testid="cash-purpose" className="input-light" placeholder={form.kind === "handover" ? "e.g. Handed to owner / bank deposit" : "e.g. Tea for staff, hair spa cream, plumber"} value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} disabled={!canLog} /></div>
              {form.kind === "expense" && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {(day.categories || []).map(c => (
                      <button type="button" key={c} data-testid={`cash-cat-${c}`} onClick={() => setForm({ ...form, category: c })}
                        className={`text-xs px-3 py-1 rounded-full border ${form.category === c ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-400"}`}>{CAT_LABEL[c] || c}</button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input data-testid="cash-has-bill" type="checkbox" checked={form.has_bill} onChange={e => setForm({ ...form, has_bill: e.target.checked })} className="accent-emerald-600" />
                    <Receipt className="w-4 h-4 text-slate-400" /> Bill available — kept at the counter for the owner
                  </label>
                </>
              )}
              <button data-testid="cash-add-btn" disabled={busy || !canLog} className="btn-blue w-full disabled:opacity-50">{form.kind === "handover" ? "Record handover" : "Add expense"}</button>
            </form>

            <div className="lg:col-span-3 card-light" data-testid="cash-entries">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3"><Banknote className="w-4 h-4 text-slate-500" /> Entries · {date} <span className="text-xs text-slate-400 font-normal">({day.entries.length})</span></h3>
              {day.entries.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No expenses logged for this day.</p>}
              <div className="divide-y divide-slate-100">
                {day.entries.map(e => (
                  <div key={e.id} className="flex items-center gap-3 py-2.5" data-testid={`cash-entry-${e.id}`}>
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${e.kind === "handover" ? "bg-sky-50 text-sky-600" : "bg-rose-50 text-rose-500"}`}>
                      {e.kind === "handover" ? <Banknote className="w-4 h-4" /> : e.category === "tea" ? <Coffee className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 truncate">{e.purpose}</p>
                      <p className="text-[11px] text-slate-400">{e.kind === "handover" ? "Handed over" : (CAT_LABEL[e.category] || e.category)} · by <span className="font-medium text-slate-600">{e.added_by}</span> · {new Date(e.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    {e.has_bill && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">Bill ✓</span>}
                    <span className={`text-sm font-semibold shrink-0 ${e.kind === "handover" ? "text-sky-700" : "text-rose-600"}`}>−{inr(e.amount)}</span>
                    {(day.can_delete || e.added_by_id === user?.id) && (
                      <button data-testid={`cash-entry-delete-${e.id}`} onClick={() => remove(e.id)} className="p-1.5 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
