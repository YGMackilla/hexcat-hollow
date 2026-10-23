// Chunky low-poly models built from primitives. One consistent style: flat colours, glowing eyes, big hats.
import * as THREE from 'three';
import { PAL } from './constants.js';

const G = {
  robe: new THREE.ConeGeometry(0.62, 1.25, 10),
  head: new THREE.SphereGeometry(0.46, 14, 12),
  ear: new THREE.ConeGeometry(0.17, 0.36, 4),
  hatCone: new THREE.ConeGeometry(0.4, 1.0, 10),
  hatBrim: new THREE.CylinderGeometry(0.66, 0.66, 0.07, 16),
  hatBand: new THREE.CylinderGeometry(0.42, 0.45, 0.14, 12),
  eye: new THREE.SphereGeometry(0.075, 8, 6),
  nose: new THREE.SphereGeometry(0.05, 6, 5),
  tail: new THREE.CapsuleGeometry(0.09, 0.8, 4, 8),
  staff: new THREE.CylinderGeometry(0.04, 0.05, 1.7, 6),
  orb: new THREE.SphereGeometry(0.17, 12, 10),
  paw: new THREE.SphereGeometry(0.13, 8, 6),
  disc: new THREE.CircleGeometry(0.75, 20),
  plane: new THREE.PlaneGeometry(1, 1),
  bolt: new THREE.SphereGeometry(0.3, 10, 8),
};
export const GEO = G;

export function makeWizard(robeHex, furHex) {
  const root = new THREE.Group();
  const bob = new THREE.Group(); // everything that bobs while walking
  root.add(bob);

  const robe = new THREE.MeshStandardMaterial({ color: robeHex, roughness: 0.7, emissive: 0x000000 });
  const fur = new THREE.MeshStandardMaterial({ color: furHex, roughness: 0.9, emissive: 0x000000 });
  const hat = new THREE.MeshStandardMaterial({ color: robeHex, roughness: 0.6, emissive: 0x000000 });
  hat.color.multiplyScalar(0.55);
  const band = new THREE.MeshStandardMaterial({ color: PAL.bone, roughness: 0.6, emissive: 0x000000 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 1 });
  const glow = new THREE.MeshBasicMaterial({ color: PAL.basic });
  const eyeMat = new THREE.MeshBasicMaterial({ color: PAL.teal });
  const noseMat = new THREE.MeshBasicMaterial({ color: PAL.pink });

  const body = new THREE.Mesh(G.robe, robe); body.position.y = 0.62; bob.add(body);
  const head = new THREE.Mesh(G.head, fur); head.position.y = 1.5; bob.add(head);
  for (let s = -1; s <= 1; s += 2) {
    const ear = new THREE.Mesh(G.ear, fur); ear.position.set(0.3 * s, 1.88, 0); ear.rotation.z = -0.25 * s; bob.add(ear);
    const eye = new THREE.Mesh(G.eye, eyeMat); eye.position.set(0.17 * s, 1.54, 0.4); bob.add(eye);
    const paw = new THREE.Mesh(G.paw, fur); paw.position.set(0.5 * s, 0.82, 0.25); bob.add(paw);
  }
  const nose = new THREE.Mesh(G.nose, noseMat); nose.position.set(0, 1.45, 0.45); bob.add(nose);
  const brim = new THREE.Mesh(G.hatBrim, hat); brim.position.y = 1.86; bob.add(brim);
  const bandM = new THREE.Mesh(G.hatBand, band); bandM.position.y = 1.95; bob.add(bandM);
  const cone = new THREE.Mesh(G.hatCone, hat); cone.position.y = 2.45; cone.rotation.z = 0.12; bob.add(cone);

  const tail = new THREE.Group(); tail.position.set(0, 0.45, -0.5);
  const tailM = new THREE.Mesh(G.tail, fur); tailM.position.y = 0.45; tailM.rotation.x = -0.4; tail.add(tailM);
  bob.add(tail);

  const staff = new THREE.Group(); staff.position.set(0.62, 0, 0.35);
  const stick = new THREE.Mesh(G.staff, wood); stick.position.y = 0.85; staff.add(stick);
  const orb = new THREE.Mesh(G.orb, glow); orb.position.y = 1.78; staff.add(orb);
  bob.add(staff);

  const shadow = new THREE.Mesh(G.disc, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; root.add(shadow);

  let ph = Math.random() * 6, wagT = 0;
  return {
    root, bob, shadow, fur, flashMats: [robe, fur, hat, band], labelY: 3.85, barY: 3.4, kind: 'kitty',
    setFur(hex) { fur.color.setHex(hex); },
    setGlow(hex) { glow.color.setHex(hex); },
    cast() { staff.rotation.x = -0.9; },
    channel(on) { if (on) staff.rotation.x = -1.2; },
    anim(dt, speed, happy) {
      const moving = Math.min(1, speed / 4);
      ph += dt * (3 + speed * 1.6); wagT += dt * (3.2 + moving * 2 + happy * 6);
      bob.position.y = Math.abs(Math.sin(ph)) * 0.14 * moving;
      bob.rotation.z = Math.sin(ph) * 0.06 * moving;
      tail.rotation.z = Math.sin(wagT) * (0.4 + happy * 0.3);
      orb.scale.setScalar(1 + Math.sin(ph * 2) * 0.1);
      staff.rotation.x *= Math.exp(-10 * dt);
    },
  };
}

export function makeNameSprite(text, hex) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = "36px 'Chewy', cursive";
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = '#120a22'; g.lineJoin = 'round';
  g.strokeText(text, 128, 34);
  g.fillStyle = '#' + new THREE.Color(hex).getHexString();
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(3.2, 0.8, 1);
  sp.renderOrder = 10;
  return sp;
}

