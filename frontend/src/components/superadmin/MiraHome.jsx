import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Flame, CalendarClock, Target, Megaphone, Lightbulb, Send, Brain, Clock, Loader2, X, ScanFace } from "lucide-react";
import { MiraNeuralAvatar, MiraThinkingBeam } from "./MiraNeuralAvatar";
import { promptAsync } from "@/components/ConfirmDialog";
import { LinkHealthBadge } from "./LinkHealthBadge";
import { TrafficConversionCard } from "./TrafficConversionCard";
import { MiraMemoryPanel } from "./MiraMemoryPanel";
import "@/styles/mira-deck.css";

const KIND_ICON = { search: "🔍", result: "🎯", ask: "💬", call: "📞", email: "✉️", memory: "🧠" };

let _pendingSpeech = "";

function _doSpeak(text) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    synth.resume();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-IN";
    u.rate = 1.0;
    const voices = synth.getVoices() || [];
    const v = voices.find(x => /en[-_](IN|GB|US)/i.test(x.lang) && /female|zira|veena|heera|samantha|google uk english female/i.test(x.name))
      || voices.find(x => /^en[-_]IN/i.test(x.lang)) || voices.find(x => /^en/i.test(x.lang));
    if (v) u.voice = v;
    synth.speak(u);
  } catch { /* unsupported */ }
}

function speak(text) {
  if (!window.speechSynthesis) return;
  // Browsers mute speech before the first tap/keypress — queue it for the first gesture.
  const active = !navigator.userActivation || navigator.userActivation.hasBeenActive;
  if (active) { _doSpeak(text); return; }
  _pendingSpeech = text;
  const fire = () => {
    window.removeEventListener("pointerdown", fire);
    window.removeEventListener("keydown", fire);
    if (_pendingSpeech) { const t = _pendingSpeech; _pendingSpeech = ""; _doSpeak(t); }
  };
  window.addEventListener("pointerdown", fire, { once: true });
  window.addEventListener("keydown", fire, { once: true });
}

async function captureFrame(videoEl) {
  const c = document.createElement("canvas");
  c.width = videoEl.videoWidth || 480;
  c.height = videoEl.videoHeight || 360;
  c.getContext("2d").drawImage(videoEl, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7).split(",")[1];
}

