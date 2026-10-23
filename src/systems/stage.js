// The 3D side of the game: renderer, post-processing, graveyard arena, wizard views, projectiles, pickups, effects.
// Reads game state, never changes it.
import * as THREE from 'three';
import { EffectComposer } from '../../vendor/three-addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/three-addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/three-addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../../vendor/three-addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../../vendor/three-addons/postprocessing/OutputPass.js';
import { VignetteShader } from '../../vendor/three-addons/shaders/VignetteShader.js';
import { PAL, TUNE, OBST, PICKUP_SPOTS, POWER_COLORS, SLOT_COLORS, FUR_COLORS, ROBE_COLORS, arenaR, ARENA } from './constants.js';
import { makeMayuWizard, mayuReady } from './mayu.js';
import { Particles, ease, angleLerp } from './fx.js';
import { makeWizard, makeNameSprite, makeBar, makeTomb, makePickupMeshes, GEO, PROPS } from './models.js';
import { MAPS, SHAPES } from './maps.js';
import { EV } from './sim.js';

const KIND_SCALE = [0.6, 0.95, 0.85, 0.75, 0.8];

export class Stage {
  constructor(host) {
    this.host = host;
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.maxDpr = coarse ? 1.25 : 2;
    this.coarse = coarse;

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.setClearColor(PAL.night);
    host.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PAL.night);
    this.scene.fog = new THREE.FogExp2(PAL.fog, 0.022);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 220);
    this.camX = 0; this.camZ = 0; this.shakeAmp = 0; this.orbitA = 0; this.zoom = 1;
    this.time = 0;
    this.camAspectScale = 1;

    this.loadFxTextures();
    this.buildLights();
    this.buildArena();
    this.fx = new Particles(this.scene);
    this.buildViews();
    this.buildSpellFx();
    this.buildPost(coarse);
    this.camMode = 0; this.hideSlot = -1; this.chaseSlot = -1; this.chaseInit = false;
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
    this.scene.add(this.camera);
    this.buildFpStaff();
    this.hurt = 0;
    this.emberT = 0;
    this.localSlot = -1;
    this.resize();
  }

  // ---------- setup ----------
  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0x8a7bff, 0x1a0f2e, 1.15);
    s.add(this.hemi);
    const moon = new THREE.DirectionalLight(0xbfd0ff, 1.5);
    moon.position.set(-12, 22, -10);
    s.add(moon);
    this.lamps = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(i ? PAL.purple : PAL.orange, 55, 22, 2);
      l.position.set(i ? 9 : -9, 3.2, i ? -6 : 7);
      s.add(l); this.lamps.push(l);
    }
  }

  buildArena() {
    const s = this.scene;
    this.arenas = [];
    this.mapShown = -1;
    this.embers = [PAL.orange, PAL.purple];
    // sky: moon + stars (shared by every map)
    const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 16), new THREE.MeshBasicMaterial({ color: PAL.moon, fog: false }));
    moon.position.set(-46, 52, -75); s.add(moon);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(11, 20, 16), new THREE.MeshBasicMaterial({ color: PAL.moon, transparent: true, opacity: 0.12, fog: false, depthWrite: false }));
    halo.position.copy(moon.position); s.add(halo);
    const sp = new Float32Array(500 * 3);
    for (let i = 0; i < 500; i++) {
      const a = Math.random() * 6.283, e = 0.1 + Math.random() * 1.2, d = 110;
      sp[i * 3] = Math.cos(a) * Math.cos(e) * d; sp[i * 3 + 1] = Math.sin(e) * d * 0.7 + 10; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * d;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    s.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: PAL.bone, size: 1.4, sizeAttenuation: false, fog: false })));
    this.setMap(0);
  }

  // Build (once) and show one of the six arenas, and switch the lighting to match it.
  setMap(i) {
    if (i === this.mapShown) return;
    if (!this.arenas[i]) this.arenas[i] = this.buildMap(MAPS[i]);
    for (let j = 0; j < this.arenas.length; j++) if (this.arenas[j]) this.arenas[j].group.visible = j === i;
    const M = MAPS[i];
    this.scene.background.setHex(M.bg);
    this.renderer.setClearColor(M.bg);
    this.scene.fog.color.setHex(M.fog);
    this.fogBase = M.fogD;
    this.scene.fog.density = M.fogD / (this.camAspectScale || 1);
    this.hemi.color.setHex(M.sky); this.hemi.groundColor.setHex(M.under);
    this.lamps[0].color.setHex(M.lampA); this.lamps[1].color.setHex(M.lampB);
    this.embers = M.ember;
    this.star = this.arenas[i].star;
    this.mapShown = i;
  }

  // One arena: floor in the map's own outline, glowing rim, themed edge, props, and scenery beyond.
  buildMap(M) {
    const g = new THREE.Group(), shape = SHAPES[M.shape], N = 160;
    const pts = [];
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2 - Math.PI; const r = shape(a); pts.push([Math.cos(a) * r, Math.sin(a) * r, a, r]); }
    // ground beyond the arena (swamp water glows)
    const outer = new THREE.Mesh(new THREE.CircleGeometry(120, 64), M.edge === 'water'
      ? new THREE.MeshStandardMaterial({ color: 0x0f3a1c, emissive: 0x1d7a2c, emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.2 })
      : new THREE.MeshStandardMaterial({ color: M.ground, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = M.edge === 'water' ? -0.08 : 0; g.add(outer);
    // floor in the map's shape (x, -z because the plane is rotated flat)
    const sh = new THREE.Shape();
    pts.forEach((p, i) => (i ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1])));
    const floorGeo = new THREE.ShapeGeometry(sh, 1);
    const uv = floorGeo.attributes.uv, pos = floorGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 8, pos.getY(i) / 8);
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: M.floor, roughness: 0.95, map: this.floorTexture(M.floorTex) }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; g.add(floor);
    // glowing bands that follow the outline
    const band = (k0, k1, hex, op, y) => {
      const v = [], idx = [];
      for (let i = 0; i < N; i++) { const p = pts[i]; v.push(Math.cos(p[2]) * (p[3] * k0 - (k0 === 1 ? 0.35 : 0)), y, Math.sin(p[2]) * (p[3] * k0 - (k0 === 1 ? 0.35 : 0)), Math.cos(p[2]) * p[3] * k1, y, Math.sin(p[2]) * p[3] * k1); }
      for (let i = 0; i < N; i++) { const j = (i + 1) % N; idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.setIndex(idx);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }));
      g.add(m); return m;
    };
    band(1, 1, M.rim, 1, 0.05);           // just the glowing outer edge
    if (M.band2) band(0.98, 0.99, M.band2, 0.9, 0.05);
    const star = new THREE.Object3D();
    this.buildEdge(g, M, pts, N);
    // props that block movement and spells
    for (let i = 0; i < M.obst.length; i++) {
      const o = M.obst[i];
      const p = (PROPS[o[3]] || makeTomb)();
      p.position.set(o[0], 0, o[1]);
      p.rotation.y = Math.atan2(-o[0], -o[1]) + (i % 2 ? 0.3 : -0.3);
      p.scale.setScalar(Math.max(0.75, Math.min(1.1, o[2] / 0.85)));
      g.add(p);
    }
    // scenery outside the outline for depth
    for (let i = 0; i < 30; i++) {
      const a = i * 2.399 + 0.4, d = shape(Math.atan2(Math.sin(a), Math.cos(a))) + 4 + (i * 7 % 16);
      const p = (PROPS[M.far] || makeTomb)();
      p.position.set(Math.cos(a) * d, M.edge === 'water' ? -0.2 : 0, Math.sin(a) * d); p.rotation.y = a * 3; p.scale.setScalar(0.8 + (i % 3) * 0.2);
      g.add(p);
    }
    this.scene.add(g);
    return { group: g, star };
  }

  buildEdge(g, M, pts, N) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const at = (i, off) => { const p = pts[i % N]; return [Math.cos(p[2]) * (p[3] + off), Math.sin(p[2]) * (p[3] + off), p[2]]; };
    if (M.edge === 'lanterns') {
      // little glowing paper lanterns on short stakes, like a harvest-festival fence
      const n = 128, stake = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 5), new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 1 }), n);
      const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.55, 0.42), new THREE.MeshBasicMaterial({ color: 0xffb347 }), n);
      const roof = new THREE.InstancedMesh(new THREE.ConeGeometry(0.36, 0.22, 4), new THREE.MeshStandardMaterial({ color: 0x2a1608, roughness: 1 }), n);
      for (let i = 0; i < n; i++) {
        const [x, z, a] = at(Math.round(i / n * N), 0.55);
        q.setFromAxisAngle(up, -a + Math.PI / 4);
        m4.compose(ps.set(x, 0.45, z), q, sc); stake.setMatrixAt(i, m4);
        m4.compose(ps.set(x, 1.15, z), q, sc); lamp.setMatrixAt(i, m4);
        m4.compose(ps.set(x, 1.53, z), q, sc); roof.setMatrixAt(i, m4);
      }
      g.add(stake, lamp, roof);
    } else if (M.edge === 'fence' || M.edge === 'candy') {
      const n = 112, candy = M.edge === 'candy';
      const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(candy ? 0.13 : 0.1, candy ? 0.13 : 0.14, candy ? 1.8 : 1.4, 8),
        new THREE.MeshStandardMaterial({ color: candy ? 0xffffff : 0x2a1c2e, roughness: candy ? 0.35 : 1 }), n);
      const tip = new THREE.InstancedMesh(candy ? new THREE.TorusGeometry(0.2, 0.08, 6, 12, Math.PI) : new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: M.tips }), n);
      const stripes = candy ? new THREE.InstancedMesh(new THREE.TorusGeometry(0.135, 0.035, 4, 10), new THREE.MeshBasicMaterial({ color: 0xff5fa2 }), n * 4) : null;
      for (let i = 0; i < n; i++) {
        const [x, z, a] = at(Math.round(i / n * N), 0.55);
        m4.makeTranslation(x, candy ? 0.9 : 0.7, z); post.setMatrixAt(i, m4);
        if (candy) {
          q.setFromAxisAngle(up, -a); m4.compose(ps.set(x + Math.cos(a) * 0.2, 1.8, z + Math.sin(a) * 0.2), q, sc); tip.setMatrixAt(i, m4);
          for (let k = 0; k < 4; k++) { m4.makeRotationX(Math.PI / 2); m4.setPosition(x, 0.3 + k * 0.38, z); stripes.setMatrixAt(i * 4 + k, m4); }
        } else { m4.makeTranslation(x, 1.5, z); tip.setMatrixAt(i, m4); }
      }
      g.add(post, tip); if (stripes) g.add(stripes);
    } else if (M.edge === 'wall') {
      // low castle wall along the outline with gold caps
      const n = N, wall = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.3, 0.6), new THREE.MeshStandardMaterial({ color: 0x4b4660, roughness: 0.95 }), n);
      const cap = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.12, 0.72), new THREE.MeshBasicMaterial({ color: M.tips }), n);
      for (let i = 0; i < n; i++) {
        const [x0, z0] = at(i, 0.5), [x1, z1] = at(i + 1, 0.5);
        const len = Math.hypot(x1 - x0, z1 - z0) + 0.05, ang = Math.atan2(z1 - z0, x1 - x0);
        q.setFromAxisAngle(up, -ang); sc.set(len, 1, 1);
        m4.compose(ps.set((x0 + x1) / 2, 0.65, (z0 + z1) / 2), q, sc); wall.setMatrixAt(i, m4);
        m4.compose(ps.set((x0 + x1) / 2, 1.33, (z0 + z1) / 2), q, sc); cap.setMatrixAt(i, m4);
      }
      sc.set(1, 1, 1);
      g.add(wall, cap);
    } else if (M.edge === 'ice') {
      const n = 140, shard = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, roughness: 0.15, emissive: 0x3aa8ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.85 }), n);
      for (let i = 0; i < n; i++) {
        const [x, z] = at(Math.round(i / n * N), 0.7 + (i % 3) * 0.35);
        const h = 1.4 + ((i * 37) % 10) / 6;
        q.setFromAxisAngle(up, i * 1.7); sc.set(0.7, h, 0.7);
        m4.compose(ps.set(x, h * 0.35, z), q, sc); shard.setMatrixAt(i, m4);
      }
      sc.set(1, 1, 1);
      g.add(shard);
    } else if (M.edge === 'water') {
      // lily pads and reeds in the glowing bog
      const n = 80, pad = new THREE.InstancedMesh(new THREE.CircleGeometry(0.6, 10, 0.4, Math.PI * 1.8), new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 0.8, side: THREE.DoubleSide }), n);
      for (let i = 0; i < n; i++) {
        const [x, z] = at(Math.round(i / n * N), 1.2 + (i * 13 % 7) * 0.9);
        q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, i * 2.3)); sc.setScalar(0.6 + (i % 4) * 0.25);
        m4.compose(ps.set(x, -0.04, z), q, sc); pad.setMatrixAt(i, m4);
      }
      sc.set(1, 1, 1);
      g.add(pad);
    }
  }

  // Small tiling floor patterns, drawn once per map in grayscale and tinted by the floor colour.
  floorTexture(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (kind === 'rows') {
      for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#d8d0c8' : '#ece4dc'; x.fillRect(0, i * 32, 256, 32); }
      x.fillStyle = '#c4bab0'; for (let i = 0; i < 160; i++) x.fillRect(rnd() * 256, rnd() * 256, 3, 2);
    } else if (kind === 'flagstone') {
      x.strokeStyle = '#a8a4b8'; x.lineWidth = 4;
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) { x.fillStyle = (r + k) % 2 ? '#e8e6f0' : '#dcd9e6'; x.fillRect(k * 64 + (r % 2) * 32, r * 64, 64, 64); x.strokeRect(k * 64 + (r % 2) * 32, r * 64, 64, 64); }
    } else if (kind === 'frost') {
      x.strokeStyle = '#d8ecff'; x.lineWidth = 2;
      for (let i = 0; i < 40; i++) { const a = rnd() * 6.28, r = 10 + rnd() * 30, cx = rnd() * 256, cy = rnd() * 256; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); x.stroke(); }
      x.fillStyle = '#f4faff'; for (let i = 0; i < 300; i++) x.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    } else if (kind === 'sprinkles') {
      const cols = ['#ffd0ea', '#c8fff4', '#fff4c0', '#e0d0ff'];
      for (let i = 0; i < 220; i++) { x.save(); x.translate(rnd() * 256, rnd() * 256); x.rotate(rnd() * 3.14); x.fillStyle = cols[i % 4]; x.fillRect(-5, -1.5, 10, 3); x.restore(); }
      x.globalCompositeOperation = 'multiply'; x.fillStyle = '#e8e8e8'; x.fillRect(0, 0, 256, 256);
    } else {
      x.fillStyle = '#d6dcd0'; for (let i = 0; i < 70; i++) { x.beginPath(); x.arc(rnd() * 256, rnd() * 256, 3 + rnd() * 12, 0, 6.28); x.fill(); }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  buildViews() {
    this.bubbleGeo = new THREE.SphereGeometry(1.35, 20, 14);
    this.views = [];
    this.nameCache = [];
    for (let i = 0; i < TUNE.maxWizards; i++) {
      const m = mayuReady() ? makeMayuWizard(ROBE_COLORS[i], FUR_COLORS[i]) : makeWizard(SLOT_COLORS[i], FUR_COLORS[i]);
      const bar = makeBar();
      m.root.add(bar.group);
      bar.group.position.y = m.barY;
      // shield bubble
      const bubble = new THREE.Mesh(this.bubbleGeo, new THREE.MeshBasicMaterial({ color: PAL.shield, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
      bubble.position.y = 1.35; bubble.visible = false; m.root.add(bubble);
      const chanSig = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: this.tex.sigil, color: SLOT_COLORS[i], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      chanSig.rotation.x = -Math.PI / 2; chanSig.position.y = 0.1; chanSig.visible = false; this.scene.add(chanSig);
      const v = {
        chanSig, chanK: 0,
        slot: i, m, bar, bubble, name: null, label: '', x: 0, z: 0, yaw: 0, px: 0, pz: 0, flash: 0, deadT: -1, spawnT: 1,
        phase: i * 1.7, burnAcc: 0, power: -1, tint: -1, ring: null, init: false, happy: 0, hopT: 0, bubbleK: 0,
      };
      this.scene.add(m.root);
      this.views.push(v);
    }
    // a glowing ring under every player on this device, in their colour
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.95, 1.12, 28);
    for (let i = 0; i < TUNE.maxWizards; i++) {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: SLOT_COLORS[i], transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.y = 0.06; r.visible = false; this.scene.add(r); this.rings.push(r);
    }
    this.locals = [];

    // slow-mo trap fields: a purple dome, a ticking clock ring
    this.fieldViews = [];
    for (let i = 0; i < TUNE.maxFields; i++) {
      const g = new THREE.Group(); g.visible = false;
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(TUNE.fieldR * 2.1, TUNE.fieldR * 2.1), new THREE.MeshBasicMaterial({ color: PAL.trap, map: this.tex.circle, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.07;
      const rim = new THREE.Mesh(new THREE.RingGeometry(TUNE.fieldR - 0.15, TUNE.fieldR, 40), new THREE.MeshBasicMaterial({ color: PAL.trap, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      rim.rotation.x = -Math.PI / 2; rim.position.y = 0.08;
      const hand = new THREE.Mesh(new THREE.PlaneGeometry(0.12, TUNE.fieldR * 0.85), new THREE.MeshBasicMaterial({ color: PAL.bone, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      hand.geometry.translate(0, TUNE.fieldR * 0.42, 0);
      const handPivot = new THREE.Group(); handPivot.rotation.x = -Math.PI / 2; handPivot.position.y = 0.09; handPivot.add(hand);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(TUNE.fieldR, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: PAL.trap, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      g.add(disc, rim, handPivot, dome);
      this.scene.add(g);
      this.fieldViews.push({ g, hand: handPivot, dome, pop: 0, active: false });
    }

    this.projViews = [];
    const pm = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < TUNE.maxProj; i++) {
      const m = new THREE.Mesh(GEO.bolt, pm.clone());
      m.visible = false; this.scene.add(m); this.projViews.push(m);
    }
    this.pickViews = [];
    for (let i = 0; i < PICKUP_SPOTS.length; i++) {
      const pv = makePickupMeshes();
      pv.group.position.set(PICKUP_SPOTS[i][0], 1.15, PICKUP_SPOTS[i][1]);
      pv.group.visible = false; pv.kind = 0; pv.pop = 1; pv.active = false;
      this.scene.add(pv.group); this.pickViews.push(pv);
    }
    this.zaps = [];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: PAL.storm, transparent: true }));
      l.visible = false; l.frustumCulled = false; this.scene.add(l);
      this.zaps.push({ line: l, t: 0 });
    }
    this.zapHead = 0;
  }

  buildPost(coarse) {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: coarse ? 2 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.9, 0.55, 0.72);
    this.composer.addPass(this.bloom);
    this.vignette = new ShaderPass(VignetteShader);
    this.vignette.uniforms.offset.value = 1.15;
    this.vignette.uniforms.darkness.value = 1.0; // keep <= 1: higher values push corners below black
    this.composer.addPass(this.vignette);
    this.composer.addPass(new OutputPass());
  }

  resize() {
    const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight;
    const pr = Math.min(devicePixelRatio || 1, this.maxDpr);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.aspect = w / h;
    // Narrow/portrait screens: pull the camera back so about 17 world units stay visible side to side.
    const halfW = Math.tan(this.camera.fov * Math.PI / 360) * this.aspect;
    this.camAspectScale = Math.min(2.4, Math.max(1, 8.5 / halfW / 19));
    this.scene.fog.density = (this.fogBase || 0.022) / this.camAspectScale;
    this.fx.setScale(h * pr / (2 * Math.tan(this.camera.fov * Math.PI / 360)));
  }

  // ---------- per frame ----------
  setLocal(slot) { this.locals.length = 0; if (slot >= 0) this.locals.push(slot); }
  setLocals(arr) { this.locals.length = 0; for (let i = 0; i < arr.length; i++) this.locals.push(arr[i]); }

  // spread: how far apart the players we are framing are; the camera backs off to keep them all in view
  follow(x, z, dt, spread) {
    const k = 1 - Math.exp(-5 * dt);
    this.camX += (x - this.camX) * k; this.camZ += (z - this.camZ) * k;
    const want = 1 + Math.min(1.1, Math.max(0, (spread || 0) - 5) / 14);
    this.zoom += (want - this.zoom) * (1 - Math.exp(-3 * dt));
    this.placeCamera(0);
  }

  orbit(dt) {
    this.orbitA += dt * 0.12;
    const d = 52 * this.camAspectScale;
    this.camera.position.set(Math.cos(this.orbitA) * d, 27 * this.camAspectScale, Math.sin(this.orbitA) * d);
    this.camera.lookAt(0, 1, 0);
    this.setNear(0.5);
    if (this.camPos) { this.camPos.copy(this.camera.position); this.camLook.set(0, 1, 0); }
  }

  placeCamera() {
    const s = this.camAspectScale * this.zoom, a = this.shakeAmp;
    const sx = a > 0.002 ? (Math.random() - 0.5) * a : 0, sz = a > 0.002 ? (Math.random() - 0.5) * a : 0;
    this.camera.position.set(this.camX + sx, 15.5 * s, this.camZ + 11 * s + sz);
    this.camera.lookAt(this.camX + sx, 0.6, this.camZ - 1.5);
    this.setNear(0.5);
    this.camPos.copy(this.camera.position); this.camLook.set(this.camX, 0.6, this.camZ - 1.5);
  }

  shake(a) { if (a > this.shakeAmp) this.shakeAmp = a; }

  setNear(n) { if (this.camera.near !== n) { this.camera.near = n; this.camera.updateProjectionMatrix(); } }

  // Third person (mode 1, over the right shoulder) and first person (mode 2).
  chase(x, z, yaw, pitch, dt, mode) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    const a = this.shakeAmp, sx = a > 0.002 ? (Math.random() - 0.5) * a * 0.5 : 0, sy = a > 0.002 ? (Math.random() - 0.5) * a * 0.5 : 0;
    const cp = Math.cos(pitch), spch = Math.sin(pitch);
    if (mode === 2) {
      this.setNear(0.1);
      _p.set(x + fx * 0.25, 2.55 + sy, z + fz * 0.25);
      _l.set(_p.x + fx * cp * 10, _p.y + spch * 10, _p.z + fz * cp * 10);
    } else {
      this.setNear(0.2);
      _p.set(x - fx * 4.4 + rx * 1.25 + sx, 3.5 - pitch * 2.2 + sy, z - fz * 4.4 + rz * 1.25);
      _l.set(x + fx * 9 * cp + rx * 0.7, 2.0 + spch * 9, z + fz * 9 * cp + rz * 0.7);
    }
    // keep the camera inside the fence
    const d = Math.hypot(_p.x, _p.z), lim = arenaR(_p.x, _p.z) + 2.5;
    if (d > lim) { _p.x *= lim / d; _p.z *= lim / d; }
    const k = this.chaseInit ? 1 - Math.exp(-(mode === 2 ? 30 : 14) * dt) : 1;
    this.camPos.lerp(_p, k); this.camLook.lerp(_l, k);
    this.chaseInit = true;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camX = x; this.camZ = z;
  }

  // High view of the whole arena (Thundershock aiming / replay).
  overview(dt) {
    this.setNear(0.5);
    const s = this.camAspectScale;
    _p.set(0, 74 * s, 28 * s); _l.set(0, 0, -1);
    const k = 1 - Math.exp(-4 * dt);
    this.camPos.lerp(_p, k); this.camLook.lerp(_l, k);
    const a = this.shakeAmp, sx = a > 0.002 ? (Math.random() - 0.5) * a : 0;
    this.camera.position.set(this.camPos.x + sx, this.camPos.y, this.camPos.z);
    this.camera.lookAt(this.camLook);
    this.chaseInit = true;
  }

  // ---------- spell art (Picsart textures) ----------
  loadFxTextures() {
    const L = new THREE.TextureLoader();
    const t = (u) => { const x = L.load(u); x.colorSpace = THREE.SRGBColorSpace; return x; };
    this.tex = { circle: t('./assets/fx/spell-circle.jpg'), sigil: t('./assets/fx/cast-sigil.jpg'), bolt: t('./assets/fx/lightning.jpg') };
  }

  buildSpellFx() {
    // cast sigils: a flash of runes in front of the caster
    this.sigils = [];
    const sg = new THREE.PlaneGeometry(1.7, 1.7);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: this.tex.sigil, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; this.scene.add(m); this.sigils.push({ m, t: 0 });
    }
    this.sigHead = 0;
    // Thundershock aiming circle
    const cg = new THREE.PlaneGeometry(TUNE.ultR * 2.2, TUNE.ultR * 2.2);
    this.ultRing = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ map: this.tex.circle, color: 0x7ff3ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ultRing.rotation.x = -Math.PI / 2; this.ultRing.position.y = 0.12; this.ultRing.visible = false; this.scene.add(this.ultRing);
    this.ultPillar = new THREE.Mesh(new THREE.CylinderGeometry(TUNE.ultR, TUNE.ultR, 7, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x7ff3ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.ultPillar.position.y = 3.5; this.ultRing.add(this.ultPillar); this.ultPillar.rotation.x = Math.PI / 2;
    this.ultAimOn = false;
    // Thundershock impacts
    this.impacts = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group(); g.visible = false;
      const ring = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ map: this.tex.circle, color: 0xbff8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.14;
      const wave = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      wave.rotation.x = -Math.PI / 2; wave.position.y = 0.2;
      const bolts = [];
      for (let j = 0; j < 5; j++) {
        const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.bolt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        b.center.set(0.5, 0); b.scale.set(6.5, 14, 1); g.add(b); bolts.push(b);
      }
      const sky = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ map: this.tex.circle, color: 0xbff8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      sky.rotation.x = -Math.PI / 2; sky.position.y = 14;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(TUNE.ultR * 0.95, TUNE.ultR * 0.95, 14, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x7ff3ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 7;
      g.add(ring, wave, sky, beam); this.scene.add(g);
      const D = TUNE.ultDelay;
      this.impacts.push({ g, ring, wave, sky, beam, bolts, t: 0, delays: [D, D + 0.07, D + 0.13, D + 0.2, D + 0.28], hit: false });
    }
    this.impHead = 0;
    this.flash = 0;
  }

  showUltAim(on, x, z, hex) {
    this.ultAimOn = on;
    this.ultRing.visible = on;
    if (on) { this.ultRing.position.x = x; this.ultRing.position.z = z; if (hex !== undefined) this.ultRing.material.color.setHex(hex); }
  }

  castSigil(x, z, yaw, hex) {
    const s = this.sigils[this.sigHead]; this.sigHead = (this.sigHead + 1) % this.sigils.length;
    s.t = 0.38; s.m.visible = true;
    s.m.position.set(x, 1.15, z); s.m.rotation.set(0, yaw, 0);
    s.m.material.color.setHex(hex);
  }

  thunderFx(x, z, hex) {
    const I = this.impacts[this.impHead]; this.impHead = (this.impHead + 1) % this.impacts.length;
    I.t = 0; I.g.visible = true; I.g.position.set(x, 0, z); I.hit = false;
    I.ring.material.color.setHex(hex); I.sky.material.color.setHex(hex);
    for (let j = 0; j < I.bolts.length; j++) {
      const a = Math.random() * 6.28, r = j === 0 ? 0 : (0.35 + Math.random() * 0.6) * TUNE.ultR;
      I.bolts[j].position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      I.bolts[j].material.rotation = (Math.random() - 0.5) * 0.3;
      I.bolts[j].visible = false;
    }
  }

  updateSpellFx(dt, t) {
    for (let i = 0; i < this.sigils.length; i++) {
      const s = this.sigils[i];
      if (s.t <= 0) continue;
      s.t -= dt;
      if (s.t <= 0) { s.m.visible = false; continue; }
      const k = 1 - s.t / 0.38;
      s.m.scale.setScalar(0.4 + ease.outBack(Math.min(1, k * 2.2)) * 0.9);
      s.m.material.opacity = Math.min(1, s.t * 6);
      s.m.rotateZ(dt * 5);
    }
    if (this.ultAimOn) {
      this.ultRing.rotation.z = t * 0.6;
      this.ultRing.scale.setScalar(1 + Math.sin(t * 8) * 0.03);
      this.ultRing.material.opacity = 0.75 + Math.sin(t * 10) * 0.25;
    }
    for (let i = 0; i < this.impacts.length; i++) {
      const I = this.impacts[i];
      if (!I.g.visible) continue;
      I.t += dt;
      const t1 = I.t, D = TUNE.ultDelay;
      // windup: both circles fade in and spin, a faint beam joins them
      const up = Math.min(1, t1 / 0.25);
      I.sky.material.opacity = t1 < D + 0.3 ? up : Math.max(0, 1 - (t1 - D - 0.3) / 0.5);
      I.sky.rotation.z = t1 * 3; I.sky.scale.setScalar(0.6 + ease.outBack(up) * 0.4);
      I.beam.material.opacity = t1 < D ? up * 0.07 : Math.max(0, 0.35 * (1 - (t1 - D) / 0.4));
      if (!I.hit && t1 >= D) { I.hit = true; this.flash = 1; this.shake(1.5); }
      for (let j = 0; j < I.bolts.length; j++) {
        const lt = t1 - I.delays[j];
        const b = I.bolts[j];
        b.visible = lt > 0 && lt < 0.32 && ((lt * 40) | 0) % 3 !== 2; // flicker
        b.scale.set(6.5, 14, 1);
        if (lt > 0 && lt < 0.05) this.fx.burst(I.g.position.x + b.position.x, 0.4, I.g.position.z + b.position.z, 0xbff8ff, 14, 7, 0.6, 0.5, 3, 6);
      }
      I.ring.material.opacity = t1 < D ? up : Math.max(0, 1 - (t1 - D) / 0.9);
      I.ring.rotation.z = -t1 * 2;
      I.ring.scale.setScalar(t1 < D ? 0.6 + ease.outBack(up) * 0.4 : 1 + (t1 - D) * 0.25);
      const wk = Math.max(0, Math.min(1, (t1 - D) / 0.6));
      I.wave.scale.setScalar(0.5 + ease.outCubic(wk) * TUNE.ultR * 1.6);
      I.wave.material.opacity = t1 < D ? 0 : Math.max(0, 0.9 * (1 - wk));
      if (t1 > D + 1.0) I.g.visible = false;
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.5);
  }

  // first-person staff that sits in the lower right of the view
  buildFpStaff() {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x5a3820, roughness: 0.9 }));
    stick.position.y = -0.55; g.add(stick);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 20, Math.PI * 1.45), new THREE.MeshStandardMaterial({ color: 0xffc84a, roughness: 0.35, metalness: 0.4 }));
    ring.position.y = 0.32; ring.rotation.z = -0.9; g.add(ring);
    this.fpOrbMat = new THREE.MeshBasicMaterial({ color: PAL.basic });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), this.fpOrbMat); orb.position.y = 0.3; g.add(orb);
    g.position.set(0.48, -0.42, -1.05); g.rotation.set(0.25, 0, -0.18); g.scale.setScalar(0.7);
    g.visible = false;
    this.camera.add(g);
    this.fpStaff = g; this.fpKick = 0; this.fpBob = 0;
  }

  resetViews() {
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i];
      v.deadT = -1; v.spawnT = 0; v.flash = 0; v.init = false; v.m.root.visible = true;
    }
    for (let i = 0; i < this.pickViews.length; i++) { this.pickViews[i].active = false; this.pickViews[i].pop = 0; }
  }

  sync(world, dt, smooth) {
    this.time += dt;
    if (world.map !== this.mapShown) this.setMap(world.map);
    const t = this.time;
    const cam = this.camera;
    const ws = world.wizards;
    const k = smooth >= 1 ? 1 : 1 - Math.exp(-18 * dt);

    for (let i = 0; i < ws.length; i++) {
      const w = ws[i], v = this.views[i], m = v.m;
      // label / fur changes
      if (w.name !== v.lastName || w.human !== v.lastHuman) {
        v.lastName = w.name; v.lastHuman = w.human;
        const label = (w.human ? '★ ' : '') + w.name;
        if (v.name) { m.root.remove(v.name); v.name.material.map.dispose(); v.name.material.dispose(); }
        v.name = makeNameSprite(label, w.color); v.name.position.y = m.labelY; m.root.add(v.name);
        v.label = label;
        m.setFur(w.fur);
      }
      if (w.staff !== v.staffId) { v.staffId = w.staff; if (m.setStaff) m.setStaff(w.staff); }
      if (!v.init) { v.x = w.x; v.z = w.z; v.yaw = w.yaw; v.px = w.x; v.pz = w.z; v.init = true; }
      v.x += (w.x - v.x) * k; v.z += (w.z - v.z) * k;
      v.yaw = angleLerp(v.yaw, w.yaw, 1 - Math.exp(-16 * dt));
      const spd = dt > 0 ? Math.hypot(v.x - v.px, v.z - v.pz) / dt : 0;
      v.px = v.x; v.pz = v.z;

      // death / revive
      if (!w.alive && v.deadT < 0) v.deadT = 0;
      if (w.alive && v.deadT >= 0) { v.deadT = -1; v.spawnT = 0; m.root.visible = true; }
      let sc = 1, lift = 0;
      if (v.deadT >= 0) {
        v.deadT += dt;
        const q = Math.min(1, v.deadT / 0.7);
        sc = 1 - ease.outCubic(q); lift = q * 1.5;
        m.bob.rotation.y = q * 9;
        if (q >= 1) m.root.visible = false;
      } else {
        m.root.visible = true; // alive: always shown (first person hides our own body again further down)
        m.bob.rotation.y = 0;
        if (v.spawnT < 1) { v.spawnT = Math.min(1, v.spawnT + dt * 2.2); sc = ease.outBack(v.spawnT); }
      }
      // air-dash hop
      if (v.hopT > 0) { v.hopT -= dt; lift += Math.sin(Math.max(0, v.hopT) / 0.32 * Math.PI) * 0.9; }
      m.root.position.set(v.x, lift, v.z);
      m.root.scale.setScalar(Math.max(0.001, sc));
      m.root.rotation.y = v.yaw;

      // body animation (idle/walk blend, cast, tail wag that speeds up when happy)
      if (v.happy > 0) v.happy -= dt;
      if (m.root.visible) m.anim(dt, w.alive ? Math.min(spd, 9) : 0, v.happy > 0 ? 1 : 0);
      const glowKind = w.power > 0 ? w.power : (w.q > 0 ? w.q : 0);
      if (glowKind !== v.power) { v.power = glowKind; m.setGlow(POWER_COLORS[glowKind]); }

      // channelling a Thundershock: moon sigil under the caster, staff held high, frozen in place
      const ch = w.alive && w.chan;
      m.channel(ch);
      v.chanK += ((ch ? 1 : 0) - v.chanK) * (1 - Math.exp(-10 * dt));
      v.chanSig.visible = v.chanK > 0.02;
      if (v.chanSig.visible) {
        v.chanSig.position.set(v.x, 0.1, v.z);
        v.chanSig.rotation.z = t * 1.4;
        v.chanSig.scale.setScalar(Math.max(0.01, v.chanK * (1 + Math.sin(t * 7) * 0.05)));
        v.chanSig.material.opacity = v.chanK;
        if (ch && Math.random() < 0.35) this.fx.burst(v.x, 0.3, v.z, 0x7ff3ff, 1, 1.2, 0.8, 0.3, 2.5, 0);
      }

      // shield bubble
      const shieldOn = w.alive && w.shieldT > 0;
      v.bubbleK += ((shieldOn ? 1 : 0) - v.bubbleK) * (1 - Math.exp(-14 * dt));
      v.bubble.visible = v.bubbleK > 0.02;
      if (v.bubble.visible) {
        v.bubble.scale.setScalar(Math.max(0.01, v.bubbleK * (1 + Math.sin(t * 9) * 0.03)));
        v.bubble.material.opacity = 0.22 + 0.12 * Math.sin(t * 6) + (w.shieldT > 0 && w.shieldT < 0.4 ? Math.sin(t * 40) * 0.12 : 0);
      }

      // status tint + flash
      v.flash = v.flash > 0 ? v.flash - dt * 4 : 0;
      let tintHex = 0x000000, tintI = 0;
      if (w.slowT > 0) { tintHex = PAL.ice; tintI = 0.35; }
      else if (w.inField) { tintHex = PAL.trap; tintI = 0.35; }
      else if (w.burnT > 0) { tintHex = PAL.fire; tintI = 0.3 + Math.sin(t * 24) * 0.15; }
      if (w.invuln > 0) { tintHex = PAL.bone; tintI = 0.06 + (Math.sin(t * 18) > 0 ? 0.1 : 0); }
      if (v.flash > 0) { tintHex = 0xffffff; tintI = v.flash * 1.1; }
      for (let j = 0; j < m.flashMats.length; j++) { m.flashMats[j].emissive.setHex(tintHex); m.flashMats[j].emissiveIntensity = tintI; }

      // burning flames + power sparkles
      if (w.alive) {
        v.burnAcc += dt;
        if (v.burnAcc > 0.06) {
          v.burnAcc = 0;
          if (w.burnT > 0) this.fx.burst(v.x, 1.2, v.z, PAL.fire, 2, 0.8, 0.5, 0.45, 1.8, 0);
          if (w.power > 0 && Math.random() < 0.5) this.fx.burst(v.x, 2.4, v.z, POWER_COLORS[w.power], 1, 0.6, 0.6, 0.28, 0.8, 0);
        }
      }

      // health bar above head, always facing the camera
      const b = v.bar;
      const hp = Math.max(0, w.hp) / TUNE.hp;
      b.fill.scale.x = Math.max(0.001, 1.4 * hp);
      b.fill.position.x = -0.7 * (1 - hp);
      if (hp > 0.5) b.fillMat.color.setHex(PAL.heal); else if (hp > 0.25) b.fillMat.color.setHex(PAL.orange); else b.fillMat.color.setHex(PAL.pink);
      b.group.quaternion.copy(cam.quaternion);
      const own = i === this.chaseSlot; // our own tag would fill the screen in the close-up views
      b.group.visible = w.alive && !own;
      v.name.visible = w.alive && !own;
      // name/bar must not inherit the wizard's yaw or scale oddly: counter-rotate
      b.group.rotation.set(0, 0, 0); b.group.quaternion.copy(cam.quaternion);
      b.group.position.y = m.barY / Math.max(0.001, sc);
      m.shadow.visible = w.alive;
    }

    // first person: hide our own body, show the held staff
    if (this.hideSlot >= 0) {
      const v = this.views[this.hideSlot];
      v.m.root.visible = false;
    }
    this.fpStaff.visible = this.camMode === 2 && this.hideSlot >= 0 && ws[this.hideSlot].alive;
    if (this.fpStaff.visible) {
      const w = ws[this.hideSlot], v = this.views[this.hideSlot];
      const glowKind = w.power > 0 ? w.power : (w.q > 0 ? w.q : 0);
      this.fpOrbMat.color.setHex(POWER_COLORS[glowKind]);
      const sp = Math.min(1, Math.hypot(w.vx, w.vz) / 6);
      this.fpBob += dt * (4 + sp * 7);
      this.fpKick *= Math.exp(-12 * dt);
      this.fpStaff.position.set(0.52 + Math.cos(this.fpBob) * 0.025 * sp, -0.5 + Math.abs(Math.sin(this.fpBob)) * 0.04 * sp - this.fpKick * 0.08, -1.1 + this.fpKick * 0.25);
      this.fpStaff.rotation.x = 0.25 - this.fpKick * 0.6;
      if (v.bubbleK > 0.02) this.fpOrbMat.color.setHex(PAL.shield);
    }

    // markers under this device's players
    for (let i = 0; i < this.rings.length; i++) this.rings[i].visible = false;
    for (let i = 0; i < this.locals.length; i++) {
      const s2 = this.locals[i], v = this.views[s2], r = this.rings[s2];
      r.visible = ws[s2].alive;
      r.position.set(v.x, 0.06, v.z);
      r.scale.setScalar(1 + Math.sin(t * 5 + i) * 0.06);
    }

    // slow-mo fields
    for (let i = 0; i < this.fieldViews.length; i++) {
      const f = world.fields[i], fv = this.fieldViews[i];
      if (f.active && !fv.active) { fv.active = true; fv.pop = 0; fv.g.position.set(f.x, 0, f.z); fv.g.visible = true; }
      if (!f.active && fv.active) { fv.active = false; }
      if (fv.active) fv.pop = Math.min(1, fv.pop + dt * 4); else fv.pop = Math.max(0, fv.pop - dt * 4);
      fv.g.visible = fv.pop > 0.01;
      if (fv.g.visible) {
        fv.g.position.set(f.x, 0, f.z);
        fv.g.scale.setScalar(Math.max(0.01, ease.outBack(fv.pop)));
        fv.hand.rotation.z = -t * 0.8;
        fv.g.children[0].rotation.z = t * 0.25;
        fv.dome.material.opacity = 0.08 + Math.sin(t * 3 + i) * 0.03;
      }
    }

    // projectiles
    for (let i = 0; i < this.projViews.length; i++) {
      const p = world.proj[i], m = this.projViews[i];
      if (!p || !p.active) { m.visible = false; continue; }
      m.visible = true;
      m.position.set(p.x, 1.0, p.z);
      m.scale.setScalar(KIND_SCALE[p.kind] * (1 + Math.sin(t * 30 + i) * 0.1));
      m.material.color.setHex(p.kind === 0 ? SLOT_COLORS[p.owner] : POWER_COLORS[p.kind]);
      this.fx.burst(p.x, 1.0, p.z, p.kind === 0 ? SLOT_COLORS[p.owner] : POWER_COLORS[p.kind], 1, 0.4, 0.28, p.kind === 0 ? 0.35 : 0.5, 0, 0);
    }

    // pickups
    for (let i = 0; i < this.pickViews.length; i++) {
      const p = world.pickups[i], pv = this.pickViews[i];
      if (p.active && (!pv.active || pv.kind !== p.kind)) {
        pv.active = true; pv.kind = p.kind; pv.pop = 0;
        for (let j = 1; j < pv.variants.length; j++) pv.variants[j].visible = j === p.kind;
        pv.ring.material.color.setHex(POWER_COLORS[p.kind]);
        pv.group.visible = true;
      }
      if (!p.active && pv.active) { pv.active = false; pv.group.visible = false; }
      if (pv.active) {
        pv.pop = Math.min(1, pv.pop + dt * 2.5);
        pv.group.scale.setScalar(Math.max(0.001, ease.outBack(pv.pop)));
        pv.group.position.set(p.x, 1.2 + Math.sin(t * 2.4 + i) * 0.22, p.z);
        pv.group.rotation.y = t * 1.4 + i;
        pv.ring.rotation.z = -t;
      }
    }

    // zaps
    for (let i = 0; i < this.zaps.length; i++) {
      const z = this.zaps[i];
      if (z.t > 0) { z.t -= dt; z.line.material.opacity = Math.max(0, z.t / 0.25); if (z.t <= 0) z.line.visible = false; }
    }

    // ambience
    this.emberT -= dt;
    if (this.emberT <= 0) {
      this.emberT = this.coarse ? 0.1 : 0.04;
      const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * ARENA.max;
      this.fx.burst(Math.cos(a) * d, 0.2, Math.sin(a) * d, Math.random() < 0.6 ? this.embers[0] : this.embers[1], 1, 0.2, 3.2, 0.22, 0.9, 0);
    }
    this.lamps[0].intensity = 52 + Math.sin(t * 9) * 6 + Math.sin(t * 13.1) * 4;
    this.star.rotation.z = t * 0.05;
    this.shakeAmp *= Math.exp(-9 * dt);
    this.updateSpellFx(dt, t);
    this.fx.update(dt);
  }

  render(dt) {
    this.adapt(dt);
    if (this.post) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }

  // Automatic quality: if the device can't hold ~45 fps, first drop resolution, then bloom.
  adapt(dt) {
    if (this.post === undefined) { this.post = true; this.slowT = 0; this.sampleT = 0; this.level = 0; }
    if (document.hidden || dt <= 0) return;
    this.sampleT += dt;
    if (dt > 1 / 45) this.slowT += dt;
    if (this.sampleT < 3) return;
    const slow = this.slowT / this.sampleT;
    this.sampleT = 0; this.slowT = 0;
    if (slow < 0.5 || this.level >= 3) return;
    this.level++;
    if (this.level === 1) this.maxDpr = Math.min(this.maxDpr, 1.25);
    else if (this.level === 2) this.maxDpr = 1;
    else { this.post = false; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; }
    this.resize();
  }

  project(x, y, z, out) {
    // out: {x, y, on}
    _v.set(x, y, z).project(this.camera);
    out.x = (_v.x * 0.5 + 0.5) * this.host.clientWidth;
    out.y = (-_v.y * 0.5 + 0.5) * this.host.clientHeight;
    out.on = _v.z < 1;
  }

  // Convert a pointer position (client px) to a point on the ground plane. Writes into out.
  groundAt(px, py, out) {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    _v.set(px / w * 2 - 1, -(py / h) * 2 + 1, 0.5).unproject(this.camera);
    const c = this.camera.position;
    _d.copy(_v).sub(c);
    if (_d.y > -1e-3) return out; // looking at or above the horizon: keep the last point
    const t = (1.0 - c.y) / _d.y;
    out.x = c.x + _d.x * t; out.z = c.z + _d.z * t;
  }

  // ---------- events ----------
  event(type, a, b, x, z, k, x2, z2) {
    const fx = this.fx;
    switch (type) {
      case EV.CAST: {
        this.views[a].m.cast();
        const col = b === 0 ? SLOT_COLORS[a] : POWER_COLORS[b];
        this.castSigil(x, z, Math.atan2(x2, z2), col);
        if (a === this.hideSlot) this.fpKick = 1;
        fx.burst(x, 1.1, z, col, b === 0 ? 5 : 9, 2.5, 0.35, 0.4, 0.3, 0);
        break;
      }
      case EV.HIT: {
        this.views[a].flash = 1;
        fx.burst(x, 1.3, z, PAL.bone, 8, 4, 0.45, 0.35, 1.2, 6);
        fx.burst(x, 1.3, z, PAL.pink, 6, 3, 0.4, 0.3, 1.2, 6);
        break;
      }
      case EV.KO: {
        fx.burst(x, 1.4, z, PAL.orange, 26, 7, 0.9, 0.55, 2.5, 5);
        fx.burst(x, 1.4, z, PAL.purple, 26, 6, 1.0, 0.5, 2.5, 5);
        fx.burst(x, 1.4, z, PAL.bone, 14, 4, 0.9, 0.4, 3, 5);
        break;
      }
      case EV.PICK: {
        fx.burst(x, 1.2, z, POWER_COLORS[b], 26, 5, 0.8, 0.5, 3, 2);
        const v = this.views[a]; v.flash = 0.6; v.happy = 1.6;
        break;
      }
      case EV.HEAL: fx.burst(x, 1.0, z, PAL.heal, 28, 3.5, 1.0, 0.45, 3.5, 0); this.views[a].happy = 1.6; break;
      case EV.SHIELD: fx.burst(x, 1.4, z, PAL.shield, 22, 4, 0.5, 0.45, 0.5, 0); break;
      case EV.BLOCK: fx.burst(x, 1.3, z, PAL.shield, 12, 5, 0.35, 0.4, 0.8, 0); break;
      case EV.DASH: {
        this.views[a].hopT = 0.32;
        for (let i = 0; i < 6; i++) fx.burst(x + x2 * i * 0.5, 0.5, z + z2 * i * 0.5, PAL.dash, 3, 1.5, 0.45, 0.4, 0.8, 0);
        break;
      }
      case EV.FIELD: fx.burst(x, 0.8, z, PAL.trap, 40, 6, 0.8, 0.5, 1, 0); break;
      case EV.THUNDER: this.thunderFx(x, z, SLOT_COLORS[a]); break;
      case EV.STRIKE: fx.burst(x, 1, z, 0x7ff3ff, 70, 12, 1.0, 0.6, 5, 6); break;
      case EV.ULTREADY: fx.burst(x, 2, z, 0x7ff3ff, 40, 5, 0.9, 0.5, 4, 0); this.views[a].happy = 5; break;
      case EV.ZAP: {
        const zp = this.zaps[this.zapHead]; this.zapHead = (this.zapHead + 1) % this.zaps.length;
        const arr = zp.line.geometry.attributes.position.array;
        for (let i = 0; i < 8; i++) {
          const f = i / 7, j = (i === 0 || i === 7) ? 0 : 0.5;
          arr[i * 3] = x + (x2 - x) * f + (Math.random() - 0.5) * j;
          arr[i * 3 + 1] = 1.3 + (Math.random() - 0.5) * j;
          arr[i * 3 + 2] = z + (z2 - z) * f + (Math.random() - 0.5) * j;
        }
        zp.line.geometry.attributes.position.needsUpdate = true;
        zp.line.visible = true; zp.t = 0.25; zp.line.material.opacity = 1;
        fx.burst(x2, 1.3, z2, PAL.storm, 12, 4, 0.5, 0.4, 1, 0);
        break;
      }
      case EV.POOF: {
        const col = a === 0 ? PAL.basic : POWER_COLORS[a];
        fx.burst(x, 1.0, z, col, b === 2 ? 14 : 8, 3, 0.45, 0.4, 0.6, 3);
        break;
      }
      case EV.POWEROFF: fx.burst(x, 2.2, z, 0x8a86a0, 8, 1.4, 0.8, 0.5, 1.2, 0); break;
      case EV.JOIN: fx.burst(x, 1.2, z, POWER_COLORS[b], 14, 3, 0.7, 0.4, 2, 0); break;
      case EV.ROUND: this.resetViews(); break;
      default: break;
    }
  }
}

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _l = new THREE.Vector3();
const _d = new THREE.Vector3();
