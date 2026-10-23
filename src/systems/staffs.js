// Unlockable staffs. Each is built from simple shapes in the game's chunky style, standing on the y axis
// from y = 0 (bottom of the shaft) to y = 1 (tip), then scaled onto the wizard's hand. Cosmetic only.
import * as THREE from 'three';

export { STAFFS, STAFF_INDEX } from './staff-list.js';

const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6 }, o || {}));
const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
const M = {
  wood: std(0x5a3820, { roughness: 0.9 }), dark: std(0x1c1424, { roughness: 0.7 }), gold: std(0xffc84a, { roughness: 0.35, metalness: 0.4 }),
  vine: std(0x2f7a3a, { roughness: 0.8 }), leaf: std(0x4fae3c, { roughness: 0.8, side: THREE.DoubleSide }),
  pumpkin: std(0xff8a1f, { emissive: 0xff6a00, emissiveIntensity: 0.35 }), bone: std(0xf3ead2, { roughness: 0.85 }),
  candyW: std(0xffffff, { roughness: 0.3 }), candyP: std(0xff5fa2, { roughness: 0.3, emissive: 0xff5fa2, emissiveIntensity: 0.2 }),
  wing: std(0x2a1840, { roughness: 0.7, side: THREE.DoubleSide }), eyeW: std(0xffffff, { roughness: 0.25 }),
  iris: glow(0x7a2bff), pupil: glow(0x05020a), tent: std(0x7a3fbf, { roughness: 0.6 }), ghost: std(0xeaf6ff, { emissive: 0x9fdfff, emissiveIntensity: 0.5, transparent: true, opacity: 0.85 }),
  crystal: std(0x9fe8ff, { roughness: 0.1, emissive: 0x3aa8ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 }),
};

function shaft(g, mat, r0, r1, h) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 8), mat); m.position.y = h / 2; g.add(m); return m;
}

