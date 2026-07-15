import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Sparkles, Globe, Smartphone, Server, LayoutDashboard, Boxes, Rocket,
  Download, ExternalLink, Wand2, X, CheckCircle2, Loader2, Store, Scissors, FileCode2,
  ArrowRight, Zap, ShieldCheck, Palette, Code2, Copy,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const GOLD = "#D4AF37";
const GRADIENT = "linear-gradient(135deg, #D81B60 0%, #FF4081 45%, #D4AF37 100%)";
const HERO_BG = "https://images.unsplash.com/photo-1617351165725-ec1c8ca2bf67?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1Mjh8MHwxfHNlYXJjaHwzfHxkYXJrJTIwbHV4dXJ5JTIwc2Fsb24lMjBpbnRlcmlvcnxlbnwwfHx8fDE3ODQxMDI1Njl8MA&ixlib=rb-4.1.0&q=85";

const BUILD_CHIPS = [
  { label: "Website", icon: Globe, kind: "website" },
  { label: "Mobile App", icon: Smartphone, kind: "soon" },
  { label: "Backend APIs", icon: Server, kind: "app" },
  { label: "Admin Dashboard", icon: LayoutDashboard, kind: "app" },
  { label: "Complete SaaS", icon: Boxes, kind: "app" },
];

const MENU = [
  { label: "Website Builder", icon: Globe, live: true, desc: "Prompt → live URL in ~60s" },
  { label: "Mobile App Builder", icon: Smartphone, live: false, desc: "Native-feel PWAs" },
  { label: "API Builder", icon: Server, live: true, desc: "FastAPI + JWT, via App Builder" },
  { label: "CRM Builder", icon: LayoutDashboard, live: false, desc: "Pipelines & contacts" },
  { label: "Deployment Center", icon: Rocket, live: true, desc: "Docker files with every build" },
];

