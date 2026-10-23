// Six arenas. A new one every round, in order. Each map: look (colours, fog, lights) + layout (obstacles).
// Obstacles: [x, z, collider radius, prop type]. Layouts keep clear of the spawn points (radius 14 at 0/60/120...)
// and the pickup spots (radius 8.2 at the same angles, radius 14.2 at 90/210/330, and the centre).

function ring(out, n, rad, offDeg, r, type) {
  for (let i = 0; i < n; i++) {
    const a = (offDeg + i * 360 / n) * Math.PI / 180;
    out.push([Math.cos(a) * rad, Math.sin(a) * rad, r, typeof type === 'function' ? type(i) : type]);
  }
  return out;
}

// Floor shapes: wall distance for a direction a (radians, measured with atan2(z, x)).
const C = Math.cos, S = Math.sin, A = Math.abs;
// Arenas are built at 2x the original layout scale.
export const MAP_SCALE = 2;
const BASE_SHAPES = {
  circle: () => 17,
  square: (a) => Math.min(15 / Math.max(A(C(a)), A(S(a))), 15 * 1.3),             // rounded field
  blob: (a) => 15.6 + 2.4 * C(5 * a + 0.6),                                           // five-lobed swamp
  cross: (a) => { const c = A(C(a)), s = A(S(a)), L = 18.5, W = 7.6;                // castle cross
    return Math.max(Math.min(L / c, W / s), Math.min(W / c, L / s)); },
  oval: (a) => 1 / Math.sqrt(C(a) * C(a) / 410 + S(a) * S(a) / 160),                  // wide cavern
  star: (a) => 13.4 + 4.6 * Math.pow(0.5 + 0.5 * C(8 * a), 2),                        // eight-point star
};
export const SHAPES = {};
for (const k in BASE_SHAPES) SHAPES[k] = (a) => BASE_SHAPES[k](a) * MAP_SCALE;

export const MAPS = [
  {
    name: 'Moonlit Graveyard', shape: 'circle', edge: 'fence', floorTex: 'moss',
    ground: 0x1d1430, floor: 0x2a1d47, rim: 0x8a4bff, inner: 0x8a4bff, star: 0x1de9c6, tips: 0xff8a1f,
    bg: 0x0b0618, fog: 0x150a2c, fogD: 0.012, sky: 0x8a7bff, under: 0x1a0f2e, lampA: 0xff8a1f, lampB: 0x8a4bff, ember: [0xff8a1f, 0x8a4bff],
    far: 'tomb',
    obst: ring(ring([], 6, 12.5, 30, 0.9, (i) => ['pumpkin', 'tomb', 'tree'][i % 3]), 4, 4.6, 45, 0.75, 'tomb'),
  },
  {
    name: 'Pumpkin Patch', shape: 'square', edge: 'lanterns', floorTex: 'rows',
    ground: 0x24140a, floor: 0x3a2412, rim: 0xff8a1f, inner: 0xffb347, star: 0xffd34a, tips: 0xffd34a,
    bg: 0x120804, fog: 0x2a1406, fogD: 0.011, sky: 0xffb070, under: 0x2a1005, lampA: 0xff8a1f, lampB: 0xffd34a, ember: [0xff8a1f, 0xffd34a],
    far: 'pumpkin',
    obst: ring(ring([], 6, 11.2, 30, 1.0, 'pumpkin'), 3, 5.2, 90, 0.7, 'scarecrow'),
  },
  {
    name: "Witch's Swamp", shape: 'blob', edge: 'water', floorTex: 'moss',
    ground: 0x0e1d14, floor: 0x163020, rim: 0xa6ff3c, inner: 0x5cff8a, star: 0xa6ff3c, tips: 0xa6ff3c,
    bg: 0x050f08, fog: 0x0b2614, fogD: 0.016, sky: 0x8fffb0, under: 0x0a1a10, lampA: 0xa6ff3c, lampB: 0x1de9c6, ember: [0xa6ff3c, 0x1de9c6],
    far: 'tree',
    obst: ring(ring(ring([], 3, 3.4, 30, 1.0, 'cauldron'), 6, 11.8, 30, 0.75, (i) => (i % 2 ? 'tree' : 'mushroom')), 3, 15.6, 30, 0.7, 'mushroom'),
  },
  {
    name: 'Haunted Courtyard', shape: 'cross', edge: 'wall', floorTex: 'flagstone',
    ground: 0x17161f, floor: 0x26253a, rim: 0xffd34a, inner: 0xffd34a, star: 0xff5fa2, tips: 0xffd34a,
    bg: 0x09080f, fog: 0x14121e, fogD: 0.011, sky: 0xffe0b0, under: 0x101018, lampA: 0xff8a1f, lampB: 0xff5fa2, ember: [0xffd34a, 0xff5fa2],
    far: 'pillar',
    obst: ring(ring([], 8, 10.6, 22.5, 0.75, 'pillar'), 4, 4.4, 0, 0.75, 'pillar'),
  },
  {
    name: 'Frozen Crypt', shape: 'oval', edge: 'ice', floorTex: 'frost',
    ground: 0x13213a, floor: 0x203a5a, rim: 0x7fe6ff, inner: 0x7fe6ff, star: 0xffffff, tips: 0x7fe6ff,
    bg: 0x040a16, fog: 0x0e2038, fogD: 0.013, sky: 0xbfe8ff, under: 0x0a1424, lampA: 0x7fe6ff, lampB: 0x4aa8ff, ember: [0x7fe6ff, 0xffffff],
    far: 'crystal',
    obst: ring(ring(ring([], 6, 12.2, 30, 0.85, 'crystal'), 6, 5.2, 30, 0.65, 'crystal'), 3, 15.6, 30, 0.75, 'tomb'),
  },
  {
    name: 'Candy Carnival', shape: 'star', edge: 'candy', floorTex: 'sprinkles', band2: 0x1de9c6,
    ground: 0x26102e, floor: 0x3e1a4a, rim: 0xff5fa2, inner: 0x1de9c6, star: 0xffe9a8, tips: 0xff5fa2,
    bg: 0x10041a, fog: 0x2a0e30, fogD: 0.011, sky: 0xffb0e0, under: 0x200a28, lampA: 0xff5fa2, lampB: 0x1de9c6, ember: [0xff5fa2, 0x1de9c6],
    far: 'lollipop',
    obst: ring(ring([], 6, 12.5, 30, 0.75, 'lollipop'), 3, 5.0, 30, 0.95, 'gumdrop'),
  },
];

