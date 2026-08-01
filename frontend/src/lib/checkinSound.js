/* Pleasant chime + spoken greeting for staff check-in / check-out. Best-effort: silently no-ops if the browser blocks audio. */

function playNotes(notes) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    notes.forEach(([freq, start, dur]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.22, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    });
    setTimeout(() => ctx.close().catch(() => {}), 2500);
  } catch { /* audio blocked */ }
}

function speak(text) {
  try {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1.05;
    u.volume = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(x => /en[-_](IN|GB)/i.test(x.lang)) || voices.find(x => x.lang?.startsWith("en"));
    if (v) u.voice = v;
    setTimeout(() => window.speechSynthesis.speak(u), 650);
  } catch { /* tts blocked */ }
}

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function playCheckinGreeting(name) {
  playNotes([[523.25, 0, 0.5], [659.25, 0.14, 0.5], [783.99, 0.28, 0.7]]); // C5-E5-G5 rising chime
  const who = (name || "").split(" ")[0];
  speak(`${timeGreeting()}${who ? " " + who : ""}! You're checked in. Have a wonderful shift.`);
}

export function playCheckoutGreeting(name) {
  playNotes([[783.99, 0, 0.5], [659.25, 0.14, 0.5], [523.25, 0.28, 0.7]]); // falling chime
  const who = (name || "").split(" ")[0];
  speak(`You're checked out${who ? ", " + who : ""}. Great work today. See you tomorrow!`);
}
