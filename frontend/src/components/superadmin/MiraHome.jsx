import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Flame, CalendarClock, Target, Megaphone, Lightbulb, Send, Brain, Clock, Loader2, X, Plus, Trash2, Pencil, ScanFace } from "lucide-react";

const KIND_ICON = { search: "🔍", result: "🎯", ask: "💬", call: "📞", email: "✉️", memory: "🧠" };

function speak(text) {
  try {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-IN";
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
  } catch { /* unsupported */ }
}

function MemoryVault({ onClose }) {
  const [items, setItems] = useState([]);
  const [cat, setCat] = useState("general");
  const [text, setText] = useState("");
  const [editId, setEditId] = useState("");
  const [editText, setEditText] = useState("");

  const load = useCallback(() => {
    api.get("/super-admin/mira/memory").then(r => setItems(r.data.items || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (text.trim().length < 2) return;
    try {
      await api.post("/super-admin/mira/memory", { category: cat, text: text.trim() });
      setText("");
      toast.success("Saved to Mira's memory 🧠");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
  }
  async function saveEdit(m) {
    try {
      await api.put(`/super-admin/mira/memory/${m.id}`, { category: m.category, text: editText.trim() });
      setEditId("");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't update"); }
  }
  async function del(m) {
    try { await api.delete(`/super-admin/mira/memory/${m.id}`); load(); } catch { toast.error("Couldn't delete"); }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} data-testid="memory-vault-modal">
      <div className="bg-[#101a35] border border-white/15 rounded-2xl w-full max-w-lg text-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2 font-semibold text-sm"><Brain className="w-4 h-4 text-fuchsia-400" /> Mira Memory Vault</div>
          <button onClick={onClose} className="text-white/50 hover:text-white" data-testid="memory-vault-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <select value={cat} onChange={e => setCat(e.target.value)} data-testid="memory-cat-select"
              className="bg-white/5 border border-white/15 rounded-xl text-xs px-2 py-2.5 focus:outline-none">
              {["general", "goals", "pricing", "targets", "strategy", "preferences", "competitors"].map(c => <option key={c} value={c} className="bg-[#101a35]">{c}</option>)}
            </select>
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
              placeholder="e.g. Focus on 3+ branch salons in South Bangalore" data-testid="memory-add-input"
              className="flex-1 bg-white/5 border border-white/15 rounded-xl text-xs px-3 py-2.5 focus:outline-none focus:border-fuchsia-400/50 placeholder:text-white/25" />
            <button onClick={add} data-testid="memory-add-btn"
              className="px-3 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 flex items-center"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {items.length === 0 && <p className="text-[11px] text-white/35 text-center py-6">Nothing saved yet — teach Mira about your business above.</p>}
            {items.map(m => (
              <div key={m.id} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5" data-testid={`memory-item-${m.id}`}>
                {editId === m.id ? (
                  <div className="flex gap-2">
                    <input value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit(m)}
                      className="flex-1 bg-white/10 rounded-lg text-xs px-2 py-1.5 focus:outline-none" autoFocus />
                    <button onClick={() => saveEdit(m)} className="text-[10px] text-emerald-300 font-bold">Save</button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[9px] uppercase tracking-wider text-fuchsia-300/80">{m.category}</span>
                      <p className="text-xs text-white/80 leading-snug">{m.text}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => { setEditId(m.id); setEditText(m.text); }} className="text-white/40 hover:text-white" data-testid={`memory-edit-${m.id}`}><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => del(m)} className="text-white/40 hover:text-rose-400" data-testid={`memory-del-${m.id}`}><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/30">Mira uses these approved facts when answering you and planning outreach.</p>
        </div>
      </div>
    </div>
  );
}

function timeLabel(iso) {
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export function MiraHome({ onGoTab, user }) {
  const [home, setHome] = useState(null);
  const [greeting, setGreeting] = useState("");
  const [q, setQ] = useState("");
  const [chat, setChat] = useState([]); // {role, text}
  const [thinking, setThinking] = useState(false);
  const [vault, setVault] = useState(false);
  const [recog, setRecog] = useState(() => (sessionStorage.getItem("mira_welcomed") ? "done" : "scanning"));
  const lastMira = useRef("");

  // Recognition sequence: scan → verified → spoken welcome (once per session)
  useEffect(() => {
    if (sessionStorage.getItem("mira_welcomed")) return undefined;
    const t1 = setTimeout(() => setRecog("verified"), 1700);
    const t2 = setTimeout(() => {
      setRecog("done");
      sessionStorage.setItem("mira_welcomed", "1");
      const hour = new Date().getHours();
      const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
      const name = (user?.name || "Boss").split(" ")[0];
      speak(`Welcome back, ${name}! Good ${part}. Mira is online and ready for you.`);
    }, 3300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    const [h, b] = await Promise.all([
      api.get("/super-admin/mira/home").catch(() => ({ data: null })),
      api.get("/super-admin/mira/briefing").catch(() => ({ data: null })),
    ]);
    setHome(h.data);
    if (b.data?.text) setGreeting(b.data.text);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function ask(text) {
    const question = (text || q).trim();
    if (!question || thinking) return;
    setQ("");
    setChat(c => [...c.slice(-6), { role: "boss", text: question }]);
    setThinking(true);
    try {
      const { data } = await api.post("/super-admin/mira/ask", { question, last_mira: lastMira.current });
      lastMira.current = data.answer || "";
      setChat(c => [...c.slice(-6), { role: "mira", text: data.answer || "…" }]);
      if (data.tab) {
        toast.info("Opening " + data.tab + " for you, Boss ✦");
        setTimeout(() => onGoTab?.(data.tab), 1200);
      }
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Mira couldn't answer just now");
    } finally { setThinking(false); }
  }

  const snap = home?.snapshot || {};
  const cards = [
    { key: "hot", label: "Hot Leads", value: snap.hot_leads ?? "—", icon: Flame, tone: "from-orange-500/20 to-rose-500/10 text-orange-300", tab: "mira-leads" },
    { key: "followups", label: "Follow-ups", value: home?.followups_due ?? "—", icon: CalendarClock, tone: "from-sky-500/20 to-blue-500/10 text-sky-300", tab: "demo-calendar" },
    { key: "opps", label: "New Prospects (48h)", value: home?.new_prospects_48h ?? "—", icon: Target, tone: "from-emerald-500/20 to-teal-500/10 text-emerald-300", tab: "mira-leads" },
    { key: "campaigns", label: "Outreach Sent", value: home?.emails_sent ?? "—", icon: Megaphone, tone: "from-fuchsia-500/20 to-purple-500/10 text-fuchsia-300", tab: "lead-email" },
    { key: "insights", label: "Trials Expiring Soon", value: home?.trials_expiring ?? "—", icon: Lightbulb, tone: "from-amber-500/20 to-yellow-500/10 text-amber-300", tab: "billing" },
  ];

  const suggestions = ["Find salon leads in Bangalore", "Call the hot leads", "How did we do yesterday?", "Show today's follow-ups"];

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b1020] via-[#101a35] to-[#0b0f1e] text-white p-5 sm:p-8" data-testid="mira-home">
      {/* Recognition overlay */}
      {recog !== "done" && (
        <div className="absolute inset-0 z-20 bg-[#0b1020]/95 backdrop-blur-sm flex flex-col items-center justify-center" data-testid="mira-recognition-overlay">
          <div className="relative w-28 h-28 mb-5">
            <span className="absolute -inset-3 rounded-full border-2 border-dashed border-fuchsia-400/50 animate-spin" style={{ animationDuration: "3s" }} />
            <span className="absolute inset-0 rounded-full border border-sky-400/40 animate-ping" style={{ animationDuration: "1.4s" }} />
            <img src="/mira-bot.png" alt="Mira" className="relative w-28 h-28 rounded-full object-cover border-2 border-fuchsia-400/60" />
          </div>
          {recog === "scanning" ? (
            <div className="flex items-center gap-2 text-sm text-white/70"><ScanFace className="w-4 h-4 text-fuchsia-400 animate-pulse" /> Recognizing you…</div>
          ) : (
            <div className="text-sm text-emerald-300 flex items-center gap-2 animate-fade-up">
              ✓ Verified · <b>{user?.name || user?.email || "Boss"}</b> <span className="text-white/40">· Super Admin</span>
            </div>
          )}
        </div>
      )}
      {/* ambient glow */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[480px] h-[480px] rounded-full bg-fuchsia-500/10 blur-3xl pointer-events-none" />
      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Main column */}
        <div className="flex flex-col items-center text-center">
          {/* Animated avatar */}
          <div className="relative w-28 h-28 mb-4" data-testid="mira-avatar">
            <span className="absolute inset-0 rounded-full border border-fuchsia-400/30 animate-ping" style={{ animationDuration: "2.6s" }} />
            <span className="absolute -inset-2 rounded-full border border-sky-400/20 animate-pulse" />
            <img src="/mira-bot.png" alt="Mira" className="relative w-28 h-28 rounded-full object-cover border-2 border-fuchsia-400/60 shadow-[0_0_45px_rgba(217,70,239,0.35)]" />
            <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-[#0b1020]" title="Mira is online" />
          </div>
          <h2 className="font-playfair text-2xl sm:text-3xl">Hello Boss 👋</h2>
          <p className="text-sm text-white/60 mt-2 max-w-2xl leading-relaxed" data-testid="mira-greeting">
            {greeting || "I'm ready. Ask me to find leads, research salons, plan today's outreach or review your business."}
          </p>

          {/* Chat strip */}
          {chat.length > 0 && (
            <div className="w-full max-w-2xl mt-4 space-y-2 text-left" data-testid="mira-chat-strip">
              {chat.slice(-4).map((m, i) => (
                <div key={i} className={`text-xs px-3.5 py-2.5 rounded-2xl leading-relaxed ${m.role === "boss"
                  ? "bg-white/10 border border-white/10 ml-10" : "bg-fuchsia-500/15 border border-fuchsia-400/20 mr-10"}`}>
                  <b className={m.role === "boss" ? "text-sky-300" : "text-fuchsia-300"}>{m.role === "boss" ? "You" : "Mira"}:</b> {m.text}
                </div>
              ))}
            </div>
          )}

          {/* Ask input */}
          <div className="w-full max-w-2xl mt-5 flex items-center gap-2 bg-white/5 border border-white/15 rounded-full px-4 py-1.5 focus-within:border-fuchsia-400/50 transition-colors">
            <Sparkles className="w-4 h-4 text-fuchsia-400 shrink-0" />
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && ask()}
              placeholder="Ask Mira anything…" data-testid="mira-home-ask-input"
              className="flex-1 bg-transparent text-sm py-2.5 focus:outline-none placeholder:text-white/30" />
            <button onClick={() => ask()} disabled={thinking || !q.trim()} data-testid="mira-home-ask-send"
              className="w-9 h-9 rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 disabled:opacity-40 flex items-center justify-center transition-colors">
              {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            {suggestions.map(s => (
              <button key={s} onClick={() => ask(s)} data-testid={`mira-suggestion-${s.slice(0, 10).replace(/\s/g, "-")}`}
                className="text-[11px] px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-fuchsia-400/40 transition-colors">
                {s}
              </button>
            ))}
          </div>

          {/* Bottom cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full mt-7">
            {cards.map(c => (
              <button key={c.key} onClick={() => onGoTab?.(c.tab)} data-testid={`mira-card-${c.key}`}
                className={`rounded-2xl bg-gradient-to-br ${c.tone} border border-white/10 p-3.5 text-left hover:border-white/30 transition-all hover:-translate-y-0.5`}>
                <c.icon className="w-4 h-4 mb-2 opacity-80" />
                <div className="text-2xl font-bold text-white">{c.value}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/50 mt-0.5">{c.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel — status + Memory Timeline */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4" data-testid="mira-status-panel">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-white/70">
                <Brain className="w-4 h-4 text-fuchsia-400" /> Current Task
              </div>
              <button onClick={() => setVault(true)} data-testid="open-memory-vault"
                className="text-[10px] px-2.5 py-1 rounded-full bg-fuchsia-500/20 border border-fuchsia-400/30 text-fuchsia-200 hover:bg-fuchsia-500/30 transition-colors">
                🧠 Memory Vault
              </button>
            </div>
            {home?.active_run ? (
              <div className="text-xs text-emerald-300 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Hunting salons in {home.active_run.city} — {home.active_run.found || 0} found ({home.active_run.stage})
              </div>
            ) : thinking ? (
              <div className="text-xs text-fuchsia-300 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking about your question…</div>
            ) : (
              <div className="text-xs text-white/40">Idle — ready for your next instruction ✦</div>
            )}
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-4" data-testid="mira-memory-timeline">
            <div className="flex items-center gap-2 text-xs font-semibold text-white/70 mb-3">
              <Clock className="w-4 h-4 text-sky-400" /> Memory Timeline
            </div>
            {(home?.timeline || []).length === 0 ? (
              <p className="text-[11px] text-white/35">No memories yet — start a lead search or ask me anything and I'll remember it here.</p>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 relative">
                <span className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />
                {home.timeline.map(ev => (
                  <div key={ev.id} className="relative pl-6" data-testid={`timeline-event-${ev.id}`}>
                    <span className="absolute left-0 top-0.5 w-3.5 h-3.5 rounded-full bg-[#101a35] border border-fuchsia-400/50 flex items-center justify-center text-[8px]">
                      {KIND_ICON[ev.kind] || "✦"}
                    </span>
                    <div className="text-[10px] text-white/35">{timeLabel(ev.created_at)}</div>
                    <div className="text-[11px] text-white/75 leading-snug">{ev.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {vault && <MemoryVault onClose={() => setVault(false)} />}
    </div>
  );
}