import { SPAWNS, PICKUP_SPOTS } from './constants.js';

// Scale every layout up, add a second, rotated copy of it in the inner half so the bigger floor still has
// cover, then keep props inside the wall and off spawn points and pickup spots.
for (const M of MAPS) {
  const base = M.obst.map((o) => o.slice());
  const out = [];
  for (const o of base) out.push([o[0] * MAP_SCALE, o[1] * MAP_SCALE, o[2], o[3]]);
  for (const o of base) {
    const r = Math.hypot(o[0], o[1]), a = Math.atan2(o[1], o[0]) + Math.PI / 6;
    if (r > 2) out.push([Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15, o[2], o[3]]);
  }
  const f = SHAPES[M.shape], keep = [];
  // two extra rings of this map's own props that follow its outline
  const types = [...new Set(base.map((o) => o[3]))];
  const rings = [[12, 0.8, 18], [9, 0.56, 40], [6, 0.3, 10]];
  let t = 0;
  for (const [n, frac, off] of rings) {
    for (let i = 0; i < n; i++) {
      const a = (off + i * 360 / n) * Math.PI / 180, r = f(a) * frac;
      out.push([Math.cos(a) * r, Math.sin(a) * r, 0.8, types[t++ % types.length]]);
    }
  }
  for (const o of out) {
    const d = Math.hypot(o[0], o[1]);
    if (d > 1e-6) {
      const lim = f(Math.atan2(o[1], o[0])) - 1.8 - o[2];
      if (d > lim) { o[0] *= lim / d; o[1] *= lim / d; }
    }
    let clash = false;
    for (const p of SPAWNS) if (Math.hypot(o[0] - p[0], o[1] - p[1]) < 3.2 + o[2]) clash = true;
    for (const p of PICKUP_SPOTS) if (Math.hypot(o[0] - p[0], o[1] - p[1]) < 2.6 + o[2]) clash = true;
    for (const k of keep) if (Math.hypot(o[0] - k[0], o[1] - k[1]) < o[2] + k[2] + 1.6) clash = true;
    if (!clash) keep.push(o);
  }
  M.obst = keep;
}
