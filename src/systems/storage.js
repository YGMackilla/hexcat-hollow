import { SAVE_KEY } from './constants.js';

// All persistence goes through here. localStorage can throw (private mode, blocked), so never trust it.
const mem = { best: 0, muted: false, cam: 0 };

function read() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (typeof o.best === 'number') mem.best = o.best;
      if (typeof o.muted === 'boolean') mem.muted = o.muted;
      if (o.cam === 0 || o.cam === 1 || o.cam === 2) mem.cam = o.cam;
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
  get cam() { return mem.cam; },
  setCam(v) { mem.cam = v; write(); },
  submitScore(s) {
    if (s > mem.best) { mem.best = s; write(); return true; }
    return false;
  },
};
