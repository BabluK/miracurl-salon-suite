import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Sparkles, Send, Loader2, Copy, Image as ImageIcon, Link2, RefreshCw, Wand2, Bot, CalendarDays, Rocket, History,
} from "lucide-react";
import { MiraCalendar } from "@/components/MiraCalendar";
import { MiraAutopilot } from "@/components/MiraAutopilot";
import { SocialHistoryPanel } from "@/components/SocialHistoryPanel";
import { MiraSocialNudge } from "@/components/MiraSocialNudge";
import { confirmAsync } from "@/components/ConfirmDialog";

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
  const [tab, setTab] = useState("agents");
  const endRef = useRef(null);
  const DATA_AGENTS = ["analytics", "leadfinder", "staff_verify"];
  const CONNECT_MAP = {
    social: { provider: "meta", label: "Connect Instagram & Facebook" },
    whatsapp: { provider: "meta", label: "Connect Meta (WhatsApp Business)" },
    google: { provider: "google", label: "Connect Google Business Profile" },
  };

  async function startConnect(agentKey) {
    const m = CONNECT_MAP[agentKey];
    if (!m) return;
    try {
      const { data } = await api.get(`/social/${m.provider}/oauth/start`);
      window.location.href = data.auth_url;
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "string" ? d : `${m.provider === "meta" ? "Meta" : "Google"} connection isn't configured yet — API keys needed`);
    }
  }

  useEffect(() => {
    api.get("/mira-studio/agents").then(r => { setAgents(r.data.agents); setConns(r.data.connections); }).catch(() => {});
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [result, reply]);

  async function runAgent(agent, topic, extra = {}) {
    setBusy(true);
    try {
      if (agent === "social") {
        const { data } = await api.post("/mira-studio/social/generate", { topic, platforms: ["instagram", "facebook", "google"], with_image: true, image_style: "luxury", ...extra });
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
      } else if (agent === "google_post") {
        const { data } = await api.post("/mira-studio/google/post", { topic, with_image: true });
        setResult({ type: "google_post", topic, ...data });
      } else if (agent === "google" && conns.google_business) {
        const { data } = await api.get("/social/google/reviews");
        setResult({ type: "greviews", ...data });
      } else if (agent === "whatsapp" || agent === "google") {
        const { data } = await api.post("/mira-studio/generate", { agent: "content", topic });
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

  function reusePost(p) {
    const topic = `Refresh of past post: ${(p.caption || "").split("\n")[0].slice(0, 90)}`;
    setTab("agents"); setResult(null);
    setReply("♻️ Refreshing your past post — same offer, brand-new wording and a fresh image…");
    window.scrollTo({ top: 0, behavior: "smooth" });
    runAgent("social", topic, { reuse_post_id: p.id });
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6" data-testid="mira-studio-page">
      <div className="bg-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative">
          <h1 className="font-playfair text-4xl sm:text-5xl text-slate-900 leading-[1.05] flex items-center gap-2"><Sparkles className="w-7 h-7 text-fuchsia-300" /> Mira Studio</h1>
          <p className="text-white/60 text-sm mt-1">Your AI marketing team — 11 specialist agents on auto-pilot. Just tell Mira what you want.</p>
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

      {/* Tabs */}
      <div className="flex gap-2" data-testid="mira-studio-tabs">
        <button data-testid="mira-tab-agents" onClick={() => setTab("agents")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 ${tab === "agents" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-fuchsia-300"}`}>
          <Bot className="w-4 h-4" /> AI Agents
        </button>
        <button data-testid="mira-tab-autopilot" onClick={() => setTab("autopilot")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 ${tab === "autopilot" ? "bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-fuchsia-300"}`}>
          <Rocket className="w-4 h-4" /> Auto-Pilot
        </button>
        <button data-testid="mira-tab-calendar" onClick={() => setTab("calendar")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 ${tab === "calendar" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-fuchsia-300"}`}>
          <CalendarDays className="w-4 h-4" /> Content Calendar
        </button>
        <button data-testid="mira-tab-history" onClick={() => setTab("history")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 ${tab === "history" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-fuchsia-300"}`}>
          <History className="w-4 h-4" /> Post History
        </button>
      </div>

      {tab === "autopilot" && <MiraAutopilot />}
      {tab === "calendar" && <MiraCalendar canPost={!!(conns.instagram || conns.facebook)} />}
      {tab === "history" && <SocialHistoryPanel onReuse={reusePost} />}

      {tab === "agents" && <>
      <MiraSocialNudge variant="studio" onSuggest={(kind) => {
        if (kind === "specific") {
          toast.info("Tell Mira what you'd like to post ✦");
          document.querySelector('[data-testid="mira-studio-input"]')?.focus();
          return;
        }
        setResult(null);
        setReply(kind === "package" ? "✨ Crafting a tempting package deal for you…" : "✨ On it! Crafting a fresh offer to bring guests in…");
        runAgent("social", kind === "package"
          ? "an attractive salon package deal bundling popular services at a great price, to promote today"
          : "an irresistible limited-time salon offer for today to bring more customers in");
      }} />
      {/* Agent grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="mira-agent-grid">
        {agents.filter(a => a.key !== "orchestrator").map(a => (
          <button key={a.key} data-testid={`agent-${a.key}`}
            disabled={busy}
            onClick={() => {
              if (DATA_AGENTS.includes(a.key) || (a.key === "google" && conns.google_business)) { setResult(null); setReply(""); runAgent(a.key, ""); }
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
            {pendingAgent.status === "connect_account" && CONNECT_MAP[pendingAgent.key] && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3" data-testid="mira-connect-box">
                <p className="text-xs text-amber-800 font-semibold">⚡ Account not connected</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Connect your account so Mira can actually <b>post & reply for you automatically</b>. Without connecting, she can only draft content for you to copy-paste.
                </p>
                <button data-testid="mira-connect-btn" onClick={() => startConnect(pendingAgent.key)}
                  className="mt-2 w-full px-3 py-2 rounded-lg bg-slate-900 text-amber-300 text-xs font-bold hover:bg-slate-800 inline-flex items-center justify-center gap-1.5">
                  🔗 {CONNECT_MAP[pendingAgent.key].label}
                </button>
              </div>
            )}
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

      {result && <ResultView result={result} conns={conns} onRegen={() => runAgent(result.type === "social" ? "social" : result.agent || result.type, result.topic)} />}
      </>}
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

function ResultView({ result, conns = {}, onRegen }) {
  const r = result;
  return (
    <div className="space-y-3" data-testid="mira-result">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700 flex items-center gap-1.5"><Wand2 className="w-4 h-4 text-fuchsia-500" /> {r.topic ? `“${r.topic}”` : "Result"}</h3>
        <button onClick={onRegen} className="text-xs inline-flex items-center gap-1 text-slate-500 hover:text-fuchsia-600" data-testid="mira-regenerate"><RefreshCw className="w-3.5 h-3.5" /> Regenerate</button>
      </div>

      {r.type === "social" && Object.keys(r.posted_today || {}).length > 0 && (
        <div data-testid="mira-already-posted-warning" className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-sm text-amber-800">
          <b>Heads up ✦</b> You already posted today on{" "}
          {Object.entries(r.posted_today).map(([k, v]) => `${k} — “${v.slice(0, 70)}${v.length > 70 ? "…" : ""}”`).join("; ")}.
          {" "}Do you want to post this as well?
        </div>
      )}

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
            {(conns.instagram || conns.facebook) && r.image_url && <PostNowButton result={r} conns={conns} />}
            <ManualShareRow result={r} />
          </div>
        </div>
      )}

      {r.type === "google_post" && <GooglePostResult key={`${r.topic}-${r.question || ""}`} r={r} />}

      {["content"].includes(r.type) && r.result && (
        <Block label="Content" copyText={`${r.result.title}\n\n${r.result.body}\n\n${r.result.cta}`}>
          <p className="font-semibold text-slate-800">{r.result.title}</p>
          <p className="text-sm text-slate-700 whitespace-pre-line mt-1">{r.result.body}</p>
          <p className="text-sm text-fuchsia-600 mt-2 font-medium">{r.result.cta}</p>
        </Block>
      )}

      {r.type === "seo" && r.result && (
        <div className="space-y-3">
          <Block label="Keywords" copyText={(r.result.keywords || []).join(", ")}><div className="flex flex-wrap gap-1.5">{(r.result.keywords || []).map((k, i) => <span key={`${k}-${i}`} className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{k}</span>)}</div></Block>
          <Block label="Meta description" copyText={r.result.meta_description}><p className="text-sm text-slate-700">{r.result.meta_description}</p></Block>
          <Block label="Google Business post" copyText={r.result.gmb_post}><p className="text-sm text-slate-700 whitespace-pre-line">{r.result.gmb_post}</p></Block>
        </div>
      )}

      {r.type === "video" && r.result && (
        <Block label="Reel script" copyText={`Hook: ${r.result.hook}\n\n${(r.result.script || []).join("\n")}\n\nCaption: ${r.result.caption}`}>
          <p className="text-sm font-semibold text-slate-800">🎬 {r.result.hook}</p>
          <ol className="text-sm text-slate-700 mt-2 space-y-1 list-decimal list-inside">{(r.result.script || []).map((s, i) => <li key={`${i}-${s.slice(0, 24)}`}>{s}</li>)}</ol>
          <p className="text-xs text-slate-500 mt-2">🎵 {r.result.audio_idea}</p>
          <p className="text-sm text-fuchsia-600 mt-1">{r.result.caption}</p>
        </Block>
      )}

      {r.type === "email" && r.result && <EmailCampaignPanel result={r.result} />}

      {r.type === "sales" && r.result && (
        <Block label="Sales script" copyText={r.result.pitch}>
          <p className="text-sm text-slate-700">{r.result.pitch}</p>
          <p className="text-xs uppercase tracking-wider text-slate-400 mt-3 mb-1">Upsells</p>
          <ul className="text-sm text-slate-700 list-disc list-inside">{(r.result.upsells || []).map((u, i) => <li key={`${u.slice(0, 24)}-${i}`}>{u}</li>)}</ul>
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
            {(r.winback_leads || []).map((l) => (
              <div key={l.phone || l.name} className="flex items-center justify-between text-sm border-b border-slate-100 py-1.5">
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
          <div className="space-y-1.5">{(r.staff || []).map((s) => (
            <div key={s.phone || s.name} className="flex items-center justify-between text-sm border-b border-slate-100 py-1.5">
              <span className="text-slate-700">{s.name}</span>
              {s.in_registry ? <span className="text-xs text-emerald-600">✓ Verified ({s.registry_code})</span> : <span className="text-xs text-amber-600">Not in registry</span>}
            </div>))}</div>
        </Block>
      )}

      {r.type === "greviews" && (
        <Block label={`Google reviews (${(r.reviews || []).length}${r.average_rating ? ` · avg ${r.average_rating}★` : ""})`}>
          <div className="space-y-3 max-h-[32rem] overflow-y-auto">
            {(r.reviews || []).map((rev) => <GReviewRow key={rev.review_id} review={rev} />)}
            {(!r.reviews || r.reviews.length === 0) && <p className="text-sm text-slate-400 py-4 text-center">No reviews found yet ✦</p>}
          </div>
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

function GooglePostResult({ r }) {
  const [posted, setPosted] = useState(!!r.posted);
  const [needs, setNeeds] = useState(!!r.needs_confirmation);
  const [pubResult, setPubResult] = useState(r.result || null);
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);
  const draft = r.draft || {};

  const postNow = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/mira-studio/google/post", {
        topic: r.topic || "offer", caption: draft.caption, offer_title: draft.offer_title,
        image_url: draft.image_url, with_image: false, confirm: true,
      });
      setPosted(!!data.posted); setNeeds(false); setPubResult(data.result || null);
      if (data.posted) toast.success("Posted to Google Business 🎉");
      else toast.error(data.result?.error?.slice(0, 140) || "Google posting failed — post manually below");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Posting failed");
    } finally { setBusy(false); }
  };

  const copyAndOpen = () => { copy(draft.caption || ""); window.open("https://business.google.com/posts", "_blank", "noopener"); };

  return (
    <div className="grid md:grid-cols-2 gap-3" data-testid="mira-google-post-result">
      <div className="space-y-3">
        {needs && !declined && !posted && (
          <div data-testid="mira-google-confirm" className="bg-amber-50 border border-amber-300 rounded-xl p-4">
            <p className="text-sm text-amber-900">{r.question}</p>
            <div className="flex gap-2 mt-3">
              <button data-testid="mira-google-confirm-yes" onClick={postNow} disabled={busy}
                className="text-xs px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold disabled:opacity-60 inline-flex items-center gap-1.5">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Yes, post it
              </button>
              <button data-testid="mira-google-confirm-no" onClick={() => setDeclined(true)}
                className="text-xs px-4 py-2 rounded-lg border border-slate-300 text-slate-600">No, keep as draft</button>
            </div>
          </div>
        )}
        {declined && !posted && (
          <div data-testid="mira-google-draft-kept" className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
            👍 Kept as a draft — you can post it manually below whenever you like.
          </div>
        )}
        {posted && (
          <div data-testid="mira-google-posted" className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 text-sm text-emerald-800">
            ✅ Posted to your Google Business Profile ✦
          </div>
        )}
        {!posted && !needs && !declined && pubResult && (
          <div data-testid="mira-google-post-failed" className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
            ⚡ Couldn't auto-post: {pubResult.error || "Google Business not ready"}. Post manually below — the caption copies automatically.
          </div>
        )}
        <Block label="Google Business offer" copyText={draft.caption}>
          {draft.offer_title && <p className="font-semibold text-slate-800">{draft.offer_title}</p>}
          <p className="text-sm text-slate-700 whitespace-pre-line mt-1">{draft.caption}</p>
        </Block>
        {!posted && (
          <button data-testid="mira-google-manual-post" onClick={copyAndOpen}
            className="w-full text-xs px-3 py-2.5 rounded-xl bg-slate-900 text-white font-semibold">
            Post manually on Google (caption copies) ↗
          </button>
        )}
      </div>
      <div>
        {draft.image_url ? (
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <img src={abs(draft.image_url)} alt="Offer" data-testid="mira-google-image" className="w-full rounded-lg" />
            <a href={abs(draft.image_url)} download target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-fuchsia-600"><ImageIcon className="w-3.5 h-3.5" /> Download image</a>
          </div>
        ) : <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-400 text-sm">No image</div>}
      </div>
    </div>
  );
}

function EmailCampaignPanel({ result }) {
  const [html, setHtml] = useState("");
  const [audience, setAudience] = useState("all");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    api.post("/mira-studio/email-campaign/preview", { body: result.body })
      .then(r => setHtml(r.data.html)).catch(() => {});
  }, [result.body]);

  const send = async () => {
    if (!await confirmAsync(`Send this campaign to ${audience === "all" ? "ALL customers with an email" : "lapsed guests (45+ days)"}? Mira sends from your salon's email.`)) return;
    setSending(true);
    try {
      const { data } = await api.post("/mira-studio/email-campaign/send", {
        subject: result.subject, body: result.body, audience,
      });
      setDone(data);
      if (data.sent > 0) toast.success(`Campaign sent to ${data.sent} guests 🎉`);
      else toast.info(data.note || "No eligible recipients right now");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Send failed");
    } finally { setSending(false); }
  };

  return (
    <Block label="Email campaign" copyText={`Subject: ${result.subject}\n\n${result.body}`}>
      <p className="text-sm"><b>Subject:</b> {result.subject}</p>
      {result.preview_text && <p className="text-xs text-slate-400">{result.preview_text}</p>}
      {html ? (
        <iframe title="email preview" srcDoc={html} sandbox="" data-testid="email-preview-iframe"
          className="w-full h-80 mt-3 rounded-xl border border-slate-200 bg-white" />
      ) : (
        <p className="text-sm text-slate-700 whitespace-pre-line mt-2">{result.body}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
        <select value={audience} onChange={e => setAudience(e.target.value)} data-testid="campaign-audience-select"
          className="text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 [&_option]:bg-white [&_option]:text-slate-800">
          <option value="all">All customers with email</option>
          <option value="winback">Lapsed guests (45+ days)</option>
        </select>
        <button data-testid="campaign-send-btn" onClick={send} disabled={sending || done?.sent > 0}
          className="text-xs px-4 py-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white font-semibold disabled:opacity-60 inline-flex items-center gap-1.5">
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {done?.sent > 0 ? `Sent to ${done.sent} ✓` : sending ? "Sending…" : "Send campaign ✦"}
        </button>
        <span className="text-[10px] text-slate-400">Sends from your salon email · 7-day repeat protection · max 100/run</span>
      </div>
    </Block>
  );
}

function PostNowButton({ result, conns }) {
  const [posting, setPosting] = useState(false);
  const [done, setDone] = useState(false);
  const platforms = ["instagram", "facebook"].filter(p => conns[p]);

  const post = async () => {
    const dup = platforms.filter(pl => (result.posted_today || {})[pl]);
    if (dup.length && !await confirmAsync(`You already posted on ${dup.join(" & ")} today. Post this as well?`)) return;
    const p = result.posts || {};
    const src = p.instagram || p.facebook || Object.values(p)[0] || {};
    const caption = `${src.caption || ""}\n\n${(src.hashtags || []).join(" ")}`.trim();
    setPosting(true);
    try {
      const { data } = await api.post("/social/publish", { caption, image_url: result.image_url, platforms });
      const ok = Object.entries(data.results).filter(([, v]) => v.ok).map(([k]) => k);
      const fail = Object.entries(data.results).filter(([, v]) => !v.ok);
      if (ok.length) { toast.success(`Posted to ${ok.join(" + ")} 🎉`); setDone(true); }
      fail.forEach(([k, v]) => toast.error(`${k}: ${v.error?.slice(0, 120) || "failed"}`));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Publish failed");
    } finally { setPosting(false); }
  };

  return (
    <button data-testid="mira-post-now" onClick={post} disabled={posting || done}
      className="mt-3 w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2">
      {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      {done ? "Posted ✓" : posting ? "Posting…" : `Post to ${platforms.map(pl => pl === "instagram" ? "Instagram" : "Facebook").join(" + ")}`}
    </button>
  );
}

function ManualShareRow({ result }) {
  const p = result.posts || {};
  const cap = (plat) => {
    const src = p[plat] || p.instagram || Object.values(p)[0] || {};
    return `${src.caption || ""}\n\n${(src.hashtags || []).join(" ")}`.trim();
  };
  const openAfterCopy = (plat, url) => {
    copy(cap(plat));
    window.open(url, "_blank", "noopener");
  };
  return (
    <div className="mt-3 bg-slate-50 rounded-xl border border-slate-200 p-3" data-testid="manual-share-row">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Post manually — caption copies automatically ✦</p>
      <div className="flex flex-wrap gap-2">
        <button data-testid="manual-share-instagram" onClick={() => openAfterCopy("instagram", "https://www.instagram.com/")}
          className="text-xs px-3 py-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white font-medium">Instagram ↗</button>
        <button data-testid="manual-share-facebook" onClick={() => openAfterCopy("facebook", "https://www.facebook.com/")}
          className="text-xs px-3 py-2 rounded-lg bg-blue-600 text-white font-medium">Facebook ↗</button>
        <button data-testid="manual-share-google" onClick={() => openAfterCopy("google", "https://business.google.com/posts")}
          className="text-xs px-3 py-2 rounded-lg bg-slate-900 text-white font-medium">Google Business ↗</button>
        <button data-testid="manual-share-whatsapp" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(cap("instagram"))}`, "_blank", "noopener")}
          className="text-xs px-3 py-2 rounded-lg bg-emerald-600 text-white font-medium">WhatsApp Status ↗</button>
      </div>
      <p className="text-[10px] text-slate-400 mt-2">1. Tap a platform (caption is copied) → 2. Download the image above → 3. Paste &amp; post in the new tab.</p>
    </div>
  );
}

function GReviewRow({ review }) {
  const [draft, setDraft] = useState(review.reply || "");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(!!review.reply);
  const [open, setOpen] = useState(false);

  const aiDraft = async () => {
    setDrafting(true);
    try {
      const { data } = await api.post("/social/google/draft-reply", {
        reviewer: review.reviewer, rating: review.rating, comment: review.comment || "",
      });
      setDraft(data.draft); setOpen(true);
    } catch { toast.error("Couldn't draft a reply"); }
    finally { setDrafting(false); }
  };

  const sendReply = async () => {
    setSending(true);
    try {
      await api.post("/social/google/reviews/reply", { review_id: review.review_id, comment: draft });
      toast.success("Reply posted to Google ✦"); setSent(true); setOpen(false);
    } catch (e) { toast.error(e.response?.data?.detail || "Reply failed"); }
    finally { setSending(false); }
  };

  return (
    <div className="border-b border-slate-100 pb-3" data-testid={`greview-${review.review_id}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{review.reviewer}</span>
        <span className="text-xs text-amber-500">{"★".repeat(review.rating)}{"☆".repeat(Math.max(0, 5 - review.rating))}</span>
        {sent && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Replied</span>}
      </div>
      {review.comment && <p className="text-sm text-slate-600 mt-1">{review.comment}</p>}
      {sent && !open && review.reply && <p className="text-xs text-slate-400 mt-1 italic">You: {review.reply}</p>}
      {open ? (
        <div className="mt-2">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3}
            className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
          <div className="flex gap-2 mt-1.5">
            <button onClick={sendReply} disabled={sending || !draft.trim()}
              className="text-xs px-3 py-1.5 rounded-lg bg-fuchsia-600 text-white font-medium disabled:opacity-50 inline-flex items-center gap-1">
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Post reply
            </button>
            <button onClick={() => setOpen(false)} className="text-xs px-3 py-1.5 rounded-lg text-slate-500">Cancel</button>
          </div>
        </div>
      ) : !sent && (
        <div className="flex gap-2 mt-2">
          <button onClick={aiDraft} disabled={drafting}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 text-white inline-flex items-center gap-1 disabled:opacity-50">
            {drafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Mira, draft a reply
          </button>
          <button onClick={() => setOpen(true)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500">Write my own</button>
        </div>
      )}
    </div>
  );
}
