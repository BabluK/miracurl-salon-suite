import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Activity, Database, Ticket, Send, Bot, Trash2, Plus, CircleCheck, Wrench,
} from "lucide-react";

const TICKET_STATUSES = ["open", "in_progress", "done", "wont_fix"];
const PRIORITY_CLS = {
  low: "bg-slate-100 text-slate-600", medium: "bg-sky-100 text-sky-700",
  high: "bg-amber-100 text-amber-700", critical: "bg-red-100 text-red-700",
};
const STATUS_CLS = {
  open: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-sky-50 text-sky-700 border-sky-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  wont_fix: "bg-slate-50 text-slate-400 border-slate-200",
};

function fmtUptime(s) {
  if (!s && s !== 0) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export const EngineerPanel = () => {
  const [health, setHealth] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try {
      const [h, t] = await Promise.all([
        api.get("/super-admin/system/health"),
        api.get("/super-admin/dev-tickets"),
      ]);
      setHealth(h.data); setTickets(t.data);
    } catch { toast.error("Couldn't load engineer panel"); }
  }, []);
  useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv); }, [load]);

  async function setStatus(t, status) {
    try { await api.put(`/super-admin/dev-tickets/${t.id}`, { status }); load(); }
    catch { toast.error("Update failed"); }
  }
  async function remove(t) {
    if (!window.confirm(`Delete ticket "${t.title}"?`)) return;
    try { await api.delete(`/super-admin/dev-tickets/${t.id}`); load(); } catch { toast.error("Delete failed"); }
  }

  return (
    <div className="space-y-6" data-testid="engineer-panel">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-playfair text-2xl flex items-center gap-2"><Wrench className="w-5 h-5 text-sky-600" /> Hub Engineer — 24/7 system care</h2>
          <p className="text-slate-500 text-sm mt-1">
            Your AI engineer watches system health, triages bugs & enhancement requests, and prepares fixes.
            Code changes are applied in the Emergent workspace — hit <b>Redeploy</b> to push them live.
          </p>
        </div>
        <button data-testid="new-ticket-btn" onClick={() => setShowNew(true)} className="btn-blue flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> New ticket
        </button>
      </div>

      {/* Health */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="health-cards">
        <HealthCard icon={Activity} label="API" value={health ? (health.api_ok ? "Healthy" : "Down") : "…"} ok={health?.api_ok} />
        <HealthCard icon={Database} label="Database" value={health ? (health.db_ok ? `${health.db_latency_ms}ms` : "Down") : "…"} ok={health?.db_ok} />
        <HealthCard icon={CircleCheck} label="Uptime" value={fmtUptime(health?.uptime_seconds)} ok />
        <HealthCard icon={Ticket} label="Open tickets" value={health?.open_tickets ?? "…"} ok={(health?.open_tickets ?? 0) === 0} />
        <HealthCard icon={Activity} label="Salons" value={health?.tenants ?? "…"} ok />
        <HealthCard icon={Activity} label="Invoices" value={health?.invoices?.toLocaleString?.("en-IN") ?? "…"} ok />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tickets */}
        <div className="card-light" data-testid="tickets-card">
          <div className="font-medium mb-3 flex items-center gap-2"><Ticket className="w-4 h-4 text-sky-600" /> Dev ticket queue</div>
          {tickets.length === 0 ? (
            <div className="text-slate-400 text-sm py-8 text-center">No tickets — all clear ✦</div>
          ) : (
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {tickets.map(t => (
                <div key={t.id} className="border border-slate-200 rounded-xl p-3" data-testid={`ticket-${t.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{t.title}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase ${PRIORITY_CLS[t.priority] || ""}`}>{t.priority}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase">{t.kind}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase ${STATUS_CLS[t.status] || ""}`}>{t.status.replace("_", " ")}</span>
                        <span className="text-[10px] text-slate-400">{t.created_at?.slice(0, 10)}</span>
                      </div>
                    </div>
                    <button onClick={() => remove(t)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  {t.description && <div className="text-xs text-slate-500 mt-2">{t.description}</div>}
                  {t.ai_triage && (
                    <div className="mt-2 rounded-lg bg-sky-50 border border-sky-100 p-2 text-xs text-slate-600 whitespace-pre-wrap">
                      <span className="font-semibold text-sky-700">🛠 Engineer triage:</span> {t.ai_triage}
                    </div>
                  )}
                  <div className="flex gap-1.5 mt-2">
                    {TICKET_STATUSES.filter(s => s !== t.status).map(s => (
                      <button key={s} onClick={() => setStatus(t, s)}
                        className="text-[10px] px-2 py-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">
                        {s.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat */}
        <EngineerChat />
      </div>

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} onDone={load} />}
    </div>
  );
};

function HealthCard({ icon: Icon, label, value, ok }) {
  return (
    <div className="card-light py-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
        <Icon className={`w-3.5 h-3.5 ${ok ? "text-emerald-500" : "text-red-500"}`} /> {label}
      </div>
      <div className="font-playfair text-xl mt-1">{value}</div>
    </div>
  );
}

function NewTicketModal({ onClose, onDone }) {
  const [f, setF] = useState({ title: "", description: "", kind: "bug", priority: "medium" });
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/super-admin/dev-tickets", f);
      toast.success("Ticket logged — engineer triage attached");
      onDone(); onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't create ticket");
    } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="card-light w-full max-w-md" onClick={e => e.stopPropagation()} data-testid="new-ticket-modal">
        <h3 className="font-playfair text-xl mb-4">Log a bug / enhancement</h3>
        <form onSubmit={submit} className="space-y-3">
          <input data-testid="ticket-title-input" required minLength={3} className="input-light w-full" placeholder="Short title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
          <textarea data-testid="ticket-desc-input" rows={4} className="input-light w-full" placeholder="What happened / what do you want built?" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <select className="input-light" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
              <option value="bug">Bug</option><option value="enhancement">Enhancement</option><option value="question">Question</option>
            </select>
            <select className="input-light" value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </select>
          </div>
          <button data-testid="ticket-submit-btn" disabled={busy} className="btn-blue w-full">{busy ? "Logging + triaging…" : "Create ticket"}</button>
        </form>
      </div>
    </div>
  );
}

function EngineerChat() {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId] = useState(() => `s${Date.now()}`);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setMsgs(m => [...m, { id: `u${Date.now()}`, role: "user", content: text }]);
    setInput(""); setBusy(true);
    try {
      const { data } = await api.post("/super-admin/engineer-chat", { message: text, session_id: sessionId });
      setMsgs(m => [...m, { id: `a${Date.now()}`, role: "assistant", content: data.reply }]);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Engineer AI unavailable");
    } finally { setBusy(false); }
  }

  return (
    <div className="card-light flex flex-col" data-testid="engineer-chat">
      <div className="font-medium mb-3 flex items-center gap-2"><Bot className="w-4 h-4 text-violet-600" /> Ask the engineer</div>
      <div className="flex-1 min-h-[280px] max-h-[400px] overflow-y-auto space-y-3 pr-1">
        {msgs.length === 0 && (
          <div className="text-slate-400 text-sm py-8 text-center">
            &ldquo;Why is the dashboard slow?&rdquo; · &ldquo;Plan a loyalty-points feature&rdquo; · &ldquo;Any risky open tickets?&rdquo;
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`text-sm rounded-xl px-3 py-2 whitespace-pre-wrap ${m.role === "user" ? "bg-sky-50 border border-sky-100 ml-8" : "bg-slate-50 border border-slate-200 mr-8"}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="text-slate-400 text-xs animate-pulse">Engineer is thinking…</div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 mt-3">
        <input data-testid="engineer-chat-input" className="input-light flex-1" placeholder="Describe an issue or ask anything technical…" value={input} onChange={e => setInput(e.target.value)} />
        <button data-testid="engineer-chat-send" disabled={busy} className="btn-blue px-3"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
}

export default EngineerPanel;