// Returns { group, glowMats, tick(t) }. glowMats are tinted with the current power colour.
export function buildStaff(id) {
  const g = new THREE.Group();
  const glows = [];
  let tick = () => {};
  const orb = (r, y, c) => { const m = glow(c || 0xffe9a8); glows.push(m); const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m); s.position.y = y; g.add(s); return s; };

  if (id === 'pumpkin') {
    shaft(g, M.vine, 0.02, 0.016, 0.8);
    for (let i = 0; i < 4; i++) { // curly leaves up the vine
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.05, 6), M.leaf); l.position.set(i % 2 ? 0.035 : -0.035, 0.25 + i * 0.13, 0); l.rotation.set(0.3, i * 1.7, i % 2 ? -0.6 : 0.6); g.add(l);
    }
    const head = new THREE.Group(); head.position.y = 0.88; g.add(head);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), M.pumpkin); p.scale.set(1.15, 0.85, 1.15); head.add(p);
    const face = glow(0xffe9a8); glows.push(face);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.035, 3), face); e.position.set(0.035 * s, 0.02, 0.105); e.rotation.x = Math.PI / 2; head.add(e); }
    const mo = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.016, 0.01), face); mo.position.set(0, -0.025, 0.11); head.add(mo);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.016, 0.05, 6), M.vine); st.position.y = 0.1; head.add(st);
    tick = (t) => { head.rotation.y = Math.sin(t * 1.3) * 0.35; face.color.setRGB(1, 0.85 + Math.sin(t * 17) * 0.1, 0.5); };
  } else if (id === 'candy') {
    const sh = new THREE.Group(); g.add(sh);
    for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8), i % 2 ? M.candyP : M.candyW); s.position.y = 0.04 + i * 0.08; sh.add(s); }
    const disc = new THREE.Group(); disc.position.y = 0.92; g.add(disc);
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 24), M.candyP); d.rotation.x = Math.PI / 2; disc.add(d);
    for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.03 + i * 0.03, 0.009, 6, 24), M.candyW); r.position.z = 0.022; disc.add(r); }
    const c = orb(0.025, 0, 0xffffff); c.position.set(0, 0.92, 0.03);
    tick = (t) => { disc.rotation.z = t * 2.5; };
  } else if (id === 'bat') {
    shaft(g, M.dark, 0.02, 0.015, 0.84);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 16), M.gold); ring.position.y = 0.9; g.add(ring);
    orb(0.05, 0.9, 0xb28cff);
    const wings = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(0.22, 0.09); sh.lineTo(0.2, 0.0); sh.lineTo(0.16, 0.03); sh.lineTo(0.13, -0.03); sh.lineTo(0.09, 0.01); sh.lineTo(0.05, -0.04); sh.lineTo(0, 0);
      const piv = new THREE.Group(); piv.position.set(0.045 * s, 0.9, 0); piv.scale.x = s;
      const w = new THREE.Mesh(new THREE.ShapeGeometry(sh), M.wing); piv.add(w); g.add(piv); wings.push(piv);
    }
    tick = (t) => { const f = Math.sin(t * 9) * 0.6; wings[0].rotation.y = f; wings[1].rotation.y = -f; };
  } else if (id === 'crystal') {
    shaft(g, M.dark, 0.022, 0.015, 0.8);
    const claw = new THREE.Group(); claw.position.y = 0.8; g.add(claw);
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.12, 5), M.gold); const a = i * 2.094; p.position.set(Math.cos(a) * 0.04, 0.05, Math.sin(a) * 0.04); p.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); claw.add(p); }
    const core = orb(0.04, 0.9, 0x7ff3ff);
    const spin = new THREE.Group(); spin.position.y = 0.9; g.add(spin);
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), M.crystal); c.scale.y = 1.8; const a = i * 2.094; c.position.set(Math.cos(a) * 0.11, 0, Math.sin(a) * 0.11); spin.add(c); }
    tick = (t) => { spin.rotation.y = t * 2.2; spin.position.y = 0.9 + Math.sin(t * 3) * 0.02; core.scale.setScalar(1 + Math.sin(t * 25) * 0.15); };
  } else if (id === 'skull') {
    shaft(g, M.bone, 0.022, 0.018, 0.8);
    for (const y of [0.02, 0.4, 0.78]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), M.bone); k.position.y = y; g.add(k); }
    const head = new THREE.Group(); head.position.y = 0.9; g.add(head);
    const sk = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), M.bone); sk.scale.set(1, 0.95, 1.05); head.add(sk);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.07), M.bone); jaw.position.set(0, -0.07, 0.025); head.add(jaw);
    const eyes = glow(0xff3b6b); glows.push(eyes);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), eyes); e.position.set(0.032 * s, 0.005, 0.072); head.add(e);
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.09, 6), M.dark); h.position.set(0.06 * s, 0.08, 0); h.rotation.z = -0.6 * s; head.add(h);
    }
    tick = (t) => { jaw.position.y = -0.07 - Math.max(0, Math.sin(t * 4)) * 0.015; head.rotation.y = Math.sin(t * 0.9) * 0.3; };
  } else if (id === 'eye') {
    const sh = new THREE.Group(); g.add(sh);
    shaft(sh, M.tent, 0.024, 0.016, 0.82);
    for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.006, 5, 10), M.gold); r.rotation.x = Math.PI / 2; r.position.y = 0.12 + i * 0.12; sh.add(r); }
    const head = new THREE.Group(); head.position.y = 0.92; g.add(head);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), M.eyeW); head.add(ball);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), M.iris); iris.position.z = 0.089; head.add(iris); glows.push(M.iris);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.02, 12), M.pupil); pupil.position.z = 0.0905; head.add(pupil);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.094, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.tent); lid.rotation.x = -1.5; head.add(lid);
    const tents = [];
    for (let i = 0; i < 4; i++) {
      const a = i * 1.571 + 0.78, tg = new THREE.Group(); tg.position.set(Math.cos(a) * 0.06, 0.86, Math.sin(a) * 0.06); g.add(tg);
      let parent = tg;
      for (let k = 0; k < 4; k++) { const seg = new THREE.Group(); seg.position.y = k ? 0.04 : 0; const m = new THREE.Mesh(new THREE.CylinderGeometry(0.008 - k * 0.0015, 0.011 - k * 0.0015, 0.045, 6), M.tent); m.position.y = 0.022; seg.add(m); parent.add(seg); parent = seg; tents.push({ seg, i, k, a }); }
    }
    tick = (t) => {
      head.rotation.y = Math.sin(t * 0.8) * 0.6; head.rotation.x = Math.sin(t * 0.53) * 0.25;
      const blink = (t % 3.2) < 0.14; lid.rotation.x = blink ? -0.2 : -1.5;
      for (const s of tents) { s.seg.rotation.x = Math.sin(t * 3 + s.i + s.k * 0.6) * 0.35 + 0.25 * Math.sin(s.a); s.seg.rotation.z = Math.cos(t * 2.6 + s.i) * 0.3 - 0.25 * Math.cos(s.a); }
    };
  } else if (id === 'ghost') {
    shaft(g, M.dark, 0.02, 0.015, 0.78);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 14, Math.PI), M.gold); hook.position.set(0.05, 0.78, 0); g.add(hook);
    const lan = new THREE.Group(); lan.position.set(0.1, 0.7, 0); g.add(lan);
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0xffc84a, wireframe: true })); lan.add(frame);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.05, 6), M.gold); cap.position.y = 0.085; lan.add(cap);
    const flame = orb(0.03, 0, 0x7ff3ff); lan.add(flame); flame.position.set(0, 0, 0);
    const ghost = new THREE.Group(); g.add(ghost);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65), M.ghost); body.scale.y = 1.4; ghost.add(body);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), M.pupil); e.position.set(0.017 * s, 0.025, 0.045); ghost.add(e); }
    tick = (t) => {
      lan.rotation.z = Math.sin(t * 2) * 0.2;
      ghost.position.set(Math.cos(t * 1.6) * 0.16, 0.95 + Math.sin(t * 3.2) * 0.04, Math.sin(t * 1.6) * 0.16);
      ghost.rotation.y = -t * 1.6 + Math.PI / 2;
      flame.scale.setScalar(1 + Math.sin(t * 19) * 0.2);
    };
  } else { // moon (used by the code-made kittens; Mayu keeps its own modelled moon staff)
    shaft(g, M.wood, 0.02, 0.016, 0.85);
    const cr = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.016, 6, 18, Math.PI * 1.45), M.gold); cr.position.y = 0.92; cr.rotation.z = -0.9; g.add(cr);
    orb(0.05, 0.92);
  }
  return { group: g, glowMats: glows, tick: (t) => tick(t) };
}
