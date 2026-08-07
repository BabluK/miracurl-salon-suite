// Web Audio scan feedback tones (no audio files — PWA/offline safe)

function ctx() {
  return new (window.AudioContext || window.webkitAudioContext)();
}

export function playChime() {
  try {
    const ac = ctx();
    const t = ac.currentTime;
    [[880, 0], [1318.5, 0.12]].forEach(([freq, delay]) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(0.22, t + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.35);
      o.connect(g).connect(ac.destination);
      o.start(t + delay);
      o.stop(t + delay + 0.4);
    });
    setTimeout(() => ac.close().catch(() => {}), 900);
  } catch { /* audio not available */ }
}

export function playErrorBuzz() {
  try {
    const ac = ctx();
    const t = ac.currentTime;
    [[220, 0], [165, 0.16]].forEach(([freq, delay]) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "square";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(0.12, t + delay + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.14);
      o.connect(g).connect(ac.destination);
      o.start(t + delay);
      o.stop(t + delay + 0.18);
    });
    try { navigator.vibrate?.([80, 60, 80]); } catch { /* no haptics */ }
    setTimeout(() => ac.close().catch(() => {}), 700);
  } catch { /* audio not available */ }
}
