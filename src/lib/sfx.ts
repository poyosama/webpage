"use client";
// Ear candy sintetizado con WebAudio: sin archivos, todo sutil.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.5, slideTo?: number, delay = 0) {
  const c = ac();
  if (!c || !master || muted) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let lastHover = 0;
export const sfx = {
  hover() {
    const n = performance.now();
    if (n - lastHover < 40) return;
    lastHover = n;
    tone(2400, 0.04, "sine", 0.12);
  },
  click() { tone(880, 0.08, "triangle", 0.4, 1320); },
  tick() { tone(1800, 0.025, "square", 0.06); },
  blade() { tone(330, 0.18, "sine", 0.35, 660); tone(990, 0.12, "sine", 0.15, undefined, 0.05); },
  open() { tone(440, 0.2, "sine", 0.3, 880); tone(1320, 0.25, "sine", 0.12, undefined, 0.08); },
  close() { tone(660, 0.18, "sine", 0.3, 330); },
  play() { tone(523, 0.1, "triangle", 0.3); tone(784, 0.14, "triangle", 0.25, undefined, 0.07); },
  pause() { tone(784, 0.1, "triangle", 0.25); tone(523, 0.14, "triangle", 0.25, undefined, 0.07); },
  like() { [660, 880, 1100].forEach((f, i) => tone(f, 0.1, "sine", 0.2, undefined, i * 0.04)); },
  type() { tone(1200 + Math.random() * 400, 0.015, "square", 0.04); },
  setMuted(m: boolean) { muted = m; if (!m) tone(880, 0.1, "sine", 0.3); },
  isMuted() { return muted; },
};
