// Small interface sounds, made with the Web Audio API (no audio files to load).
let ctx = null;
const audio = () => { try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; } catch { return null; } };

/** A soft two-note chime: "Assist is on". Resolves when it has finished (about 0.4 s). */
export function chime() {
  const a = audio();
  if (!a) return Promise.resolve();
  const t = a.currentTime + 0.02;
  [[659.25, 0], [987.77, 0.12]].forEach(([freq, at]) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t + at);
    g.gain.linearRampToValueAtTime(0.12, t + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.32);
    o.connect(g).connect(a.destination);
    o.start(t + at); o.stop(t + at + 0.34);
  });
  return new Promise(r => setTimeout(r, 450));
}
