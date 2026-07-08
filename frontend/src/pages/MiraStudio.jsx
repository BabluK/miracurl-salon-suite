import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Sparkles, Send, Loader2, Copy, Image as ImageIcon, Link2, RefreshCw, Wand2,
} from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const abs = (u) => (u && u.startsWith("/api/") ? `${BACKEND}${u}` : u);
const copy = (txt) => navigator.clipboard?.writeText(txt).then(() => toast.success("Copied ✦")).catch(() => toast.error("Couldn't copy"));

export default function MiraStudio() {
  const [agents, setAgents] = useState([]);
  const [conns, setConns] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [reply, setReply] = useState("");
  const [pendingAgent, setPendingAgent] = useState(null);
  const [topicInput, setTopicInput] = useState("");
  const endRef = useRef(null);
  const DATA_AGENTS = ["analytics", "leadfinder", "staff_verify"];

  useEffect(() => {
    api.get("/mira-studio/agents").then(r => { setAgents(r.data.agents); setConns(r.data.connections); }).catch(() => {});
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [result, reply]);

  async function runAgent(agent, topic) {
    setBusy(true);
    try {
      if (agent === "social") {
        const { data } = await api.post("/mira-studio/social/generate", { topic, platforms: ["instagram", "facebook", "google"], with_image: true, image_style: "luxury" });
        setResult({ type: "social", ...data });
      } else if (["content", "sales", "seo", "video", "email"].includes(agent)) {
        const { data } = await api.post("/mira-studio/generate", { agent, topic });
        setResult({ type: agent, ...data });
      } else if (agent === "analytics") {
        const { data } = await api.get("/mira-studio/analytics"); setResult({ type: "analytics", ...data });
      } else if (agent === "leadfinder") {
        const { data } = await api.get("/mira-studio/leads"); setResult({ type: "leads", ...data });
      } else if (agent === "staff_verify") {
        const { data } = await api.get("/mira-studio/staff-verification"); setResult({ type: "staff", ...data });
      } else if (agent === "whatsapp" || agent === "google") {
        const { data } = await api.post("/mira-studio/generate", { agent: agent === "google" ? "content" : "content", topic });
        setResult({ type: "draft", agent, ...data });
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Mira hit a snag — try again");
    } finally { setBusy(false); }
  }

  async function send() {
    const m = msg.trim();
    if (!m) return;
    setBusy(true); setResult(null); setReply("");
    try {
      const { data } = await api.post("/mira-studio/orchestrate", { message: m });
      setReply(`${data.agent_meta?.emoji || "✦"} ${data.reply}`);
      await runAgent(data.agent, data.topic);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Mira couldn't understand that");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6" data-testid="mira-studio-page">
      <div className="bg-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative">
          <h1 className="font-playfair text-3xl flex items-center gap-2"><Sparkles className="w-7 h-7 text-fuchsia-300" /> Mira Studio</h1>
          <p className="text-white/60 text-sm mt-1">Your AI marketing team — 12 specialist agents, one command box. Just tell Mira what you want.</p>
          <div className="mt-4 flex gap-2">
            <input
              data-testid="mira-studio-input"
              value={msg}
              onChange={e => setMsg(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !busy && send()}
              placeholder="e.g. Instagram post for our monsoon hair spa 30% off"
              className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
            />
            <button data-testid="mira-studio-send" onClick={send} disabled={busy}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-600 font-semibold hover:from-fuchsia-600 hover:to-pink-700 disabled:opacity-60 flex items-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />} Ask Mira
            </button>
          </div>
          {reply && <p className="mt-3 text-sm text-fuchsia-200" data-testid="mira-studio-reply">{reply}</p>}
        </div>
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="mira-agent-grid">
        {agents.filter(a => a.key !== "orchestrator").map(a => (
          <button key={a.key} data-testid={`agent-${a.key}`}
            disabled={busy}
            onClick={() => {
              if (DATA_AGENTS.includes(a.key)) { setResult(null); setReply(""); runAgent(a.key, ""); }
              else { setPendingAgent(a); setTopicInput(msg || ""); }
            }}
            className="text-left bg-white rounded-xl border border-slate-200 p-3.5 hover:border-fuchsia-300 hover:shadow-md transition disabled:opacity-60">
            <div className="flex items-center justify-between">
              <span className="text-2xl">{a.emoji}</span>
              {a.status === "connect_account"
                ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wider">Connect</span>
                : <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">Ready</span>}
            </div>
            <p className="text-sm font-semibold text-slate-800 mt-2">{a.name}</p>
            <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{a.desc}</p>
          </button>
        ))}
      </div>

      {busy && !result && <div className="text-center py-8 text-slate-500"><Loader2 className="w-6 h-6 animate-spin inline" /> Mira is creating…</div>}

      {pendingAgent && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="mira-topic-modal" onClick={() => setPendingAgent(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-slate-800 flex items-center gap-2"><span className="text-2xl">{pendingAgent.emoji}</span> {pendingAgent.name}</p>
            <p className="text-xs text-slate-500 mt-1">{pendingAgent.desc}</p>
            <input
              autoFocus
              data-testid="mira-topic-input"
              value={topicInput}
              onChange={e => setTopicInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && topicInput.trim()) { const a = pendingAgent.key; setPendingAgent(null); setResult(null); setReply(""); runAgent(a, topicInput.trim()); } }}
              placeholder="e.g. bridal makeup package, keratin offer…"
              className="mt-3 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button data-testid="mira-topic-cancel" onClick={() => setPendingAgent(null)} className="px-4 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-100">Cancel</button>
              <button
                data-testid="mira-topic-go"
                disabled={!topicInput.trim()}
                onClick={() => { const a = pendingAgent.key; setPendingAgent(null); setResult(null); setReply(""); runAgent(a, topicInput.trim()); }}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-fuchsia-500 to-pink-600 disabled:opacity-50">
                Create ✦
              </button>
            </div>
          </div>
        </div>
      )}

      {result && <ResultView result={result} onRegen={() => runAgent(result.type === "social" ? "social" : result.agent || result.type, result.topic)} />}
      <div ref={endRef} />
    </div>
  );
}

function Block({ label, children, copyText }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</span>
        {copyText && <button onClick={() => copy(copyText)} className="text-fuchsia-600 hover:bg-fuchsia-50 p-1 rounded" data-testid={`copy-${label}`}><Copy className="w-3.5 h-3.5" /></button>}
      </div>
      {children}
    </div>
  );
}

function ResultView({ result, onRegen }) {
  const r = result;
  return (
    <div className="space-y-3" data-testid="mira-result">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700 flex items-center gap-1.5"><Wand2 className="w-4 h-4 text-fuchsia-500" /> {r.topic ? `“${r.topic}”` : "Result"}</h3>
        <button onClick={onRegen} className="text-xs inline-flex items-center gap-1 text-slate-500 hover:text-fuchsia-600" data-testid="mira-regenerate"><RefreshCw className="w-3.5 h-3.5" /> Regenerate</button>
      </div>

      {r.type === "social" && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-3">
            {Object.entries(r.posts || {}).map(([plat, p]) => (
              <Block key={plat} label={plat} copyText={`${p.caption}\n\n${(p.hashtags || []).join(" ")}`}>
                <p className="text-sm text-slate-700 whitespace-pre-line">{p.caption}</p>
                <p className="text-xs text-fuchsia-600 mt-2">{(p.hashtags || []).join(" ")}</p>
              </Block>
            ))}
          </div>
          <div>
            {r.image_url ? (
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <img src={abs(r.image_url)} alt="AI promo" data-testid="mira-social-image" className="w-full rounded-lg" />
                <a href={abs(r.image_url)} download target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-fuchsia-600"><ImageIcon className="w-3.5 h-3.5" /> Download image</a>
              </div>
            ) : <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-400 text-sm">No image generated</div>}
          </div>
        </div>
      )}

      {["content"].includes(r.type) && r.result && (
        <Block label="Content" copyText={`${r.result.title}\n\n${r.result.body}\n\n${r.result.cta}`}>
          <p className="font-semibold text-slate-800">{r.result.title}</p>
          <p className="text-sm text-slate-700 whitespace-pre-line mt-1">{r.result.body}</p>
          <p className="text-sm text-fuchsia-600 mt-2 font-medium">{r.result.cta}</p>
        </Block>
      )}

      {r.type === "seo" && r.result && (
        <div className="space-y-3">
          <Block label="Keywords" copyText={(r.result.keywords || []).join(", ")}><div className="flex flex-wrap gap-1.5">{(r.result.keywords || []).map((k, i) => <span key={i} className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{k}</span>)}</div></Block>
          <Block label="Meta description" copyText={r.result.meta_description}><p className="text-sm text-slate-700">{r.result.meta_description}</p></Block>
          <Block label="Google Business post" copyText={r.result.gmb_post}><p className="text-sm text-slate-700 whitespace-pre-line">{r.result.gmb_post}</p></Block>
        </div>
      )}

      {r.type === "video" && r.result && (
        <Block label="Reel script" copyText={`Hook: ${r.result.hook}\n\n${(r.result.script || []).join("\n")}\n\nCaption: ${r.result.caption}`}>
          <p className="text-sm font-semibold text-slate-800">🎬 {r.result.hook}</p>
          <ol className="text-sm text-slate-700 mt-2 space-y-1 list-decimal list-inside">{(r.result.script || []).map((s, i) => <li key={i}>{s}</li>)}</ol>
          <p className="text-xs text-slate-500 mt-2">🎵 {r.result.audio_idea}</p>
          <p className="text-sm text-fuchsia-600 mt-1">{r.result.caption}</p>
        </Block>
      )}

      {r.type === "email" && r.result && (
        <Block label="Email campaign" copyText={`Subject: ${r.result.subject}\n\n${r.result.body}`}>
          <p className="text-sm"><b>Subject:</b> {r.result.subject}</p>
          <p className="text-xs text-slate-400">{r.result.preview_text}</p>
          <p className="text-sm text-slate-700 whitespace-pre-line mt-2">{r.result.body}</p>
        </Block>
      )}

      {r.type === "sales" && r.result && (
        <Block label="Sales script" copyText={r.result.pitch}>
          <p className="text-sm text-slate-700">{r.result.pitch}</p>
          <p className="text-xs uppercase tracking-wider text-slate-400 mt-3 mb-1">Upsells</p>
          <ul className="text-sm text-slate-700 list-disc list-inside">{(r.result.upsells || []).map((u, i) => <li key={i}>{u}</li>)}</ul>
        </Block>
      )}

      {r.type === "analytics" && (
        <Block label="Business insight"><p className="text-sm text-slate-700 whitespace-pre-line">{r.summary}</p>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="bg-slate-50 rounded-lg p-2"><div className="text-lg font-bold text-slate-800">₹{(r.stats?.month_revenue || 0).toLocaleString("en-IN")}</div><div className="text-[10px] text-slate-400">This month</div></div>
            <div className="bg-slate-50 rounded-lg p-2"><div className="text-lg font-bold text-slate-800">{r.stats?.customers || 0}</div><div className="text-[10px] text-slate-400">Customers</div></div>
            <div className="bg-slate-50 rounded-lg p-2"><div className="text-lg font-bold text-slate-800">{r.stats?.total_bills || 0}</div><div className="text-[10px] text-slate-400">Bills</div></div>
          </div>
        </Block>
      )}

      {r.type === "leads" && (
        <Block label={`Win-back leads (${r.count})`}>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {(r.winback_leads || []).map((l, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-slate-100 py-1.5">
                <span className="text-slate-700">{l.name} <span className="text-xs text-slate-400">· {l.days_since}d ago</span></span>
                <a href={`https://wa.me/91${(l.phone || "").replace(/\D/g, "").slice(-10)}`} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 font-medium">WhatsApp →</a>
              </div>
            ))}
            {(!r.winback_leads || r.winback_leads.length === 0) && <p className="text-sm text-slate-400 py-4 text-center">No win-back leads right now ✦</p>}
          </div>
        </Block>
      )}

      {r.type === "staff" && (
        <Block label={`Staff verification (${r.verified}/${r.total} in registry)`}>
          <div className="space-y-1.5">{(r.staff || []).map((s, i) => (
            <div key={i} className="flex items-center justify-between text-sm border-b border-slate-100 py-1.5">
              <span className="text-slate-700">{s.name}</span>
              {s.in_registry ? <span className="text-xs text-emerald-600">✓ Verified ({s.registry_code})</span> : <span className="text-xs text-amber-600">Not in registry</span>}
            </div>))}</div>
        </Block>
      )}

      {r.type === "draft" && r.result && (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Draft ready. Connect your account in Settings to let Mira post/send this automatically.
          </div>
          <Block label="Draft" copyText={`${r.result.title || ""}\n${r.result.body || ""}`}>
            <p className="text-sm text-slate-700 whitespace-pre-line">{r.result.body || r.result.title}</p>
          </Block>
        </>
      )}
    </div>
  );
}