export function makeBar() {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ color: PAL.ink, transparent: true, opacity: 0.8, depthTest: false }));
  bg.scale.set(1.5, 0.2, 1); bg.renderOrder = 11;
  const fillMat = new THREE.MeshBasicMaterial({ color: PAL.heal, depthTest: false });
  const fill = new THREE.Mesh(G.plane, fillMat);
  fill.scale.set(1.4, 0.12, 1); fill.position.z = 0.01; fill.renderOrder = 12;
  g.add(bg, fill);
  return { group: g, fill, fillMat };
}

// Scenery
const pumpkinMat = new THREE.MeshStandardMaterial({ color: PAL.orange, roughness: 0.6, emissive: PAL.orange, emissiveIntensity: 0.35 });
const faceMat = new THREE.MeshBasicMaterial({ color: PAL.basic });
const stoneMat = new THREE.MeshStandardMaterial({ color: PAL.stone, roughness: 1 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x2a1c2e, roughness: 1 });

export function makePumpkin() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), pumpkinMat); b.scale.set(1, 0.82, 1); b.position.y = 0.82; g.add(b);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0x2f7a3a })); stem.position.y = 1.72; g.add(stem);
  for (let s = -1; s <= 1; s += 2) {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.3, 3), faceMat); e.position.set(0.35 * s, 0.98, 0.88); e.rotation.x = Math.PI / 2; g.add(e);
  }
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.1), faceMat); m.position.set(0, 0.55, 0.92); g.add(m);
  return g;
}
export function makeTomb() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.35), stoneMat); b.position.y = 0.65; g.add(b);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12), stoneMat); t.rotation.x = Math.PI / 2; t.position.y = 1.3; g.add(t);
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.05), new THREE.MeshBasicMaterial({ color: 0x1f1b33 })); c1.position.set(0, 1.05, 0.2); g.add(c1);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0x1f1b33 })); c2.position.set(0, 1.15, 0.2); g.add(c2);
  return g;
}
export function makeTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.42, 3.2, 7), woodMat); trunk.position.y = 1.6; g.add(trunk);
  const angs = [0.9, 2.6, 4.4, 5.5];
  for (let i = 0; i < angs.length; i++) {
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 1.6, 5), woodMat);
    br.position.set(Math.cos(angs[i]) * 0.55, 2.7 + i * 0.25, Math.sin(angs[i]) * 0.55);
    br.rotation.z = Math.cos(angs[i]) * -0.9; br.rotation.x = Math.sin(angs[i]) * 0.9;
    g.add(br);
  }
  return g;
}

