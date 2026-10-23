import { SAVE_KEY } from './constants.js';

// All persistence goes through here. localStorage can throw (private mode, blocked), so never trust it.
const mem = { best: 0, muted: false, cam: 0, staff: 'moon', stats: { wins: 0, kos: 0, ults: 0, bestRound: 0 } };

function read() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (typeof o.best === 'number') mem.best = o.best;
      if (typeof o.muted === 'boolean') mem.muted = o.muted;
      if (o.cam === 0 || o.cam === 1 || o.cam === 2) mem.cam = o.cam;
      if (typeof o.staff === 'string') mem.staff = o.staff;
      if (o.stats && typeof o.stats === 'object') for (const k in mem.stats) if (typeof o.stats[k] === 'number') mem.stats[k] = o.stats[k];
    }
  } catch (e) { /* ignore */ }
}
function write() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(mem)); } catch (e) { /* ignore */ }
}
read();

export const store = {
  get best() { return mem.best; },
  get muted() { return mem.muted; },
  setMuted(v) { mem.muted = !!v; write(); },
  get stats() { return mem.stats; },
  addStat(k, n) { mem.stats[k] = (mem.stats[k] || 0) + n; write(); },
  bestRound(r) { if (r > mem.stats.bestRound) { mem.stats.bestRound = r; write(); } },
  get staff() { return mem.staff; },
  setStaff(id) { mem.staff = id; write(); },
  get cam() { return mem.cam; },
  setCam(v) { mem.cam = v; write(); },
  submitScore(s) {
    if (s > mem.best) { mem.best = s; write(); return true; }
    return false;
  },
};