function FaceCam({ onFrame, label, busy }) {
  const videoRef = useRef(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let stream;
    navigator.mediaDevices?.getUserMedia({ video: { width: 480, facingMode: "user" } })
      .then(s => { stream = s; if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(() => setErr("Camera unavailable — allow camera permission and retry."));
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);
  return (
    <div className="flex flex-col items-center gap-3">
      {err ? <p className="text-xs text-amber-300 text-center max-w-xs">{err}</p> : (
        <div className="relative">
          <video ref={videoRef} autoPlay playsInline muted className="w-56 h-56 object-cover rounded-2xl border-2 border-fuchsia-400/50 scale-x-[-1]" />
          <span className="absolute inset-3 rounded-xl border border-dashed border-white/30 pointer-events-none" />
        </div>
      )}
      {!err && (
        <button onClick={async () => onFrame(await captureFrame(videoRef.current))} disabled={busy} data-testid="facecam-capture"
          className="px-5 py-2 rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 text-xs font-bold disabled:opacity-50 flex items-center gap-2">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanFace className="w-3.5 h-3.5" />} {label}
        </button>
      )}
    </div>
  );
}

function FaceEnrollModal({ enrolled, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  async function enroll(b64) {
    setBusy(true);
    try {
      await api.post("/super-admin/mira/face-enroll", { image_b64: b64 });
      toast.success("Face enrolled — Mira will recognize you at login ✦");
      onChanged();
      onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Enroll failed"); }
    finally { setBusy(false); }
  }
  async function remove() {
    try { await api.delete("/super-admin/mira/face-enroll"); toast.success("Face-ID disabled"); onChanged(); onClose(); }
    catch { toast.error("Couldn't disable"); }
  }
  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} data-testid="face-enroll-modal">
      <div className="bg-[#101a35] border border-white/15 rounded-2xl w-full max-w-sm text-white shadow-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 font-semibold text-sm"><ScanFace className="w-4 h-4 text-fuchsia-400" /> Face-ID {enrolled ? "· enrolled ✓" : "setup"}</div>
          <button onClick={onClose} className="text-white/50 hover:text-white" data-testid="face-enroll-close"><X className="w-4 h-4" /></button>
        </div>
        <FaceCam onFrame={enroll} busy={busy} label={enrolled ? "Re-enroll my face" : "Capture & enroll my face"} />
        {enrolled && (
          <button onClick={remove} className="w-full mt-3 text-[11px] text-rose-300 hover:text-rose-200" data-testid="face-unenroll">Disable Face-ID</button>
        )}
        <p className="text-[10px] text-white/30 mt-3 text-center">Your face is checked by Mira's AI vision at each login before she welcomes you.</p>
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
  const [q, setQ] = useState("");
  const [chat, setChat] = useState([]); // {role, text}
  const [thinking, setThinking] = useState(false);
  const [memFocus, setMemFocus] = useState(0);
  const memRef = useRef(null);
  const openMemory = () => { memRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); setMemFocus(n => n + 1); };
  const [purging, setPurging] = useState(false);
  const [faceModal, setFaceModal] = useState(false);
  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const [faceBusy, setFaceBusy] = useState(false);
  const [recog, setRecog] = useState(() => (sessionStorage.getItem("mira_welcomed") ? "done" : "loading"));
  const [greetOn, setGreetOn] = useState(() => localStorage.getItem("mira_greet_login") !== "0");
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem("mira_home_voice") !== "0");
  const [liveTask, setLiveTask] = useState(null);
  const audioRef = useRef(null);

  const stopVoice = () => {
    try { audioRef.current?.pause(); } catch { /* noop */ }
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
  };
  const sayReply = useCallback(async (text) => {
    const clean = (text || "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").replace(/\s{2,}/g, " ").trim();
    if (!clean) return;
    stopVoice();
    try {
      const { data } = await api.post("/super-admin/mira/speak", { text: clean.slice(0, 900) });
      const audio = new Audio(`data:audio/mp3;base64,${data.audio_b64}`);
      audioRef.current = audio;
      await audio.play();
    } catch { speak(clean); }
  }, []);
  const toggleVoice = () => {
    const v = !voiceOn;
    setVoiceOn(v);
    localStorage.setItem("mira_home_voice", v ? "1" : "0");
    if (v) sayReply("Voice is on, Boss. I'll read every reply aloud for you.");
    else stopVoice();
    toast.success(v ? "Mira will speak her replies 🔊" : "Mira replies in text only 🔇");
  };

  const toggleGreet = () => {
    const v = !greetOn;
    setGreetOn(v);
    localStorage.setItem("mira_greet_login", v ? "1" : "0");
    if (v) {
      sessionStorage.removeItem("mira_welcomed");
      const hour = new Date().getHours();
      const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
      speak(`Welcome, Boss! Good ${part}. Mira is online and at your service.`);
    } else {
      try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    }
    toast.success(v ? "Mira will greet you at every login 🔔" : "Login greeting turned off 🔕");
  };
  const lastMira = useRef("");
  const outreachRef = useRef(null);
  const viaFace = useRef(false);
  const deployRef = useRef(null);
  const welcomedRef = useRef(false);
  const handleLinkHealth = useCallback((d) => {
    deployRef.current = d;
    const n = d?.deploy_pending ? (d.pending?.length || 0) : 0;
    if (n) {
      localStorage.setItem("mira_deploy_pending", JSON.stringify({ count: n, live: d.live_build, target: d.this_build }));
      return;
    }
    if (!d?.live_build || d.live_build !== d.this_build) return;
    const was = JSON.parse(localStorage.getItem("mira_deploy_pending") || "null");
    if (!was) return;
    localStorage.removeItem("mira_deploy_pending");
    const msg = `Deployed, Boss — all ${was.count} build${was.count === 1 ? " is" : "s are"} live on production (${d.live_build}). 🎉`;
    setChat(c => [...c.slice(-6), { role: "mira", text: `✅ ${msg}` }]);
    toast.success("🎉 Production is up to date");
    if (localStorage.getItem("mira_home_voice") !== "0") sayReply(msg);
  }, [sayReply]);
  useEffect(() => {
    const check = () => api.get("/super/link-health").then(r => {
      const first = deployRef.current === null;
      handleLinkHealth(r.data);
      const n = r.data?.deploy_pending ? (r.data.pending?.length || 0) : 0;
      if (first && n && welcomedRef.current) {  // greeting already happened before the check returned — still surface the nudge
        setChat(c => [...c.slice(-6), { role: "mira", text: `🚀 Boss, ${n} build${n === 1 ? " is" : "s are"} waiting to ship (production is on ${r.data.live_build}). Shall we deploy?` }]);
      }
    }).catch(() => {});
    check();
    const iv = setInterval(check, 60000);  // notice the moment production catches up
    return () => clearInterval(iv);
  }, [handleLinkHealth]);

  const finishWelcome = useCallback(() => {
    setRecog("done");
    sessionStorage.setItem("mira_welcomed", "1");
    welcomedRef.current = true;
    const hour = new Date().getHours();
    const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    const name = "Boss";
    const lh = deployRef.current;
    const n = lh?.deploy_pending ? (lh.pending?.length || 0) : 0;
    const nudge = n ? ` ${name}, ${n} build${n === 1 ? " is" : "s are"} waiting — shall we deploy?` : "";
    if (nudge) setChat(c => [...c.slice(-6), { role: "mira", text: `🚀 ${name}, ${n} build${n === 1 ? " is" : "s are"} waiting to ship (production is on ${lh.live_build}). Shall we deploy?` }]);
    const report = outreachRef.current?.greeting ? ` Outreach report: ${outreachRef.current.greeting}` : "";
    if (localStorage.getItem("mira_greet_login") !== "0") {
      speak(`${viaFace.current ? "Face verified. " : ""}Welcome back, ${name}! Good ${part}. Mira is online and ready for you.${report}${nudge}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Recognition: face-ID if enrolled, else scan animation (once per session)
  useEffect(() => {
    api.get("/super-admin/mira/face-status").then(r => {
      setFaceEnrolled(!!r.data.enrolled);
      setRecog(prev => (prev === "loading" ? (r.data.enrolled ? "face" : "scanning") : prev));
    }).catch(() => setRecog(prev => (prev === "loading" ? "scanning" : prev)));
  }, []);
  useEffect(() => {
    if (recog !== "scanning") return undefined;
    const t = setTimeout(() => setRecog("verified"), 1700);
    return () => clearTimeout(t);
  }, [recog]);
  useEffect(() => {
    if (recog !== "verified") return undefined;
    const t = setTimeout(finishWelcome, 1400);
    return () => clearTimeout(t);
  }, [recog, finishWelcome]);

  async function verifyFace(b64) {
    setFaceBusy(true);
    try {
      const { data } = await api.post("/super-admin/mira/face-verify", { image_b64: b64 });
      if (data.match) {
        viaFace.current = true;
        setRecog("verified");
      } else {
        toast.error(`Mira couldn't match your face${data.reason ? ` — ${data.reason}` : ""}. Try again or skip.`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Face check failed — you can skip for now");
    } finally { setFaceBusy(false); }
  }

  const load = useCallback(async () => {
    const h = await api.get("/super-admin/mira/home").catch(() => ({ data: null }));
    setHome(h.data);
    outreachRef.current = h.data?.outreach || null;
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    const poll = () => api.get("/super-admin/mira/live-task")
      .then(({ data }) => { if (alive) setLiveTask(data.active ? data : null); })
      .catch(() => {});
    poll();
    const iv = setInterval(poll, 4000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  async function purgeOrphans() {
    setPurging(true);
    try {
      const { data } = await api.post("/super/db/purge-orphans");
      toast.success(`Mira cleaned ${data.removed} orphan record${data.removed === 1 ? "" : "s"} — all tidy, Boss ✦`);
      speak(`Done Boss! I safely removed ${data.removed} orphan records. Your database is tidy again.`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Purge failed");
    } finally { setPurging(false); }
  }

  async function editGoal() {
    const cur = home?.revenue_goal;
    const t = await promptAsync("Monthly revenue TARGET in lakh (₹):", cur ? String(cur.target / 100000) : "10");
    if (!t) return;
    const s = await promptAsync("Stretch goal in lakh (₹):", cur ? String(cur.stretch / 100000) : "20");
    const target = parseFloat(t) * 100000;
    const stretch = parseFloat(s || "0") * 100000;
    if (!target || target <= 0) { toast.error("Enter a valid target"); return; }
    try {
      await api.put("/super-admin/mira/revenue-goal", { target, stretch: stretch > 0 ? stretch : 0 });
      toast.success("Goal updated — Mira will coach you toward it ✦");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save goal"); }
  }

  async function ask(text) {
    const question = (text || q).trim();
    if (!question || thinking) return;
    setQ("");
    setChat(c => [...c.slice(-6), { role: "boss", text: question }]);
    setThinking(true);
    try {
      const { data } = await api.post("/super-admin/mira/ask", { question, last_mira: lastMira.current });
      lastMira.current = data.answer || "";
      setChat(c => [...c.slice(-6), { role: "mira", text: data.answer || "…", pending: data.pending_action || null }]);
      if (voiceOn && data.answer) sayReply(data.answer);
      if (data.tab) {
        toast.info("Opening " + data.tab + " for you, Boss ✦");
        setTimeout(() => onGoTab?.(data.tab), 1200);
      }
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Mira couldn't answer just now");
    } finally { setThinking(false); }
  }

  const [checkingGoogle, setCheckingGoogle] = useState(false);
  const [googleCheck, setGoogleCheck] = useState(null);
  async function checkGoogle() {
    setCheckingGoogle(true);
    try {
      const { data } = await api.post("/super-admin/google/recheck-all");
      setGoogleCheck(data);
      if (data.live && data.live === data.checked) { toast.success(data.verdict); speak("Great news Boss — Google Business Profile API is live. Review replies are switched on."); }
      else toast.info(data.verdict);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't reach Google just now");
    } finally { setCheckingGoogle(false); }
  }

  async function confirmAction(idx, pending, yes) {
    setChat(c => c.map((m, i) => (i === idx ? { ...m, pending: null } : m)));
    if (!yes) { setChat(c => [...c.slice(-6), { role: "mira", text: "Okay, Boss — not doing that." }]); return; }
    setThinking(true);
    try {
      const { data } = await api.post("/super-admin/mira/confirm-action", { action: pending.action });
      lastMira.current = data.answer || "";
      setChat(c => [...c.slice(-6), { role: "mira", text: data.answer || "Done, Boss." }]);
      if (voiceOn && data.answer) sayReply(data.answer);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Mira couldn't do that just now");
    } finally { setThinking(false); }
  }

  const snap = home?.snapshot || {};
  const cards = [
    { key: "hot", label: "Hot Leads", value: snap.hot_leads ?? "—", icon: Flame, tone: "from-orange-500/20 to-rose-500/10 text-orange-300", tab: "mira-leads" },
    { key: "followups", label: "Follow-ups", value: home?.followups_due ?? "—", icon: CalendarClock, tone: "from-sky-500/20 to-blue-500/10 text-sky-300", tab: "demo-calendar" },
    { key: "opps", label: "New Prospects (48h)", value: home?.new_prospects_48h ?? "—", icon: Target, tone: "from-emerald-500/20 to-teal-500/10 text-emerald-300", tab: "mira-leads" },
    { key: "campaigns", label: "Outreach Emails", value: home?.outreach?.totals?.emails ?? home?.emails_sent ?? "—", icon: Megaphone, tone: "from-fuchsia-500/20 to-purple-500/10 text-fuchsia-300", tab: "mira-leads" },
    { key: "insights", label: "Trials Expiring Soon", value: home?.trials_expiring ?? "—", icon: Lightbulb, tone: "from-amber-500/20 to-yellow-500/10 text-amber-300", tab: "billing" },
  ];

  const suggestions = ["Hey Mira 👋", "What did you send today?", "Start outreach now", "Find restaurant leads in Dubai, AE", "How did we do yesterday?"];
  const avatarSize = typeof window !== "undefined" && window.innerWidth >= 1024 ? 250 : 160;

  return (
    <div className="mira-deck overflow-hidden rounded-3xl text-white p-5 sm:p-8" data-testid="mira-home">
      <div className="mira-aurora mira-aurora-a" aria-hidden="true" />
      <div className="mira-aurora mira-aurora-b" aria-hidden="true" />
      <div className="mira-aurora mira-aurora-c" aria-hidden="true" />
      <div className="mira-aurora mira-aurora-d" aria-hidden="true" />
      {/* Recognition overlay */}
      {recog !== "done" && (
        <div className="absolute inset-0 z-20 bg-[#0b1020]/95 backdrop-blur-sm flex flex-col items-center justify-center" data-testid="mira-recognition-overlay">
          <div className="relative w-28 h-28 mb-5">
            <span className="absolute -inset-3 rounded-full border-2 border-dashed border-fuchsia-400/50 animate-spin" style={{ animationDuration: "3s" }} />
            <span className="absolute inset-0 rounded-full border border-sky-400/40 animate-ping" style={{ animationDuration: "1.4s" }} />
            <img src="/mira-neural.png" alt="Mira" className="relative w-28 h-28 rounded-full object-cover border-2 border-fuchsia-400/60" />
          </div>
          {recog === "face" ? (
            <div className="flex flex-col items-center gap-3" data-testid="mira-face-gate">
              <FaceCam onFrame={verifyFace} busy={faceBusy} label={faceBusy ? "Verifying…" : "Verify my face"} />
              <button onClick={finishWelcome} className="text-[11px] text-white/40 hover:text-white/70" data-testid="face-skip">Skip Face-ID this time</button>
            </div>
          ) : recog === "scanning" || recog === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-white/70"><ScanFace className="w-4 h-4 text-fuchsia-400 animate-pulse" /> Recognizing you…</div>
          ) : (
            <div className="text-sm text-emerald-300 flex items-center gap-2 animate-fade-up">
              ✓ Verified{viaFace.current ? " by Face-ID" : ""} · <b>{user?.name || user?.email || "Boss"}</b> <span className="text-white/40">· Super Admin</span>
            </div>
          )}
        </div>
      )}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Main column */}
        <div className="flex flex-col items-center text-center">
          <div className="-my-4" data-testid="mira-avatar">
            <MiraNeuralAvatar thinking={thinking || !!liveTask} size={avatarSize} />
          </div>
          {liveTask && (
            <div className="mb-4 max-w-xl px-4 py-2 rounded-full bg-sky-500/10 border border-sky-400/30 flex items-center gap-2 text-xs text-sky-200 shadow-[0_0_25px_rgba(56,189,248,0.15)]" data-testid="mira-live-narration">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse shrink-0" />
              <span className="font-semibold whitespace-nowrap">{liveTask.label}</span>
              {liveTask.detail && <span className="text-sky-200/60 truncate hidden sm:inline">· {liveTask.detail}</span>}
            </div>
          )}

          {home?.outreach && (
            <div className="mt-3 max-w-2xl w-full flex items-start gap-2.5 bg-[#e8c37f]/10 border border-[#e8c37f]/30 rounded-2xl px-4 py-3" data-testid="mira-outreach-report">
              <span className="text-base leading-none mt-0.5">📨</span>
              <div className="text-xs text-[#f3dfae] leading-relaxed text-left flex-1">
                <b>Outreach report, Boss:</b> {home.outreach.greeting}
                <div className="flex flex-wrap gap-2 mt-2 items-center">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${home.outreach.settings?.enabled ? "bg-emerald-400 text-[#06251a]" : "bg-white/10 text-white/60"}`} data-testid="mira-outreach-status">
                    {home.outreach.settings?.enabled ? `Autopilot ON · ${home.outreach.today.emails}/${home.outreach.settings.daily_email_limit} today` : "Autopilot OFF"}
                  </span>
                  <span className="text-[10px] text-white/50">💇 {home.outreach.today.salon} · 🍽️ {home.outreach.today.restaurant} · 💬 {home.outreach.today.whatsapp} · 🔥 {home.outreach.today.replies} replies</span>
                  <button onClick={() => onGoTab?.("mira-leads")} data-testid="mira-outreach-open"
                    className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-[#e8c37f] text-[#1c1c22] hover:bg-[#f3dfae]">
                    History & rules →
                  </button>
                </div>
              </div>
            </div>
          )}

          {home?.blog_drafts?.length > 0 && (
            <div className="mt-3 max-w-2xl w-full flex items-start gap-2.5 bg-violet-500/10 border border-violet-400/30 rounded-2xl px-4 py-3" data-testid="mira-blog-draft-alert">
              <span className="text-base leading-none mt-0.5">📝</span>
              <div className="text-xs text-violet-200 leading-relaxed text-left flex-1">
                <b>{home.blog_drafts[0].auto_draft ? "My weekly article is ready for your review, Boss:" : "A blog draft is waiting for approval:"}</b>{" "}
                “{home.blog_drafts[0].title}”
                {home.blog_drafts.length > 1 && <span className="text-violet-300/70"> (+{home.blog_drafts.length - 1} more draft{home.blog_drafts.length > 2 ? "s" : ""})</span>}
                <div className="mt-2">
                  <button onClick={() => onGoTab?.("partners")} data-testid="mira-blog-draft-review"
                    className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-violet-400 text-[#0b1020] hover:bg-violet-300">
                    Review & Publish →
                  </button>
                </div>
              </div>
            </div>
          )}

          {home?.google_pending > 0 && (
            <div className="mt-3 max-w-2xl w-full flex items-start gap-2.5 bg-amber-500/10 border border-amber-400/30 rounded-2xl px-4 py-3" data-testid="mira-google-pending">
              <span className="text-base leading-none mt-0.5">⭐</span>
              <div className="text-xs text-amber-200 leading-relaxed text-left flex-1">
                <b>Google Business Profile:</b> {home.google_pending} tenant{home.google_pending === 1 ? " is" : "s are"} connected but Google hasn't opened review access to our app yet.
                Enabled the APIs or got Google's approval email? Tap and I'll re-check every tenant right now.
                {googleCheck && <div className="mt-1.5 text-[11px] text-amber-100/90" data-testid="mira-google-verdict">{googleCheck.verdict}{googleCheck.results?.[0]?.api_error_detail ? ` — Google says: ${googleCheck.results[0].api_error_detail}` : ""}</div>}
                <div className="flex gap-2 mt-2">
                  <button onClick={checkGoogle} disabled={checkingGoogle} data-testid="mira-google-recheck"
                    className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-amber-400 text-[#0b1020] hover:bg-amber-300 disabled:opacity-50 flex items-center gap-1">
                    {checkingGoogle ? <Loader2 className="w-3 h-3 animate-spin" /> : "⭐"} {checkingGoogle ? "Asking Google…" : "Check Google API now"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {home?.health_alerts?.length > 0 && (
            <div className="mt-3 max-w-2xl w-full flex items-start gap-2.5 bg-amber-500/10 border border-amber-400/30 rounded-2xl px-4 py-3" data-testid="mira-health-alert">
              <span className="text-base leading-none mt-0.5">⚠️</span>
              <div className="text-xs text-amber-200 leading-relaxed text-left flex-1">
                <b>Hey Boss — system health needs your attention:</b> {home.health_alerts.join(" · ")}
                <div className="flex gap-2 mt-2">
                  {home.orphan_records > 0 && (
                    <button onClick={purgeOrphans} disabled={purging} data-testid="mira-purge-orphans"
                      className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-amber-400 text-[#0b1020] hover:bg-amber-300 disabled:opacity-50 flex items-center gap-1">
                      {purging ? <Loader2 className="w-3 h-3 animate-spin" /> : "🧹"} {purging ? "Cleaning…" : `Purge ${home.orphan_records} orphans safely`}
                    </button>
                  )}
                  <button onClick={() => onGoTab?.("platform-map")} data-testid="mira-health-open"
                    className="text-[10px] px-3 py-1.5 rounded-full border border-amber-400/40 text-amber-200 hover:bg-amber-500/20">
                    Open System Health →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Chat strip */}
          {chat.length > 0 && (
            <div className="w-full max-w-2xl mt-4 space-y-2 text-left" data-testid="mira-chat-strip">
              {chat.slice(-4).map((m, i, arr) => (
                <div key={i} className={`text-xs px-3.5 py-2.5 rounded-2xl leading-relaxed ${m.role === "boss"
                  ? "bg-white/10 border border-white/10 ml-10" : "bg-fuchsia-500/15 border border-fuchsia-400/20 mr-10"}`}>
                  <b className={m.role === "boss" ? "text-sky-300" : "text-fuchsia-300"}>{m.role === "boss" ? "You" : "Mira"}:</b> {m.text}
                  {m.pending && (
                    <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="mira-confirm-bar">
                      <span className="text-[10px] uppercase tracking-wider text-white/50">Confirm: {m.pending.label}</span>
                      <button onClick={() => confirmAction(chat.length - arr.length + i, m.pending, true)} data-testid="mira-confirm-yes"
                        className="text-[11px] font-bold px-3 py-1 rounded-full bg-[#e8c37f] text-[#1c1c22] hover:bg-[#f3dfae]">Confirm ✦</button>
                      <button onClick={() => confirmAction(chat.length - arr.length + i, m.pending, false)} data-testid="mira-confirm-no"
                        className="text-[11px] font-semibold px-3 py-1 rounded-full bg-white/10 text-white/70 hover:bg-white/20">Not now</button>
                    </div>
                  )}
                </div>
              ))}
              {thinking && <MiraThinkingBeam className="mr-6" />}
            </div>
          )}

          {/* Ask input */}
          <div className="w-full max-w-2xl mt-5 flex items-center gap-2 mira-glass rounded-full px-4 py-1.5 focus-within:!border-fuchsia-400/60 transition-colors">
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
          <TrafficConversionCard />
          {home?.revenue_goal && (
            <div className="mira-glass rounded-2xl !border-emerald-400/25 p-4" data-testid="mira-revenue-goal">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white/70">🎯 {home.revenue_goal.month} Revenue Goal</div>
                <button onClick={editGoal} data-testid="edit-revenue-goal" className="text-[10px] text-white/40 hover:text-white transition-colors">✎ edit</button>
              </div>
              <div className="text-xl font-bold text-white" data-testid="revenue-goal-collected">
                ₹{Number(home.revenue_goal.collected_this_month).toLocaleString("en-IN")}
                <span className="text-[10px] font-normal text-white/45"> collected · {home.revenue_goal.pct}% of goal</span>
              </div>
              <div className="relative h-2.5 rounded-full bg-white/10 mt-2.5 overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-all duration-700"
                  style={{ width: `${Math.min(100, (home.revenue_goal.collected_this_month / home.revenue_goal.stretch) * 100)}%` }} />
                <span className="absolute inset-y-0 w-px bg-white/60" style={{ left: `${(home.revenue_goal.target / home.revenue_goal.stretch) * 100}%` }} />
              </div>
              <div className="flex justify-between text-[9px] text-white/35 mt-1">
                <span>₹0</span>
                <span>goal ₹{(home.revenue_goal.target / 100000).toFixed(0)}L</span>
                <span>stretch ₹{(home.revenue_goal.stretch / 100000).toFixed(0)}L</span>
              </div>
              <p className="text-[11px] text-emerald-200/80 leading-relaxed mt-2" data-testid="mira-revenue-coach">💬 {home.revenue_goal.coach}</p>
            </div>
          )}
          <div className="mira-glass rounded-2xl p-4" data-testid="mira-status-panel">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-white/70">
                <Brain className="w-4 h-4 text-fuchsia-400" /> Current Task
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <LinkHealthBadge />
                <button onClick={toggleVoice} data-testid="toggle-mira-voice"
                  title={voiceOn ? "Mira reads every reply aloud — tap for text only" : "Replies are text only — tap so Mira speaks"}
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${voiceOn ? "bg-fuchsia-500/20 border-fuchsia-400/30 text-fuchsia-200" : "bg-white/5 border-white/15 text-white/50 hover:text-white"}`}>
                  {voiceOn ? "🔊 Voice on" : "🔇 Voice off"}
                </button>
                <button onClick={toggleGreet} data-testid="toggle-greet-login"
                  title={greetOn ? "Mira greets you aloud at login — tap to turn off" : "Login greeting is off — tap to enable"}
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${greetOn ? "bg-sky-500/20 border-sky-400/30 text-sky-200" : "bg-white/5 border-white/15 text-white/50 hover:text-white"}`}>
                  {greetOn ? "🔔 Greet on" : "🔕 Greet off"}
                </button>
                <button onClick={() => setFaceModal(true)} data-testid="open-face-id"
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${faceEnrolled ? "bg-emerald-500/20 border-emerald-400/30 text-emerald-200" : "bg-white/5 border-white/15 text-white/50 hover:text-white"}`}>
                  {faceEnrolled ? "🪪 Face-ID on" : "🪪 Face-ID"}
                </button>
                <button onClick={openMemory} data-testid="open-memory-vault"
                  className="text-[10px] px-2.5 py-1 rounded-full bg-fuchsia-500/20 border border-fuchsia-400/30 text-fuchsia-200 hover:bg-fuchsia-500/30 transition-colors">
                  🧠 Memory
                </button>
              </div>
            </div>
            {liveTask ? (
              <div className="text-xs text-emerald-300 space-y-1" data-testid="mira-current-task-live">
                <div className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> {liveTask.label}</div>
                {liveTask.detail && <div className="text-[10px] text-white/45 pl-5 leading-snug">{liveTask.detail}</div>}
              </div>
            ) : thinking ? (
              <div className="text-xs text-fuchsia-300 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking about your question…</div>
            ) : (
              <div className="text-xs text-white/40">Idle — ready for your next instruction ✦</div>
            )}
            {home?.weekly_sweep?.checked_at && (
              <div className="text-[10px] text-white/40 mt-2.5 pt-2 border-t border-white/5 flex items-center gap-1.5 flex-wrap" data-testid="mira-weekly-sweep">
                🩺 Weekly sweep {timeLabel(home.weekly_sweep.checked_at)} —{" "}
                {home.weekly_sweep.new_findings?.length > 0 && !home.weekly_sweep.announced
                  ? <span className="text-amber-300 font-semibold">{home.weekly_sweep.new_findings.length} new issue{home.weekly_sweep.new_findings.length === 1 ? "" : "s"} found</span>
                  : <span className="text-emerald-300">all clear ✓{home.weekly_sweep.orphans > 0 ? ` · ${home.weekly_sweep.orphans} known orphans` : ""}</span>}
              </div>
            )}
          </div>

          <div ref={memRef}><MiraMemoryPanel focusSignal={memFocus} /></div>

          <div className="mira-glass rounded-2xl p-4" data-testid="mira-memory-timeline">
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
                    <span className="absolute left-0 top-0.5 w-3.5 h-3.5 rounded-full bg-[#0b1020] border border-fuchsia-400/50 flex items-center justify-center text-[8px]">
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
      {faceModal && <FaceEnrollModal enrolled={faceEnrolled} onClose={() => setFaceModal(false)}
        onChanged={() => api.get("/super-admin/mira/face-status").then(r => setFaceEnrolled(!!r.data.enrolled)).catch(() => {})} />}
    </div>
  );
}