export function makePickupMeshes() {
  const g = new THREE.Group();
  const mk = (geo, hex) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hex })); m.visible = false; g.add(m); return m; };
  const fire = mk(new THREE.ConeGeometry(0.42, 1.0, 6), PAL.fire);
  const ice = mk(new THREE.OctahedronGeometry(0.55), PAL.ice);
  const storm = mk(new THREE.TetrahedronGeometry(0.62), PAL.storm);
  const heal = new THREE.Group(); heal.visible = false;
  const flask = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshBasicMaterial({ color: PAL.heal })); flask.position.y = -0.1;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.4, 8), new THREE.MeshBasicMaterial({ color: PAL.bone })); neck.position.y = 0.4;
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 8), new THREE.MeshBasicMaterial({ color: 0xc58a4a })); cork.position.y = 0.66;
  heal.add(flask, neck, cork); g.add(heal);
  // air dash: a double chevron
  const dash = new THREE.Group(); dash.visible = false;
  const dm = new THREE.MeshBasicMaterial({ color: PAL.dash });
  for (let i = 0; i < 2; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 4), dm);
    c.rotation.z = -Math.PI / 2; c.position.x = i * 0.36 - 0.18; c.scale.set(1, 1, 0.35); dash.add(c);
  }
  g.add(dash);
  // slow-mo trap: an hourglass
  const trap = new THREE.Group(); trap.visible = false;
  const tm = new THREE.MeshBasicMaterial({ color: PAL.trap });
  const t1 = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.5, 8), tm); t1.position.y = 0.25; t1.rotation.x = Math.PI;
  const t2 = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.5, 8), tm); t2.position.y = -0.25;
  const sand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: PAL.bone }));
  trap.add(t1, t2, sand); g.add(trap);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.15, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -0.95; g.add(ring);
  return { group: g, variants: [null, fire, ice, storm, heal, dash, trap], ring };
}

// ---------- props for the other maps (same chunky style: flat colours, one glowing accent) ----------
const strawMat = new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 1 });
const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2633, roughness: 0.5, metalness: 0.3 });
const brewMat = new THREE.MeshBasicMaterial({ color: 0x8dff4a });
const capMat = new THREE.MeshStandardMaterial({ color: 0xb04bff, roughness: 0.6, emissive: 0x7a2bd0, emissiveIntensity: 0.6 });
const spotMat = new THREE.MeshBasicMaterial({ color: 0xe9ffd0 });
const stemMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 1 });
const pillarMat = new THREE.MeshStandardMaterial({ color: 0x5b5670, roughness: 0.95 });
const waxMat = new THREE.MeshStandardMaterial({ color: 0xf3ead2, roughness: 0.8 });
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc04a });
const iceMat = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, roughness: 0.15, metalness: 0.1, emissive: 0x3aa8ff, emissiveIntensity: 0.45, transparent: true, opacity: 0.88 });
const candyA = new THREE.MeshStandardMaterial({ color: 0xff5fa2, roughness: 0.35, emissive: 0xff5fa2, emissiveIntensity: 0.25 });
const candyB = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
const gumMats = [0x1de9c6, 0xffd34a, 0xa6ff3c].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, emissive: c, emissiveIntensity: 0.3 }));

export function makeScarecrow() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.4, 6), woodMat); post.position.y = 1.2; g.add(post);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 6), woodMat); arm.rotation.z = Math.PI / 2; arm.position.y = 1.75; g.add(arm);
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 6), strawMat); body.position.y = 1.3; g.add(body);
  const head = makePumpkin(); head.scale.setScalar(0.38); head.position.y = 2.05; g.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 8), ironMat); hat.position.y = 2.9; hat.rotation.z = 0.25; g.add(hat);
  return g;
}