const EXAMPLES = {
  website: ["Build me a salon website", "A website for my dental clinic in Pune", "Portfolio website for a wedding photographer"],
  app: ["Create a clinic management system", "Inventory & billing app for my pharmacy", "Gym membership management system"],
};

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
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
  const [messages, setMessages] = useState([]);
  const pollRef = useRef(null);
  const chatEndRef = useRef(null);
  const pendingRefineRef = useRef(null);
  const fileRef = useRef(null);
  const [attachedImg, setAttachedImg] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState("");
  const [ghOpen, setGhOpen] = useState(false);
  const [ghForm, setGhForm] = useState({ token: "", repo: "", priv: true });
  const [ghBusy, setGhBusy] = useState(false);
  const promptRef = useRef(null);
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
          const pending = pendingRefineRef.current;
          if (data.status === "failed") toast.error(`${data.error || "Build failed"} — credits refunded`);
          if (data.status === "live") {
            if (pending) {
              const rr = data.refine_result;
              if (rr && rr.ok === false) {
                setMessages(m => m.map(x => x.id === pending.aid ? { ...x, state: "failed", text: rr.error } : x));
                AUTHED.get("/mira-studio/me").then(r => setMe(r.data)).catch(() => {});
              } else {
                setMessages(m => m.map(x => x.id === pending.aid ? { ...x, state: "done", text: `${pending.left} refinements left` } : x));
              }
              pendingRefineRef.current = null;
            } else {
              toast.success("Your website is LIVE ✦");
            }
            setIframeKey(k => k + 1);
          }
          if (data.status === "code_ready") toast.success("Your project code is ready ✦");
        }
      } catch { /* keep polling */ }
    }, 2500);
    return () => clearInterval(pollRef.current);
  }, [project?.id, project?.status, PUBLIC]);

  const pickChip = (c) => {
    if (c.kind === "soon") { toast("Mobile App Builder is coming soon — Website & App builders are live today!"); return; }
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
      setMessages([
        { id: Date.now(), role: "user", text: prompt.trim() },
        { id: Date.now() + 1, role: "agent", kind: "build" },
      ]);
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
        theme: { color: "#D4AF37" },
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
    if (refine.trim().length < 3 || refining) return;
    const text = refine.trim();
    const img = attachedImg;
    const promptText = img ? `${text}\n\n[The user uploaded an image — use this exact image URL where it fits the request: ${img.url}]` : text;
    const uid = Date.now(), aid = Date.now() + 1;
    setMessages(m => [...m, { id: uid, role: "user", text, attach: img?.filename }, { id: aid, role: "agent", kind: "refine", state: "working" }]);
    setRefine("");
    setAttachedImg(null);
    setRefining(true);
    try {
      const { data } = await AUTHED.post("/public/mira-builder/refine", { project_id: project.id, prompt: promptText });
      setCredits(data.credits);
      pendingRefineRef.current = { aid, left: data.refines_left };
      setProject(p => ({ ...p, status: "refining" }));
    } catch (e) {
      const err = e.response?.data?.detail || "Couldn't apply that change";
      setMessages(m => m.map(x => x.id === aid ? { ...x, state: "failed", text: err } : x));
      if (e.response?.status === 402) { setBuyOpen(true); return; }
    } finally { setRefining(false); }
  };

  useEffect(() => { const el = chatEndRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, project?.status, project?.pipeline]);

  const uploadImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await AUTHED.post("/public/mira-builder/upload-image", fd);
      setAttachedImg(data);
      toast.success("Image attached — now tell Mira where to use it");
    } catch (e) { toast.error(e.response?.data?.detail || "Upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const runAnalysis = async (kindA) => {
    if (analyzing) return;
    const uid = Date.now(), aid = uid + 1;
    setMessages(m => [...m,
      { id: uid, role: "user", text: kindA === "security" ? "Run a security check on my code" : "Run a code review on my code" },
      { id: aid, role: "agent", kind: "refine", state: "working" }]);
    setAnalyzing(kindA);
    try {
      const { data } = await AUTHED.post("/public/mira-builder/analyze", { project_id: project.id, kind: kindA });
      setMessages(m => m.map(x => x.id === aid ? { ...x, state: "report", text: data.report, title: kindA === "security" ? "Security Check 🛡" : "Code Review 📋" } : x));
    } catch (e) {
      setMessages(m => m.map(x => x.id === aid ? { ...x, state: "failed", text: e.response?.data?.detail || "Analysis failed — try again" } : x));
    } finally { setAnalyzing(""); }
  };

  const doGithubExport = async () => {
    if (!ghForm.token.trim() || !ghForm.repo.trim()) { toast.error("Token and repository name are required"); return; }
    setGhBusy(true);
    try {
      const { data } = await AUTHED.post("/public/mira-builder/github-export",
        { project_id: project.id, token: ghForm.token.trim(), repo_name: ghForm.repo.trim(), private: ghForm.priv });
      setGhOpen(false);
      setGhForm({ token: "", repo: "", priv: true });
      setMessages(m => [...m, { id: Date.now(), role: "agent", kind: "refine", state: "report", title: "Pushed to GitHub ✦", text: `${data.files_pushed.length} file(s) committed to:\n${data.repo_url}` }]);
      toast.success("Code pushed to GitHub ✦");
    } catch (e) { toast.error(e.response?.data?.detail || "GitHub push failed"); }
    finally { setGhBusy(false); }
  };

  const liveUrl = project?.live_path ? `${BACKEND_URL}${project.live_path}` : "";
  const busy = ["building", "refining"].includes(project?.status);

  const inputCls = "w-full bg-white/[0.04] border border-white/10 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-[#D4AF37]/70 focus:ring-1 focus:ring-[#D4AF37]/40 placeholder:text-white/25 transition-colors";

  return (
    <div className="min-h-screen bg-[#0A0809] text-[#FDFBF7]" style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}>

      {/* ─── Navbar ─── */}
      <header className="fixed top-0 inset-x-0 z-40 bg-[#0A0809]/70 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-[68px] flex items-center gap-4">
          <a href="/" className="flex items-center gap-2.5 shrink-0 group">
            <span className="w-9 h-9 rounded-full flex items-center justify-center border border-[#D4AF37]/40 bg-[#D4AF37]/10">
              <Scissors className="w-4 h-4 text-[#F3E5AB]" />
            </span>
            <span className="font-playfair text-lg tracking-wide leading-none">
              MIRA<span className="text-[#D4AF37]">CURL</span>
              <span className="block text-[8px] tracking-[0.35em] uppercase text-white/40 font-sans mt-0.5">AI Studio</span>
            </span>
          </a>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <a href="/" className="hidden sm:block px-4 py-2 rounded-full text-white/55 hover:text-white hover:bg-white/5 transition-colors" data-testid="studio-nav-salon-suite">Salon Suite</a>
            <button onClick={() => toast("Marketplace is coming soon!")} className="hidden sm:flex px-4 py-2 rounded-full text-white/55 hover:text-white hover:bg-white/5 transition-colors items-center gap-1.5" data-testid="studio-nav-marketplace"><Store className="w-3.5 h-3.5" /> Marketplace</button>
            {me ? (
              <>
                <button onClick={() => setBuyOpen(true)} data-testid="studio-credits-badge"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#F3E5AB] font-semibold hover:bg-[#D4AF37]/20 transition-colors">
                  ✦ {me.user.credits} <span className="hidden sm:inline">credits</span>
                </button>
                <span className="hidden md:block text-white/45 max-w-[110px] truncate">{me.user.name}</span>
                <button onClick={logout} data-testid="studio-logout-btn" className="px-3 py-2 rounded-full text-white/40 hover:text-white transition-colors">Logout</button>
              </>
            ) : (
              <button onClick={() => { setAuthTab("login"); setAuthOpen(true); }} data-testid="studio-login-btn"
                className="px-5 py-2.5 rounded-full text-white text-xs sm:text-sm font-semibold hover:opacity-90 hover:shadow-[0_0_20px_rgba(255,64,129,0.35)] transition-[opacity,box-shadow]"
                style={{ background: GRADIENT }}>
                Login / Register
              </button>
            )}
          </nav>
        </div>
      </header>

      {!project && (
        <>
          {/* ─── Hero ─── */}
          <section className="relative pt-[68px] overflow-hidden">
            <div className="absolute inset-0">
              <img src={HERO_BG} alt="" className="w-full h-full object-cover opacity-40" />
              <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 75% 90% at 50% 15%, rgba(10,8,9,0.55) 0%, rgba(10,8,9,0.92) 55%, #0A0809 100%)" }} />
            </div>

            <div className="relative max-w-4xl mx-auto px-5 sm:px-8 pt-20 sm:pt-28 pb-16 text-center">
              <motion.div {...fadeUp} className="inline-flex items-center gap-2.5 text-[10px] sm:text-[11px] uppercase tracking-[0.35em] text-[#F3E5AB] border border-[#D4AF37]/40 bg-[#D4AF37]/10 backdrop-blur-md rounded-full px-5 py-2 mb-8">
                <Sparkles className="w-3.5 h-3.5" /> Prompt → Live Product · No Code
              </motion.div>
              <motion.h1 {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}
                className="font-playfair text-4xl sm:text-6xl lg:text-7xl leading-[1.08] tracking-tight">
                What would you like to<br />
                <span style={{ background: "linear-gradient(100deg,#F3E5AB 0%,#D4AF37 40%,#FF4081 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>build</span> today?
              </motion.h1>
              <motion.p {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.2 }}
                className="text-white/55 mt-6 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
                Describe it in one sentence. Mira's agent team plans, designs, codes, tests and deploys it —
                websites go live instantly, apps arrive as ready-to-run code.
              </motion.p>

              {/* Build type selector */}
              <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.3 }}
                className="mt-10 flex flex-wrap justify-center gap-2.5" data-testid="studio-build-chips">
                {BUILD_CHIPS.map(c => {
                  const active = c.kind === kind;
                  return (
                    <button key={c.label} onClick={() => pickChip(c)} data-testid={`studio-chip-${c.label.replace(/\s+/g, "-").toLowerCase()}`}
                      className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm border backdrop-blur-md transition-colors ${active
                        ? "border-[#D4AF37] bg-[#D4AF37]/15 text-[#F3E5AB] font-semibold shadow-[0_0_24px_rgba(212,175,55,0.25)]"
                        : "bg-white/[0.04] border-white/10 text-white/60 hover:border-[#D4AF37]/50 hover:text-white"}`}>
                      <c.icon className="w-4 h-4" /> {c.label}
                      {c.kind === "soon" && <span className="text-[8px] uppercase tracking-wider bg-white/10 px-1.5 py-0.5 rounded-full">Soon</span>}
                    </button>
                  );
                })}
              </motion.div>

              {/* Prompt box */}
              <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.4 }} className="mt-8 relative">
                <div className="absolute -inset-[1px] rounded-[26px] opacity-60" style={{ background: GRADIENT, filter: "blur(1px)" }} />
                <div className="relative rounded-[25px] bg-[#0F0C0E]/90 backdrop-blur-2xl p-5 sm:p-6 text-left shadow-[0_0_50px_rgba(216,27,96,0.12)]">
                  <textarea ref={promptRef} value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} data-testid="studio-prompt-input"
                    placeholder={kind === "website" ? 'e.g. "Build me a salon website"' : 'e.g. "Create a clinic management system"'}
                    className="w-full bg-transparent resize-none focus:outline-none text-base sm:text-lg placeholder:text-white/25" />
                  <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
                    <div className="flex gap-2 flex-wrap">
                      {EXAMPLES[kind].map(ex => (
                        <button key={ex} onClick={() => setPrompt(ex)}
                          className="text-[11px] px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition-colors">
                          {ex}
                        </button>
                      ))}
                    </div>
                    <button onClick={start} disabled={starting} data-testid="studio-build-btn"
                      className="flex items-center gap-2 text-white font-semibold px-7 py-3 rounded-full hover:opacity-90 hover:shadow-[0_0_30px_rgba(255,64,129,0.45)] disabled:opacity-60 transition-[opacity,box-shadow]"
                      style={{ background: GRADIENT }}>
                      {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      {starting ? "Waking Mira's agents…" : <>Build with Mira ✦ <span className="text-[11px] font-medium opacity-75">· {COSTS[kind]} credits</span></>}
                    </button>
                  </div>
                </div>
              </motion.div>

              <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.5 }}
                className="mt-8 flex items-center justify-center gap-x-6 gap-y-2 flex-wrap text-[11px] text-white/40">
                <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-[#D4AF37]" /> Live in ~60 seconds</span>
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" /> {plans.free_credits ?? 50} free credits on signup</span>
                <span className="flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5 text-[#D4AF37]" /> Full code ownership</span>
              </motion.div>
            </div>
          </section>

          {/* ─── Bento features ─── */}
          <section className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
            <div className="text-[10px] uppercase tracking-[0.35em] text-white/35 mb-3">The Studio</div>
            <h2 className="font-playfair text-3xl sm:text-4xl mb-10">Two builders. <span className="text-[#D4AF37]">Infinite products.</span></h2>

            <div className="grid md:grid-cols-12 gap-5">
              {/* Website builder — wide */}
              <div className="md:col-span-7 rounded-3xl border border-white/[0.07] bg-[#141012] p-7 sm:p-9 relative overflow-hidden group">
                <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-500" style={{ background: GOLD }} />
                <div className="flex items-center gap-3 mb-5">
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[#D4AF37]/10 border border-[#D4AF37]/30"><Globe className="w-5 h-5 text-[#F3E5AB]" /></span>
                  <div>
                    <div className="font-playfair text-xl">Website Builder</div>
                    <div className="text-[11px] text-white/40 uppercase tracking-wider">{COSTS.website} credits per build</div>
                  </div>
                </div>
                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm text-white/60">
                  {["Complete website, designed & written by AI", "Instantly LIVE at a real URL", 'Refine with prompts — "make it dark blue"', "Download the code, host anywhere"].map(f => (
                    <li key={f} className="flex items-start gap-2.5"><CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" /> {f}</li>
                  ))}
                </ul>
              </div>

              {/* App builder — narrow */}
              <div className="md:col-span-5 rounded-3xl border border-white/[0.07] bg-[#141012] p-7 sm:p-9 relative overflow-hidden group">
                <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-500" style={{ background: "#FF4081" }} />
                <div className="flex items-center gap-3 mb-5">
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[#FF4081]/10 border border-[#FF4081]/30"><FileCode2 className="w-5 h-5 text-[#FF4081]" /></span>
                  <div>
                    <div className="font-playfair text-xl">Business App Builder</div>
                    <div className="text-[11px] text-white/40 uppercase tracking-wider">{COSTS.app} credits per build</div>
                  </div>
                </div>
                <ul className="space-y-3 text-sm text-white/60">
                  {["Backend APIs (FastAPI) + JWT login", "React admin panel", "PostgreSQL schema", "Docker deployment — one command"].map(f => (
                    <li key={f} className="flex items-start gap-2.5"><CheckCircle2 className="w-4 h-4 text-[#FF4081] shrink-0 mt-0.5" /> {f}</li>
                  ))}
                </ul>
              </div>

              {/* Pipeline — full width */}
              <div className="md:col-span-12 rounded-3xl border border-white/[0.07] bg-[#141012] p-7 sm:p-9 overflow-x-auto">
                <div className="text-[10px] uppercase tracking-[0.35em] text-white/35 mb-6">How Mira Builds</div>
                <div className="flex items-center gap-3 text-xs whitespace-nowrap">
                  {["Your prompt", "Planner Agent", "Design Agent", "Frontend · Backend Agents", "Testing Agent", "Deployment Agent", "Live URL ✦"].map((s, i, arr) => (
                    <span key={s} className="flex items-center gap-3">
                      <span className={`px-4 py-2 rounded-full border ${i === arr.length - 1
                        ? "border-[#D4AF37]/70 text-[#F3E5AB] bg-[#D4AF37]/10 shadow-[0_0_18px_rgba(212,175,55,0.25)] font-semibold"
                        : i === 0 ? "border-[#FF4081]/50 text-[#FF4081]/90 bg-[#FF4081]/5"
                          : "border-white/10 bg-white/[0.03] text-white/55"}`}>{s}</span>
                      {i < arr.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-white/25 shrink-0" />}
                    </span>
                  ))}
                </div>
              </div>

            </div>

            {/* Studio tools */}
            <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-5">
              {MENU.map(m => (
                <div key={m.label} data-testid={`studio-menu-${m.label.replace(/\s+/g, "-").toLowerCase()}`}
                  className={`rounded-2xl border p-5 ${m.live ? "border-white/[0.09] bg-white/[0.03]" : "border-white/[0.05] bg-transparent opacity-60"}`}>
                  <m.icon className={`w-5 h-5 mb-3 ${m.live ? "text-[#D4AF37]" : "text-white/30"}`} />
                  <div className="text-sm font-medium flex items-center gap-2">
                    {m.label}
                    {m.live
                      ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      : <span className="text-[8px] uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded-full text-white/50">Soon</span>}
                  </div>
                  <div className="text-[11px] text-white/35 mt-1">{m.desc}</div>
                </div>
              ))}
            </div>
          </section>

          {/* ─── Pricing strip ─── */}
          <section className="max-w-7xl mx-auto px-5 sm:px-8 pb-24">
            <div className="rounded-3xl border border-[#D4AF37]/25 relative overflow-hidden p-8 sm:p-12 text-center"
              style={{ background: "radial-gradient(ellipse 60% 120% at 50% 0%, rgba(212,175,55,0.10) 0%, #141012 65%)" }}>
              <div className="font-playfair text-2xl sm:text-3xl">Start with <span className="text-[#D4AF37]">{plans.free_credits ?? 50} free credits</span> — no card needed</div>
              <p className="text-white/45 text-sm mt-3 max-w-md mx-auto">That's enough for your first two websites. Top up anytime, credits never expire, failed builds auto-refund.</p>
              <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
                <button onClick={() => { setAuthTab("register"); setAuthOpen(true); }} data-testid="studio-cta-register"
                  className="px-8 py-3 rounded-full text-white font-semibold hover:opacity-90 hover:shadow-[0_0_28px_rgba(255,64,129,0.4)] transition-[opacity,box-shadow]" style={{ background: GRADIENT }}>
                  Claim free credits ✦
                </button>
                <button onClick={() => setBuyOpen(true)} data-testid="studio-cta-pricing"
                  className="px-8 py-3 rounded-full border border-white/15 text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                  View credit packs
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ─── Workspace: chat + live preview ─── */}
      {project && (
        <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-[68px]">
          <section className="pt-10 pb-16 space-y-6" data-testid="studio-pipeline">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[10px] uppercase tracking-[0.35em] text-[#D4AF37]/80 mb-2 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" /> {busy ? "Agent is working…" : "Agent is finished ✦"}
                </div>
                <h2 className="font-playfair text-3xl sm:text-4xl">{project.name || (busy ? "Mira is building…" : "Your build")}</h2>
              </div>
              <button onClick={() => { setProject(null); setPrompt(""); setMessages([]); }} data-testid="studio-new-build-btn"
                className="text-xs px-5 py-2.5 rounded-full border border-white/15 text-white/60 hover:text-white hover:bg-white/5 transition-colors">＋ New build</button>
            </div>

            <div className="grid lg:grid-cols-[400px_1fr] gap-6 items-start">
              {/* Chat panel */}
              <div className="rounded-3xl border border-white/[0.08] bg-[#100D0F] flex flex-col h-[620px] overflow-hidden" data-testid="studio-chat-panel">
                <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3 shrink-0">
                  <span className="relative w-9 h-9 rounded-full flex items-center justify-center border border-[#D4AF37]/40 bg-[#D4AF37]/10">
                    <Sparkles className="w-4 h-4 text-[#F3E5AB]" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#100D0F]" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">Mira Agent ✦</div>
                    <div className="text-[10px] text-white/40">{busy ? "working on your request…" : "online — ask for any change"}</div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
                  {messages.map(m => {
                    if (m.role === "user") return (
                      <div key={m.id} className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 text-sm text-white" style={{ background: GRADIENT }}>
                          {m.text}
                          {m.attach && <div className="mt-1.5 text-[10px] bg-black/25 rounded-full px-2.5 py-1 inline-flex items-center gap-1">📎 {m.attach}</div>}
                        </div>
                      </div>
                    );
                    if (m.kind === "build") {
                      if (busy) return (
                        <div key={m.id} className="flex gap-3" data-testid="studio-agent-working">
                          <Sparkles className="w-5 h-5 text-[#D4AF37] shrink-0 mt-2" />
                          <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 bg-white/[0.05] border border-white/[0.07]">
                            <div className="flex items-center gap-2 text-sm text-[#F3E5AB]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Agent is working…</div>
                            <div className="text-xs text-white/40 mt-1.5">
                              {(project.pipeline || []).find(s => s.status === "running")?.agent || "Getting started"}
                              {(() => { const s = (project.pipeline || []).find(x => x.status === "running"); return s?.note ? ` — ${s.note}` : ""; })()}
                            </div>
                          </div>
                        </div>
                      );
                      if (project.status === "failed") return (
                        <div key={m.id} className="flex gap-3" data-testid="studio-error">
                          <Sparkles className="w-5 h-5 text-rose-400 shrink-0 mt-2" />
                          <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 bg-rose-500/10 border border-rose-400/30 text-sm text-rose-300">
                            Build failed — {project.error || "please try again"}. Your credits were refunded.
                          </div>
                        </div>
                      );
                      return (
                        <div key={m.id} className="flex gap-3" data-testid="studio-agent-finished">
                          <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-2" />
                          <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 bg-emerald-500/[0.07] border border-emerald-400/25">
                            <div className="flex items-center gap-2 text-sm text-emerald-300 font-medium"><CheckCircle2 className="w-4 h-4" /> Agent is finished ✦</div>
                            <div className="text-xs text-white/55 mt-1.5">
                              {project.status === "live"
                                ? "Your website is LIVE — see the preview. Ask me for any change below."
                                : "Your project code is ready — download the ZIP from the panel."}
                            </div>
                            {project.status === "live" && (
                              <a href={liveUrl} target="_blank" rel="noreferrer" data-testid="studio-live-url"
                                className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-emerald-300 border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 rounded-full hover:bg-emerald-500/20 transition-colors">
                                <Rocket className="w-3 h-3" /> {liveUrl.replace(/^https?:\/\//, "").slice(0, 38)}… <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              <button onClick={() => runAnalysis("security")} disabled={!!analyzing} data-testid="studio-security-check-btn"
                                className="text-[10px] px-3 py-1.5 rounded-full border border-white/15 text-white/65 hover:text-white hover:bg-white/5 disabled:opacity-40 transition-colors">🛡 Security check</button>
                              <button onClick={() => runAnalysis("review")} disabled={!!analyzing} data-testid="studio-code-review-btn"
                                className="text-[10px] px-3 py-1.5 rounded-full border border-white/15 text-white/65 hover:text-white hover:bg-white/5 disabled:opacity-40 transition-colors">📋 Code review</button>
                              <button onClick={() => { setGhForm(f => ({ ...f, repo: (project.name || "my-site").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) })); setGhOpen(true); }} data-testid="studio-github-btn"
                                className="text-[10px] px-3 py-1.5 rounded-full border border-white/15 text-white/65 hover:text-white hover:bg-white/5 transition-colors">
                                <svg viewBox="0 0 16 16" className="w-3 h-3 inline mr-1 -mt-0.5" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                                Push to GitHub</button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    // refine / analysis message
                    if (m.state === "report") return (
                      <div key={m.id} className="flex gap-3" data-testid="studio-agent-report">
                        <Sparkles className="w-5 h-5 text-[#D4AF37] shrink-0 mt-2" />
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 bg-white/[0.05] border border-[#D4AF37]/25">
                          <div className="text-sm font-semibold text-[#F3E5AB] mb-1.5">{m.title}</div>
                          <div className="text-xs text-white/65 whitespace-pre-wrap leading-relaxed break-words">{m.text}</div>
                        </div>
                      </div>
                    );
                    return (
                      <div key={m.id} className="flex gap-3" data-testid={m.state === "working" ? "studio-agent-working" : "studio-agent-finished"}>
                        <Sparkles className={`w-5 h-5 shrink-0 mt-2 ${m.state === "failed" ? "text-rose-400" : m.state === "done" ? "text-emerald-400" : "text-[#D4AF37]"}`} />
                        <div className={`max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 text-sm border ${m.state === "failed"
                          ? "bg-rose-500/10 border-rose-400/30 text-rose-300"
                          : m.state === "done" ? "bg-emerald-500/[0.07] border-emerald-400/25"
                            : "bg-white/[0.05] border-white/[0.07]"}`}>
                          {m.state === "working" && <span className="flex items-center gap-2 text-[#F3E5AB]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Agent is working…</span>}
                          {m.state === "done" && (
                            <>
                              <span className="flex items-center gap-2 text-emerald-300 font-medium"><CheckCircle2 className="w-4 h-4" /> Agent is finished ✦</span>
                              <span className="block text-xs text-white/50 mt-1">Change applied — preview updated. {m.text}</span>
                            </>
                          )}
                          {m.state === "failed" && <>{m.text} — credits refunded.</>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 border-t border-white/[0.06] shrink-0">
                  {attachedImg && (
                    <div className="mb-2 flex items-center gap-2 text-[11px] text-[#F3E5AB] bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-full px-3 py-1.5 w-fit" data-testid="studio-attached-chip">
                      📎 {attachedImg.filename}
                      <button onClick={() => setAttachedImg(null)} className="text-white/40 hover:text-white"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                  <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={e => uploadImage(e.target.files?.[0])} data-testid="studio-upload-input" />
                  <div className="relative">
                    <div className="absolute -inset-[1px] rounded-full opacity-40" style={{ background: GRADIENT }} />
                    <div className="relative flex items-center gap-2 rounded-full bg-[#0B090A] pl-2.5 pr-1.5 py-1.5">
                      <button onClick={() => fileRef.current?.click()} disabled={uploading || busy || project.status !== "live"} data-testid="studio-attach-btn"
                        title="Upload an image to use on your website"
                        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors">
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="text-sm">📎</span>}
                      </button>
                      <Wand2 className="w-4 h-4 text-[#FF4081] shrink-0" />
                      <input value={refine} onChange={e => setRefine(e.target.value)} onKeyDown={e => e.key === "Enter" && doRefine()}
                        disabled={busy || project.status !== "live"} data-testid="studio-refine-input"
                        placeholder={busy ? "Agent is working — please wait…"
                          : project.status === "live" ? 'Ask for a change — "make it dark blue"…'
                            : project.status === "failed" ? "Start a new build to try again"
                              : "Refinements are available for websites"}
                        className="flex-1 min-w-0 bg-transparent focus:outline-none text-sm placeholder:text-white/25 disabled:opacity-50" />
                      <button onClick={doRefine} disabled={refining || busy || project.status !== "live"} data-testid="studio-refine-btn"
                        className="shrink-0 text-[11px] px-4 py-2 rounded-full text-white font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity" style={{ background: GRADIENT }}>
                        {refining ? "…" : `Send ✦ ${COSTS.refine}cr`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview / result column */}
              <div className="space-y-4 min-w-0">
                {project.status === "live" && (
                  <div data-testid="studio-website-result" className="space-y-4">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <button onClick={() => { navigator.clipboard.writeText(liveUrl); toast.success("Live URL copied"); }}
                        className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-full border border-white/15 text-white/60 hover:text-white hover:bg-white/5 transition-colors">
                        <Copy className="w-3.5 h-3.5" /> Copy link
                      </button>
                      <a href={`${BACKEND_URL}/api/public/mira-builder/download/${project.id}`} data-testid="studio-download-btn"
                        className="flex items-center gap-2 text-xs px-4 py-2 rounded-full border border-[#D4AF37]/50 text-[#F3E5AB] hover:bg-[#D4AF37]/10 transition-colors">
                        <Download className="w-3.5 h-3.5" /> Download code
                      </a>
                    </div>
                    <div className="rounded-3xl overflow-hidden border border-white/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                      <div className="h-9 bg-[#1a1618] flex items-center gap-2 px-4 border-b border-white/5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FF4081]/70" /><span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]/70" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
                        <span className="ml-3 text-[10px] text-white/35 font-mono truncate">{liveUrl.replace(/^https?:\/\//, "")}</span>
                      </div>
                      <iframe key={iframeKey} src={liveUrl} title="Website preview" className="w-full h-[532px]" data-testid="studio-preview-iframe" />
                    </div>
                  </div>
                )}

                {project.status === "code_ready" && (
                  <div className="grid md:grid-cols-2 gap-5" data-testid="studio-app-result">
                    <div className="rounded-3xl border border-white/[0.07] bg-[#141012] p-6 sm:p-7">
                      <div className="text-[10px] uppercase tracking-[0.35em] text-white/35 mb-4">Generated Project</div>
                      <div className="space-y-2">
                        {(project.files || []).map(f => (
                          <div key={f.path} className="flex items-center gap-2.5 text-sm text-white/65 font-mono">
                            <FileCode2 className="w-3.5 h-3.5 text-[#FF4081] shrink-0" /> {f.path}
                            <span className="text-[10px] text-white/25 ml-auto">{(f.size / 1024).toFixed(1)} KB</span>
                          </div>
                        ))}
                      </div>
                      <a href={`${BACKEND_URL}/api/public/mira-builder/download/${project.id}`} data-testid="studio-download-btn"
                        className="mt-6 inline-flex items-center gap-2 text-white font-semibold px-7 py-3 rounded-full hover:opacity-90 hover:shadow-[0_0_24px_rgba(255,64,129,0.35)] transition-[opacity,box-shadow]" style={{ background: GRADIENT }}>
                        <Download className="w-4 h-4" /> Download project ZIP
                      </a>
                    </div>
                    <div className="rounded-3xl border border-white/[0.07] bg-[#141012] p-6 sm:p-7" data-testid="studio-deployment-center">
                      <div className="flex items-center gap-2 text-[#F3E5AB] font-semibold text-sm mb-4"><Rocket className="w-4 h-4" /> Deployment Center</div>
                      <pre className="text-xs text-emerald-300/90 bg-black/50 border border-white/5 rounded-2xl p-5 overflow-x-auto font-mono">{`unzip ${(project.name || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.zip && cd project
docker compose up --build
# API    → http://localhost:8000/docs
# Admin  → http://localhost:3000`}</pre>
                      <p className="text-xs text-white/40 mt-4 leading-relaxed">Everything's included — PostgreSQL schema, FastAPI backend with JWT login, React admin and Docker files.</p>
                    </div>
                  </div>
                )}

                {!["live", "code_ready"].includes(project.status) && (
                  <div className="rounded-3xl border border-white/[0.07] bg-[#141012] h-[580px] flex flex-col items-center justify-center text-center px-8" data-testid="studio-preview-placeholder">
                    {busy ? (
                      <>
                        <span className="relative mb-5">
                          <Loader2 className="w-10 h-10 text-[#D4AF37] animate-spin" />
                          <span className="absolute inset-0 rounded-full animate-ping bg-[#D4AF37]/15" />
                        </span>
                        <div className="font-playfair text-xl text-white/80">Agent is working…</div>
                        <div className="text-xs text-white/35 mt-2 max-w-xs">Your {project.kind === "website" ? "website preview will appear here" : "project files will appear here"} the moment the agent finishes.</div>
                      </>
                    ) : (
                      <>
                        <X className="w-9 h-9 text-rose-400/70 mb-4" />
                        <div className="font-playfair text-xl text-white/80">Build didn't finish</div>
                        <div className="text-xs text-white/35 mt-2">Credits refunded — start a new build to try again.</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {project.status === "live" && (
              <div className="grid sm:grid-cols-3 gap-4" data-testid="studio-deploy-options">
                {[
                  { icon: Rocket, title: "Hosted by Mira ✦", desc: "Your site is already live at the URL above — free, always on. Share it anywhere.", accent: "#D4AF37" },
                  { icon: Download, title: "Self-host free", desc: "Download the code and drag-drop the folder on Netlify or Vercel — live in 30 seconds, zero cost.", accent: "#FF4081" },
                  { icon: Globe, title: "Your own domain", desc: "Connect www.yourbusiness.com at your host (Netlify/Vercel → Add domain). The code is 100% yours.", accent: "#34d399" },
                ].map(o => (
                  <div key={o.title} className="rounded-2xl border border-white/[0.08] bg-[#141012] p-5">
                    <o.icon className="w-5 h-5 mb-3" style={{ color: o.accent }} />
                    <div className="text-sm font-semibold">{o.title}</div>
                    <div className="text-xs text-white/45 mt-1.5 leading-relaxed">{o.desc}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <footer className="border-t border-white/[0.05] py-8 text-center text-[11px] text-white/30">
        Mira AI Studio · part of <a href="/" className="text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors">Miracurl Suite</a> · websites & apps, born from a prompt ✦
      </footer>

      {/* ─── Auth modal ─── */}
      {authOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setAuthOpen(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.25 }}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-[#141012] p-7 shadow-2xl" onClick={e => e.stopPropagation()} data-testid="studio-auth-modal">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-playfair text-2xl">{authTab === "register" ? "Create your account ✦" : "Welcome back ✦"}</h3>
              <button onClick={() => setAuthOpen(false)} className="text-white/40 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-[#F3E5AB]/90 text-sm mb-5">{authTab === "register" ? `Get ${plans.free_credits ?? 50} build credits FREE on signup` : "Log in to keep building"}</p>
            <div className="flex rounded-full bg-white/5 border border-white/10 p-1 mb-6 text-xs font-semibold">
              {["register", "login"].map(t => (
                <button key={t} onClick={() => setAuthTab(t)} data-testid={`studio-auth-tab-${t}`}
                  className={`flex-1 py-2.5 rounded-full transition-colors ${authTab === t ? "text-white" : "text-white/45"}`}
                  style={authTab === t ? { background: GRADIENT } : {}}>
                  {t === "register" ? "Register" : "Login"}
                </button>
              ))}
            </div>
            <div className="space-y-3.5">
              {authTab === "register" && (
                <>
                  <input value={authForm.name} onChange={e => setAuthForm({ ...authForm, name: e.target.value })} placeholder="Your name *" data-testid="studio-auth-name" className={inputCls} />
                  <input value={authForm.phone} onChange={e => setAuthForm({ ...authForm, phone: e.target.value })} placeholder="Phone (10 digits) *" inputMode="numeric" data-testid="studio-auth-phone" className={inputCls} />
                </>
              )}
              <input value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} placeholder="Email *" type="email" data-testid="studio-auth-email" className={inputCls} />
              <input value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} onKeyDown={e => e.key === "Enter" && doAuth()}
                placeholder={authTab === "register" ? "Create a password (6+ chars) *" : "Password *"} type="password" data-testid="studio-auth-password" className={inputCls} />
              <button onClick={doAuth} disabled={authBusy} data-testid="studio-auth-submit"
                className="w-full flex items-center justify-center gap-2 text-white font-semibold px-6 py-3.5 rounded-2xl hover:opacity-90 hover:shadow-[0_0_24px_rgba(255,64,129,0.35)] disabled:opacity-60 transition-[opacity,box-shadow]" style={{ background: GRADIENT }}>
                {authBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {authTab === "register" ? `Register & claim ${plans.free_credits ?? 50} credits ✦` : "Login ✦"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ─── Buy credits modal ─── */}
      {buyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setBuyOpen(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.25 }}
            className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#141012] p-7 shadow-2xl" onClick={e => e.stopPropagation()} data-testid="studio-buy-modal">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-playfair text-2xl">Top up credits ✦</h3>
              <button onClick={() => setBuyOpen(false)} className="text-white/40 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-white/45 text-sm mb-6">
              Website · {COSTS.website} credits &nbsp;·&nbsp; App · {COSTS.app} credits &nbsp;·&nbsp; Refine · {COSTS.refine} credits
            </p>
            <div className="grid sm:grid-cols-3 gap-3.5">
              {(plans.plans || []).map(p => (
                <div key={p.key} className={`rounded-2xl border p-5 text-center relative ${p.key === "plan_200" ? "border-[#D4AF37]/60 bg-[#D4AF37]/[0.06] shadow-[0_0_24px_rgba(212,175,55,0.12)]" : "border-white/10 bg-white/[0.02]"}`}>
                  {p.key === "plan_200" && <div className="text-[8px] uppercase tracking-[0.25em] text-[#F3E5AB] mb-1.5">Most Popular</div>}
                  <div className="font-playfair text-3xl text-[#F3E5AB]">{p.credits}</div>
                  <div className="text-[9px] uppercase tracking-[0.25em] text-white/35">credits</div>
                  <div className="text-lg font-semibold mt-2.5">₹{p.price}</div>
                  {p.save && <div className="text-[10px] text-emerald-300 mt-0.5">{p.save}</div>}
                  <button onClick={() => buy(p.key)} disabled={!!buying || !plans.payments_enabled} data-testid={`studio-buy-${p.key}`}
                    className={`mt-4 w-full text-xs font-semibold py-2.5 rounded-full text-white hover:opacity-90 disabled:opacity-50 transition-opacity ${p.key === "plan_200" ? "" : ""}`}
                    style={{ background: p.key === "plan_200" ? GRADIENT : "rgba(255,255,255,0.08)" }}>
                    {buying === p.key ? "Opening…" : "Buy now"}
                  </button>
                </div>
              ))}
            </div>
            {!plans.payments_enabled && <p className="text-xs text-rose-300 mt-4">Payments are being set up — contact us to top up manually.</p>}
            <p className="text-[10px] text-white/30 mt-5 text-center">Secure payments by Razorpay · credits never expire · failed builds are auto-refunded</p>
          </motion.div>
        </div>
      )}
      {/* ─── GitHub export modal ─── */}
      {ghOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setGhOpen(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.25 }}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-[#141012] p-7 shadow-2xl" onClick={e => e.stopPropagation()} data-testid="studio-github-modal">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-playfair text-2xl">Push to GitHub ✦</h3>
              <button onClick={() => setGhOpen(false)} className="text-white/40 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-white/45 text-sm mb-5">Mira creates the repo (or reuses it) and commits your project code to your GitHub account.</p>
            <div className="space-y-3.5">
              <div>
                <input value={ghForm.token} onChange={e => setGhForm({ ...ghForm, token: e.target.value })} type="password"
                  placeholder="GitHub Personal Access Token *" data-testid="studio-github-token" className={inputCls} />
                <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer"
                  className="text-[11px] text-[#D4AF37]/80 hover:text-[#D4AF37] mt-1.5 inline-block">
                  Create a token here → grant "Administration" + "Contents" (read & write) permissions
                </a>
              </div>
              <input value={ghForm.repo} onChange={e => setGhForm({ ...ghForm, repo: e.target.value })}
                placeholder="Repository name *" data-testid="studio-github-repo" className={inputCls} />
              <label className="flex items-center gap-2.5 text-sm text-white/60 cursor-pointer">
                <input type="checkbox" checked={ghForm.priv} onChange={e => setGhForm({ ...ghForm, priv: e.target.checked })} className="accent-[#D4AF37]" />
                Private repository
              </label>
              <button onClick={doGithubExport} disabled={ghBusy} data-testid="studio-github-submit"
                className="w-full flex items-center justify-center gap-2 text-white font-semibold px-6 py-3.5 rounded-2xl hover:opacity-90 disabled:opacity-60 transition-opacity" style={{ background: GRADIENT }}>
                {ghBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                {ghBusy ? "Pushing your code…" : "Push code to GitHub ✦"}
              </button>
              <p className="text-[10px] text-white/30 text-center">Your token is used once for this push and never stored.</p>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
