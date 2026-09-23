/* Soft sparkle chime + gentle clap for Mira's cheer. Web Audio (no asset), honours the device/tab mute and a per-device toggle. */
const KEY = "mira.cheer.sound";
export const cheerSoundOn = () => localStorage.getItem(KEY) !== "off";
export const setCheerSound = (on) => localStorage.setItem(KEY, on ? "on" : "off");

export function playCheerSound() {
  if (!cheerSoundOn()) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
    // 3-note rising chime (C6 E6 G6) — soft sine with quick decay
    [[1046.5, 0], [1318.5, 0.09], [1568, 0.18]].forEach(([f, t]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, now + t); g.gain.linearRampToValueAtTime(0.5, now + t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.55);
      o.connect(g).connect(master); o.start(now + t); o.stop(now + t + 0.6);
    });
    // two gentle claps — short band-passed noise bursts
    const noise = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate); const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    [0.05, 0.28].forEach((t) => {
      const s = ctx.createBufferSource(); s.buffer = noise;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.value = 0.5;
      s.connect(bp).connect(g).connect(master); s.start(now + t);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch { /* audio unavailable — stay silent */ }
}