export function makeCauldron() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12, 0, Math.PI * 2, Math.PI * 0.18, Math.PI * 0.82), ironMat);
  pot.position.y = 0.85; g.add(pot);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.1, 8, 20), ironMat); lip.rotation.x = Math.PI / 2; lip.position.y = 1.65; g.add(lip);
  const brew = new THREE.Mesh(new THREE.CircleGeometry(0.74, 20), brewMat); brew.rotation.x = -Math.PI / 2; brew.position.y = 1.58; g.add(brew);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12 + i * 0.03, 8, 6), brewMat);
    b.position.set(Math.cos(i * 2.1) * 0.35, 1.72 + i * 0.05, Math.sin(i * 2.1) * 0.35); g.add(b);
  }
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.5, 5), ironMat);
    leg.position.set(Math.cos(i * 2.1) * 0.6, 0.2, Math.sin(i * 2.1) * 0.6); g.add(leg);
  }
  return g;
}

export function makeMushroom() {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.2, 8), stemMat); stem.position.y = 0.6; g.add(stem);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat); cap.position.y = 1.15; cap.scale.y = 0.7; g.add(cap);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26, s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), spotMat);
    s.position.set(Math.cos(a) * 0.5, 1.5, Math.sin(a) * 0.5); g.add(s);
  }
  return g;
}

export function makePillar() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.3), pillarMat); base.position.y = 0.15; g.add(base);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 2.6, 10), pillarMat); col.position.y = 1.6; g.add(col);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, 1.2), pillarMat); top.position.y = 3.0; g.add(top);
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3 + i * 0.12, 6), waxMat);
    c.position.set(-0.3 + i * 0.3, 3.3 + i * 0.06, 0.1 * (i - 1)); g.add(c);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), flameMat); f.scale.y = 1.6;
    f.position.set(c.position.x, 3.18 + (0.3 + i * 0.12) + i * 0.06, c.position.z); g.add(f);
  }
  return g;
}

export function makeCrystal() {
  const g = new THREE.Group();
  const big = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), iceMat); big.scale.set(0.8, 2.4, 0.8); big.position.y = 1.6; g.add(big);
  const s1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), iceMat); s1.scale.set(0.8, 1.9, 0.8); s1.position.set(0.55, 0.7, 0.2); s1.rotation.z = -0.4; g.add(s1);
  const s2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), iceMat); s2.scale.set(0.8, 1.8, 0.8); s2.position.set(-0.45, 0.6, -0.25); s2.rotation.z = 0.45; g.add(s2);
  return g;
}

export function makeLollipop() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), candyB); stick.position.y = 1.2; g.add(stick);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.22, 20), candyA); disc.rotation.x = Math.PI / 2; disc.position.y = 2.6; g.add(disc);
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.2 + i * 0.22, 0.06, 6, 20), candyB); r.position.set(0, 2.6, 0.12); g.add(r);
  }
  return g;
}

let gumN = 0;
export function makeGumdrop() {
  const g = new THREE.Group();
  const m = gumMats[gumN++ % gumMats.length];
  const d = new THREE.Mesh(new THREE.SphereGeometry(1.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m); d.scale.y = 1.3; g.add(d);
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4, e = 0.25 + (i % 4) * 0.3;
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), candyB);
    sp.position.set(Math.cos(a) * Math.cos(e) * 1.05, Math.sin(e) * 1.35, Math.sin(a) * Math.cos(e) * 1.05); g.add(sp);
  }
  return g;
}

export const PROPS = {
  pumpkin: makePumpkin, tomb: makeTomb, tree: makeTree, scarecrow: makeScarecrow, cauldron: makeCauldron,
  mushroom: makeMushroom, pillar: makePillar, crystal: makeCrystal, lollipop: makeLollipop, gumdrop: makeGumdrop,
};
