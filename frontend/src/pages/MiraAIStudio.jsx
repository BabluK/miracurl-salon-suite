import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Sparkles, Globe, Smartphone, Server, LayoutDashboard, Boxes, Rocket,
  Download, ExternalLink, Wand2, X, CheckCircle2, Loader2, Circle, Store, Scissors, FileCode2,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const BUILD_CHIPS = [
  { label: "Website", icon: Globe, kind: "website" },
  { label: "Mobile App", icon: Smartphone, kind: "soon" },
  { label: "Backend APIs", icon: Server, kind: "app" },
  { label: "Admin Dashboard", icon: LayoutDashboard, kind: "app" },
  { label: "Complete SaaS", icon: Boxes, kind: "app" },
];

const MENU = [
  { label: "Website Builder", live: true },
  { label: "Mobile App Builder", live: false },
  { label: "API Builder", live: true, note: "via App Builder" },
  { label: "CRM Builder", live: false },
  { label: "Deployment Center", live: true, note: "with every build" },
];

const EXAMPLES = {
  website: ["Build me a salon website", "A website for my dental clinic in Pune", "Portfolio website for a wedding photographer"],
  app: ["Create a clinic management system", "Inventory & billing app for my pharmacy", "Gym membership management system"],
};

export default function MiraAIStudio() {
  const PUBLIC = useMemo(() => axios.create({ baseURL: `${BACKEND_URL}/api/public` }), []);
  const [token, setToken] = useState(() => localStorage.getItem("mira_studio_token") || "");
  const [me, setMe] = useState(null);
  const AUTHED = useMemo(() => axios.create({
    baseURL: `${BACKEND_URL}/api`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }), [token]);
  const [kind, setKind] = useState("website");
  const [prompt, setPrompt] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState("register");
  const [authForm, setAuthForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [authBusy, setAuthBusy] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [plans, setPlans] = useState({ plans: [], payments_enabled: false });
  const [buying, setBuying] = useState("");
  const [project, setProject] = useState(null);
  const [starting, setStarting] = useState(false);
  const [refine, setRefine] = useState("");
  const [refining, setRefining] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const pollRef = useRef(null);
  const COSTS = me?.costs || { website: 20, app: 30, refine: 5 };

  useEffect(() => { document.title = "Mira AI Studio — build with a prompt ✦"; }, []);
  useEffect(() => { PUBLIC.get("/mira-studio/plans").then(r => setPlans(r.data)).catch(() => {}); }, [PUBLIC]);
  useEffect(() => {
    if (!token) { setMe(null); return; }
    AUTHED.get("/mira-studio/me").then(r => setMe(r.data)).catch(() => {
      localStorage.removeItem("mira_studio_token"); setToken("");
    });
  }, [token, AUTHED]);

  const setSession = (data) => {
    localStorage.setItem("mira_studio_token", data.token);
    setToken(data.token);
    setMe({ user: data.user, costs: data.costs });
  };
  const logout = () => { localStorage.removeItem("mira_studio_token"); setToken(""); setProject(null); };
  const setCredits = (credits) => setMe(m => (m ? { ...m, user: { ...m.user, credits } } : m));

  const doAuth = async () => {
    setAuthBusy(true);
    try {
      if (authTab === "register") {
        const { data } = await PUBLIC.post("/mira-studio/register", authForm);
        setSession(data);
        toast.success(`Welcome ${data.user.name}! ${data.user.credits} free credits added ✦`);
      } else {
        const { data } = await PUBLIC.post("/mira-studio/login", { email: authForm.email, password: authForm.password });
        setSession(data);
        toast.success(`Welcome back, ${data.user.name} ✦`);
      }
      setAuthOpen(false);
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Check your details and try again");
    } finally { setAuthBusy(false); }
  };

  useEffect(() => {
    if (!project?.id || !["building", "refining"].includes(project.status)) return undefined;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await PUBLIC.get(`/mira-builder/status/${project.id}`);
        setProject(p => ({ ...p, ...data }));
        if (!["building", "refining"].includes(data.status)) {
          clearInterval(pollRef.current);
          if (data.status === "failed") toast.error(`${data.error || "Build failed"} — credits refunded`);
          if (data.status === "live") { toast.success("Your website is LIVE ✦"); setIframeKey(k => k + 1); }
          if (data.status === "code_ready") toast.success("Your project code is ready ✦");
        }
      } catch { /* keep polling */ }
    }, 2500);
    return () => clearInterval(pollRef.current);
  }, [project?.id, project?.status, PUBLIC]);

  const pickChip = (c) => {
    if (c.kind === "soon") { toast("📱 Mobile App Builder is coming soon — Website & App builders are live today!"); return; }
    setKind(c.kind);
  };

  const start = async () => {
    if (prompt.trim().length < 8) { toast.error("Describe what you want to build (a sentence is enough)"); return; }
    if (!token || !me) { setAuthTab("register"); setAuthOpen(true); return; }
    if ((me.user?.credits ?? 0) < COSTS[kind]) { setBuyOpen(true); return; }
    setStarting(true);
    try {
      const { data } = await AUTHED.post("/public/mira-builder/start", { kind, prompt: prompt.trim() });
      setCredits(data.credits);
      setProject({ id: data.project_id, kind, status: "building", pipeline: data.steps.map(s => ({ agent: s, status: "pending", note: "" })) });
    } catch (e) {
      if (e.response?.status === 402) { setBuyOpen(true); return; }
      if (e.response?.status === 401) { setAuthTab("login"); setAuthOpen(true); return; }
      toast.error(e.response?.data?.detail || "Couldn't start the build — try again");
    } finally { setStarting(false); }
  };

  const loadRazorpay = () => new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

  const buy = async (planKey) => {
    setBuying(planKey);
    try {
      if (!(await loadRazorpay())) { toast.error("Couldn't load the payment window — check your connection"); return; }
      const { data } = await AUTHED.post("/mira-studio/buy", { plan: planKey });
      const rzp = new window.Razorpay({
        key: data.key_id, order_id: data.order_id, amount: data.amount, currency: data.currency,
        name: "Mira AI Studio", description: `${data.credits} build credits · ${data.plan_label}`,
        prefill: { name: data.name, email: data.email },
        theme: { color: "#fbbf24" },
        handler: async (resp) => {
          try {
            const v = await AUTHED.post("/mira-studio/buy/verify", resp);
            setCredits(v.data.credits);
            setBuyOpen(false);
            toast.success(`${v.data.credits_added} credits added ✦ Happy building!`);
          } catch { toast.error("Payment received but verification failed — contact us, we'll fix it"); }
        },
      });
      rzp.open();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't create the order — try again");
    } finally { setBuying(""); }
  };

  const doRefine = async () => {
    if (refine.trim().length < 3) return;
    setRefining(true);
    try {
      const { data } = await AUTHED.post("/public/mira-builder/refine", { project_id: project.id, prompt: refine.trim() });
      setCredits(data.credits);
      toast.success(`Updated ✦ ${data.refines_left} refinements left`);
      setRefine("");
      setIframeKey(k => k + 1);
    } catch (e) {
      if (e.response?.status === 402) { setBuyOpen(true); return; }
      toast.error(e.response?.data?.detail || "Couldn't apply that change");
    } finally { setRefining(false); }
  };

  const liveUrl = project?.live_path ? `${BACKEND_URL}${project.live_path}` : "";
  const busy = ["building", "refining"].includes(project?.status);

  return (
    <div className="min-h-screen bg-[#100e14] text-white" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-[#100e14]/85 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <a href="/" className="flex items-center gap-2 shrink-0">
            <Scissors className="w-5 h-5 text-amber-300" />
            <span className="font-playfair text-lg tracking-wide">Miracurl <span className="text-amber-300">Suite</span></span>
          </a>
          <div className="h-5 w-px bg-white/15" />
          <span className="flex items-center gap-1.5 text-sm text-fuchsia-300 font-semibold"><Sparkles className="w-4 h-4" /> Mira AI Studio</span>
          <nav className="ml-auto flex items-center gap-1 sm:gap-3 text-xs sm:text-sm">
            <a href="/" className="hidden sm:block px-3 py-1.5 rounded-full text-white/60 hover:text-white transition" data-testid="studio-nav-salon-suite">Salon Suite</a>
            <button onClick={() => toast("🛍️ Marketplace is coming soon!")} className="hidden sm:flex px-3 py-1.5 rounded-full text-white/60 hover:text-white transition items-center gap-1.5" data-testid="studio-nav-marketplace"><Store className="w-3.5 h-3.5" /> Marketplace</button>
            {me ? (
              <>
                <button onClick={() => setBuyOpen(true)} data-testid="studio-credits-badge"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-300/15 border border-amber-300/40 text-amber-300 font-semibold hover:bg-amber-300/25 transition">
                  ✦ {me.user.credits} credits
                </button>
                <span className="hidden sm:block text-white/50 max-w-[110px] truncate">{me.user.name}</span>
                <button onClick={logout} data-testid="studio-logout-btn" className="px-2.5 py-1.5 rounded-full text-white/40 hover:text-white transition">Logout</button>
              </>
            ) : (
              <button onClick={() => { setAuthTab("login"); setAuthOpen(true); }} data-testid="studio-login-btn"
                className="px-4 py-1.5 rounded-full bg-amber-300 text-black font-semibold hover:brightness-110 transition">Login / Register</button>
            )}
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid lg:grid-cols-[230px_1fr] gap-8">
        {/* Builder menu */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-1">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/35 px-3 mb-2">Mira AI Studio</div>
            {MENU.map(m => (
              <div key={m.label} data-testid={`studio-menu-${m.label.replace(/\s+/g, "-").toLowerCase()}`}
                className={`px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 ${m.live ? "text-white bg-white/[0.06] border border-white/10" : "text-white/35"}`}>
                {m.live ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" /> : <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0" />}
                <span className="flex-1">{m.label}</span>
                {!m.live && <span className="text-[9px] uppercase tracking-wider bg-white/10 px-1.5 py-0.5 rounded">Soon</span>}
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 space-y-8">
          {!project && (
            <>
              {/* Hero */}
              <section className="pt-6">
                <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-fuchsia-300/80 mb-4">
                  <Sparkles className="w-3.5 h-3.5" /> Prompt → Live product
                </div>
                <h1 className="font-playfair text-4xl sm:text-5xl leading-tight">
                  What would you like to <span className="text-amber-300">build</span> today?
                </h1>
                <p className="text-white/50 mt-3 max-w-xl text-sm sm:text-base">
                  Describe it in one sentence. Mira's agent team plans, designs, codes, tests and deploys it — websites go live instantly, apps arrive as ready-to-run code.
                </p>
              </section>

              {/* Build chips */}
              <div className="flex flex-wrap gap-2.5" data-testid="studio-build-chips">
                {BUILD_CHIPS.map(c => {
                  const active = c.kind === kind;
                  return (
                    <button key={c.label} onClick={() => pickChip(c)} data-testid={`studio-chip-${c.label.replace(/\s+/g, "-").toLowerCase()}`}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm border transition ${active ? "bg-amber-300 text-black border-amber-300 font-semibold" : "bg-white/[0.04] border-white/12 text-white/70 hover:border-amber-300/50 hover:text-white"}`}>
                      <c.icon className="w-4 h-4" /> {c.label}
                      {c.kind === "soon" && <span className="text-[9px] uppercase bg-black/20 px-1.5 py-0.5 rounded">Soon</span>}
                    </button>
                  );
                })}
              </div>

              {/* Prompt box */}
              <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4 sm:p-5">
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} data-testid="studio-prompt-input"
                  placeholder={kind === "website" ? 'e.g. "Build me a salon website"' : 'e.g. "Create a clinic management system"'}
                  className="w-full bg-transparent resize-none focus:outline-none text-base placeholder:text-white/25" />
                <div className="flex items-center justify-between gap-3 flex-wrap mt-2">
                  <div className="flex gap-2 flex-wrap">
                    {EXAMPLES[kind].map(ex => (
                      <button key={ex} onClick={() => setPrompt(ex)} className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-white/50 hover:text-white/80 transition">{ex}</button>
                    ))}
                  </div>
                  <button onClick={start} disabled={starting} data-testid="studio-build-btn"
                    className="flex items-center gap-2 bg-gradient-to-r from-amber-300 to-amber-400 text-black font-bold px-6 py-2.5 rounded-full hover:brightness-110 disabled:opacity-60 transition shadow-[0_0_28px_rgba(251,191,36,0.25)]">
                    {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {starting ? "Waking Mira's agents…" : <>Build with Mira ✦ <span className="text-[11px] font-semibold opacity-70">· {COSTS[kind]} credits</span></>}
                  </button>
                </div>
              </div>

              {/* What you get + architecture */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm"><Globe className="w-4 h-4" /> Website Builder</div>
                  <ul className="text-sm text-white/55 mt-3 space-y-1.5">
                    <li>✅ Complete website, designed & written by AI</li>
                    <li>✅ Instantly LIVE at a real URL</li>
                    <li>✅ Refine with prompts — "make it dark blue"</li>
                    <li>✅ Download the code, host anywhere</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center gap-2 text-fuchsia-300 font-semibold text-sm"><FileCode2 className="w-4 h-4" /> Business App Builder</div>
                  <ul className="text-sm text-white/55 mt-3 space-y-1.5">
                    <li>✅ Backend APIs (FastAPI) + JWT login</li>
                    <li>✅ React admin panel</li>
                    <li>✅ PostgreSQL schema</li>
                    <li>✅ Docker deployment — one command</li>
                  </ul>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 overflow-x-auto">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/35 mb-3">How Mira builds</div>
                <div className="flex items-center gap-2 text-xs whitespace-nowrap text-white/60">
                  {["Your prompt", "Planner Agent", "Frontend · Backend · Database Agents", "Testing Agent", "Deployment Agent", "Live URL ✦"].map((s, i, arr) => (
                    <span key={s} className="flex items-center gap-2">
                      <span className={`px-3 py-1.5 rounded-full border ${i === arr.length - 1 ? "border-amber-300/60 text-amber-300" : "border-white/12 bg-white/[0.04]"}`}>{s}</span>
                      {i < arr.length - 1 && <span className="text-white/25">→</span>}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Pipeline + result */}
          {project && (
            <section className="pt-4 space-y-6" data-testid="studio-pipeline">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-playfair text-3xl">{project.name || (busy ? "Mira is building…" : "Your build")}</h2>
                  <p className="text-white/45 text-sm mt-1 max-w-xl truncate">"{prompt}"</p>
                </div>
                <button onClick={() => { setProject(null); setPrompt(""); }} data-testid="studio-new-build-btn"
                  className="text-xs px-4 py-2 rounded-full border border-white/15 text-white/60 hover:text-white transition">＋ New build</button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                {(project.pipeline || []).map((s) => (
                  <div key={s.agent} className="flex items-start gap-3" data-testid={`studio-step-${s.agent.replace(/\s+/g, "-").toLowerCase()}`}>
                    {s.status === "done" ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      : s.status === "running" ? <Loader2 className="w-5 h-5 text-amber-300 animate-spin shrink-0" />
                        : <Circle className="w-5 h-5 text-white/20 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${s.status === "pending" ? "text-white/35" : ""}`}>{s.agent}</div>
                      {s.note && <div className="text-xs text-white/45 mt-0.5">{s.note}</div>}
                    </div>
                  </div>
                ))}
                {project.status === "failed" && (
                  <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-400/30 rounded-xl px-4 py-3" data-testid="studio-error">
                    Build failed — {project.error || "please try again"}.
                  </div>
                )}
              </div>

              {project.status === "live" && (
                <div className="space-y-4" data-testid="studio-website-result">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a href={liveUrl} target="_blank" rel="noreferrer" data-testid="studio-live-url"
                      className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-sm px-4 py-2 rounded-full hover:bg-emerald-500/25 transition">
                      <Rocket className="w-4 h-4" /> {liveUrl.replace(/^https?:\/\//, "")} <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => { navigator.clipboard.writeText(liveUrl); toast.success("Live URL copied"); }} className="text-xs px-3 py-2 rounded-full border border-white/15 text-white/60 hover:text-white">Copy link</button>
                    <a href={`${BACKEND_URL}/api/public/mira-builder/download/${project.id}`} data-testid="studio-download-btn"
                      className="flex items-center gap-2 text-xs px-4 py-2 rounded-full border border-amber-300/50 text-amber-300 hover:bg-amber-300/10 transition">
                      <Download className="w-3.5 h-3.5" /> Download code
                    </a>
                  </div>
                  <div className="rounded-2xl overflow-hidden border border-white/12 bg-white">
                    <iframe key={iframeKey} src={liveUrl} title="Website preview" className="w-full h-[560px]" data-testid="studio-preview-iframe" />
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4 flex items-center gap-3 flex-wrap">
                    <Wand2 className="w-4 h-4 text-fuchsia-300 shrink-0" />
                    <input value={refine} onChange={e => setRefine(e.target.value)} onKeyDown={e => e.key === "Enter" && doRefine()}
                      placeholder='Refine it — "make the hero dark blue", "add a pricing section"…' data-testid="studio-refine-input"
                      className="flex-1 min-w-[220px] bg-transparent focus:outline-none text-sm placeholder:text-white/25" />
                    <button onClick={doRefine} disabled={refining} data-testid="studio-refine-btn"
                      className="text-xs px-4 py-2 rounded-full bg-fuchsia-400/90 text-black font-semibold hover:brightness-110 disabled:opacity-50 transition">
                      {refining ? "Applying…" : "Apply ✦"}
                    </button>
                  </div>
                </div>
              )}

              {project.status === "code_ready" && (
                <div className="space-y-4" data-testid="studio-app-result">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-white/35 mb-3">Generated project</div>
                    <div className="space-y-1.5">
                      {(project.files || []).map(f => (
                        <div key={f.path} className="flex items-center gap-2 text-sm text-white/70 font-mono">
                          <FileCode2 className="w-3.5 h-3.5 text-fuchsia-300 shrink-0" /> {f.path}
                          <span className="text-[10px] text-white/30 ml-auto">{(f.size / 1024).toFixed(1)} KB</span>
                        </div>
                      ))}
                    </div>
                    <a href={`${BACKEND_URL}/api/public/mira-builder/download/${project.id}`} data-testid="studio-download-btn"
                      className="mt-5 inline-flex items-center gap-2 bg-gradient-to-r from-amber-300 to-amber-400 text-black font-bold px-6 py-2.5 rounded-full hover:brightness-110 transition">
                      <Download className="w-4 h-4" /> Download project ZIP
                    </a>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5" data-testid="studio-deployment-center">
                    <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm mb-3"><Rocket className="w-4 h-4" /> Deployment Center</div>
                    <pre className="text-xs text-emerald-300/90 bg-black/40 rounded-xl p-4 overflow-x-auto">{`unzip ${(project.name || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.zip && cd project
docker compose up --build
# API    → http://localhost:8000/docs
# Admin  → http://localhost:3000`}</pre>
                    <p className="text-xs text-white/40 mt-3">Everything's included — PostgreSQL schema, FastAPI backend with JWT login, React admin and Docker files.</p>
                  </div>
                </div>
              )}
            </section>
          )}

          <footer className="pt-8 pb-4 text-center text-[11px] text-white/30">
            Mira AI Studio · part of <a href="/" className="text-amber-300/70 hover:text-amber-300">Miracurl Suite</a> · websites & apps, born from a prompt ✦
          </footer>
        </main>
      </div>

      {/* Auth modal — login / register (50 free credits) */}
      {authOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={() => setAuthOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#17141c] p-6" onClick={e => e.stopPropagation()} data-testid="studio-auth-modal">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-playfair text-2xl">{authTab === "register" ? "Create your account ✦" : "Welcome back ✦"}</h3>
              <button onClick={() => setAuthOpen(false)} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-amber-300/90 text-sm mb-4">{authTab === "register" ? `Get ${plans.free_credits ?? 50} build credits FREE on signup` : "Log in to keep building"}</p>
            <div className="flex rounded-full bg-white/5 border border-white/10 p-1 mb-5 text-xs font-semibold">
              {["register", "login"].map(t => (
                <button key={t} onClick={() => setAuthTab(t)} data-testid={`studio-auth-tab-${t}`}
                  className={`flex-1 py-2 rounded-full transition ${authTab === t ? "bg-amber-300 text-black" : "text-white/50"}`}>
                  {t === "register" ? "Register" : "Login"}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {authTab === "register" && (
                <>
                  <input value={authForm.name} onChange={e => setAuthForm({ ...authForm, name: e.target.value })} placeholder="Your name *" data-testid="studio-auth-name"
                    className="w-full bg-white/[0.05] border border-white/12 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-300/50 placeholder:text-white/25" />
                  <input value={authForm.phone} onChange={e => setAuthForm({ ...authForm, phone: e.target.value })} placeholder="Phone (10 digits) *" inputMode="numeric" data-testid="studio-auth-phone"
                    className="w-full bg-white/[0.05] border border-white/12 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-300/50 placeholder:text-white/25" />
                </>
              )}
              <input value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} placeholder="Email *" type="email" data-testid="studio-auth-email"
                className="w-full bg-white/[0.05] border border-white/12 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-300/50 placeholder:text-white/25" />
              <input value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} onKeyDown={e => e.key === "Enter" && doAuth()}
                placeholder={authTab === "register" ? "Create a password (6+ chars) *" : "Password *"} type="password" data-testid="studio-auth-password"
                className="w-full bg-white/[0.05] border border-white/12 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-300/50 placeholder:text-white/25" />
              <button onClick={doAuth} disabled={authBusy} data-testid="studio-auth-submit"
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-300 to-amber-400 text-black font-bold px-6 py-3 rounded-xl hover:brightness-110 disabled:opacity-60 transition">
                {authBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {authTab === "register" ? `Register & claim ${plans.free_credits ?? 50} credits ✦` : "Login ✦"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Buy credits modal */}
      {buyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={() => setBuyOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-white/12 bg-[#17141c] p-6" onClick={e => e.stopPropagation()} data-testid="studio-buy-modal">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-playfair text-2xl">Top up credits ✦</h3>
              <button onClick={() => setBuyOpen(false)} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-white/45 text-sm mb-5">
              Website build · {COSTS.website} credits &nbsp;·&nbsp; App build · {COSTS.app} credits &nbsp;·&nbsp; Refine · {COSTS.refine} credits
            </p>
            <div className="grid sm:grid-cols-3 gap-3">
              {(plans.plans || []).map(p => (
                <div key={p.key} className={`rounded-2xl border p-4 text-center ${p.key === "plan_200" ? "border-amber-300/60 bg-amber-300/[0.06]" : "border-white/12 bg-white/[0.03]"}`}>
                  {p.key === "plan_200" && <div className="text-[9px] uppercase tracking-widest text-amber-300 mb-1">Most popular</div>}
                  <div className="font-playfair text-3xl text-amber-300">{p.credits}</div>
                  <div className="text-[10px] uppercase tracking-widest text-white/40">credits</div>
                  <div className="text-lg font-bold mt-2">₹{p.price}</div>
                  {p.save && <div className="text-[10px] text-emerald-300">{p.save}</div>}
                  <button onClick={() => buy(p.key)} disabled={!!buying || !plans.payments_enabled} data-testid={`studio-buy-${p.key}`}
                    className="mt-3 w-full text-xs font-bold py-2.5 rounded-full bg-amber-300 text-black hover:brightness-110 disabled:opacity-50 transition">
                    {buying === p.key ? "Opening…" : "Buy now"}
                  </button>
                </div>
              ))}
            </div>
            {!plans.payments_enabled && <p className="text-xs text-rose-300 mt-4">Payments are being set up — contact us to top up manually.</p>}
            <p className="text-[10px] text-white/30 mt-4 text-center">Secure payments by Razorpay · credits never expire · failed builds are auto-refunded</p>
          </div>
        </div>
      )}
    </div>
  );
}
