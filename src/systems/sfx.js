// All sound is synthesized with the Web Audio API: effects plus a looping spooky music track.
import { store } from './storage.js';

let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
let muted = store.muted;
let musicTimer = 0, nextT = 0, step = 0, musicOn = false;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

function tone(freq, dur, type, vol, slideTo, delay, bus) {
  if (!ctx) return;
  const t = ctx.currentTime + (delay || 0);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.012, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus || sfxBus);
  o.start(t); o.stop(t + dur + 0.03);
}

function noise(dur, vol, f0, f1, type, delay, bus) {
  if (!ctx) return;
  const t = ctx.currentTime + (delay || 0);
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type || 'bandpass';
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(0.0002, vol), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(bus || sfxBus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

const FX = {
  click() { tone(520, 0.08, 'square', 0.12, 780); },
  cast0(v) { tone(680, 0.14, 'triangle', 0.16 * v, 1100); },
  cast1(v) { noise(0.28, 0.35 * v, 600, 1800, 'bandpass'); tone(220, 0.25, 'sawtooth', 0.12 * v, 420); },
  cast2(v) { tone(1300, 0.3, 'sine', 0.14 * v, 1800); tone(1700, 0.25, 'triangle', 0.1 * v, 900, 0.03); },
  cast3(v) { noise(0.18, 0.3 * v, 4000, 900, 'highpass'); tone(160, 0.2, 'sawtooth', 0.16 * v, 700); },
  cast4(v) { tone(500, 0.35, 'sine', 0.14 * v, 180); tone(750, 0.3, 'triangle', 0.08 * v, 260, 0.05); },
  shield(v) { tone(440, 0.25, 'sine', 0.16 * v, 880); tone(660, 0.3, 'triangle', 0.1 * v, 1320, 0.04); },
  block(v) { tone(1500, 0.12, 'square', 0.08 * v, 1200); noise(0.08, 0.2 * v, 3000, 2000, 'bandpass'); },
  dash(v) { noise(0.25, 0.35 * v, 600, 4000, 'bandpass'); tone(300, 0.2, 'triangle', 0.1 * v, 900); },
  trap(v) { [880, 660, 440, 330].forEach((f, i) => tone(f, 0.3, 'sine', 0.13 * v, f * 0.5, i * 0.06)); },
  thunder() { noise(1.4, 0.7, 1800, 60, 'lowpass'); noise(0.3, 0.5, 6000, 1500, 'highpass'); tone(70, 1.2, 'sawtooth', 0.3, 30); tone(140, 0.5, 'square', 0.12, 50, 0.05); },
  charge() { tone(110, 0.5, 'sawtooth', 0.14, 660); noise(0.5, 0.25, 400, 6000, 'bandpass'); tone(880, 0.45, 'sine', 0.08, 1760, 0.05); },
  ultready() { [523, 784, 1046, 1568].forEach((f, i) => tone(f, 0.25, 'triangle', 0.16, f * 1.02, i * 0.07)); noise(0.3, 0.2, 5000, 2000, 'highpass', 0.2); },
  aim() { tone(220, 0.5, 'sawtooth', 0.08, 880); noise(0.4, 0.15, 800, 5000, 'bandpass'); },
  hit(v) { noise(0.12, 0.35 * v, 1400, 300, 'bandpass'); tone(200, 0.12, 'square', 0.14 * v, 90); },
  hurt() { tone(300, 0.25, 'sawtooth', 0.18, 120); noise(0.18, 0.25, 900, 200, 'lowpass'); },
  zap(v) { noise(0.22, 0.4 * v, 6000, 500, 'highpass'); tone(900, 0.18, 'sawtooth', 0.12 * v, 140); },
  ko(v) { tone(420, 0.7, 'sawtooth', 0.2 * v, 60); noise(0.5, 0.3 * v, 900, 100, 'lowpass'); tone(210, 0.8, 'triangle', 0.14 * v, 40, 0.05); },
  pick() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.17, f * 1.01, i * 0.06)); },
  heal() { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.22, 'sine', 0.16, f, i * 0.07)); },
  off() { tone(330, 0.3, 'triangle', 0.08, 140); },
  win() { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.2, f, i * 0.11)); tone(130, 1, 'sawtooth', 0.1, 130, 0.4); },
  lose() { [330, 277, 233, 196].forEach((f, i) => tone(f, 0.45, 'sawtooth', 0.14, f * 0.95, i * 0.2)); },
  go() { tone(220, 0.1, 'square', 0.14, 220); tone(440, 0.25, 'square', 0.14, 440, 0.12); },
  join() { tone(660, 0.12, 'triangle', 0.15, 880); tone(990, 0.2, 'triangle', 0.15, 990, 0.1); },
};

// Spooky minor loop: bass + plucked arpeggio + sparse bell + soft kick/hat. 16 steps per bar, 4 bars.
const BASS = [55, 55, 43.65, 41.2];      // A1 A1 F1 E1
const ARP = [[220, 262, 330, 440], [220, 262, 330, 440], [175, 220, 262, 349], [165, 208, 247, 330]];
const BELL = [880, 0, 0, 0, 0, 0, 784, 0, 0, 0, 659, 0, 0, 0, 0, 0];
const BPM = 100;

function schedule() {
  if (!ctx || !musicOn) return;
  const s16 = 60 / BPM / 4;
  while (nextT < ctx.currentTime + 0.3) {
    const bar = Math.floor(step / 16) % 4, i = step % 16;
    const dt = Math.max(0, nextT - ctx.currentTime);
    if (i % 4 === 0) tone(BASS[bar], 0.38, 'triangle', 0.5, BASS[bar] * 0.98, dt, musicBus);
    if (i % 2 === 0) tone(ARP[bar][(i / 2) % 4], 0.2, 'square', 0.07, null, dt, musicBus);
    if (BELL[i] && bar % 2 === 1) tone(BELL[i] * (bar === 3 ? 0.75 : 1), 0.9, 'sine', 0.14, null, dt, musicBus);
    if (i === 0 || i === 8) tone(110, 0.14, 'sine', 0.5, 45, dt, musicBus);
    if (i % 4 === 2) noise(0.05, 0.1, 7000, 5000, 'highpass', dt, musicBus);
    nextT += s16; step++;
  }
}

export const sfx = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!musicTimer) { musicOn = true; nextT = ctx.currentTime + 0.1; musicTimer = setInterval(schedule, 60); }
  },
  get muted() { return muted; },
  setMuted(v) {
    muted = v; store.setMuted(v);
    if (master) master.gain.setTargetAtTime(v ? 0 : 0.8, ctx.currentTime, 0.03);
  },
  toggle() { this.setMuted(!muted); return muted; },
  music(on) { musicOn = on; if (on && ctx) nextT = Math.max(nextT, ctx.currentTime + 0.05); },
  play(name, vol) {
    if (!ctx || muted) return;
    const v = vol === undefined ? 1 : vol;
    if (!(v > 0.02)) return; // too far away to hear (and Web Audio can't ramp to 0)
    const f = FX[name]; if (f) f(v);
  },
};
