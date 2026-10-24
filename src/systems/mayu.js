// Loads the rigged Mayu wizard (assets/models/mayu-wizard.json) once and stamps out recoloured copies.
// Animations: Idle + Walk blend by speed, Cast plays over them, TailWag loops on the tail forever.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three-addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../../vendor/three-addons/utils/SkeletonUtils.js';
import { GEO } from './models.js';
import { buildStaff } from './staffs.js';
import { hasSkin } from './skins.js';

const URL = './assets/models/mayu-wizard.json'; // glTF with embedded data (also loads on hosts that don't serve .glb)
const SCALE = 1.75;
let src = null;

// The model ships as glTF JSON with its data embedded as base64. Some hosts (and sandboxed previews) block the
// loader's second fetch of that "data:" URI, so we read the file once, rebuild a binary GLB in memory and parse that.
export function loadMayu(onProgress) {
  return new Promise((resolve) => {
    const fail = (err) => { console.warn('Mayu model missing, using built-in kitties instead.', err && err.message); resolve(false); };
    const xhr = new XMLHttpRequest();
    xhr.open('GET', URL);
    xhr.responseType = 'text';
    xhr.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onerror = () => fail(new Error('network'));
    xhr.onload = () => {
      if (xhr.status && (xhr.status < 200 || xhr.status >= 300)) { fail(new Error('HTTP ' + xhr.status)); return; }
      try {
        new GLTFLoader().parse(toGlb(JSON.parse(xhr.responseText)), './assets/models/', (g) => { src = prepare(g); resolve(true); }, fail);
      } catch (e) { fail(e); }
    };
    xhr.send();
  });
}

function toGlb(json) {
  const uri = json.buffers[0].uri;
  const b64 = uri.slice(uri.indexOf(',') + 1);
  const raw = atob(b64);
  const bin = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
  delete json.buffers[0].uri;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jLen = (jsonBytes.length + 3) & ~3, bLen = (bin.length + 3) & ~3;
  const out = new Uint8Array(12 + 8 + jLen + 8 + bLen);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, jLen, true); dv.setUint32(16, 0x4E4F534A, true);
  out.fill(0x20, 20, 20 + jLen); out.set(jsonBytes, 20);
  const o = 20 + jLen;
  dv.setUint32(o, bLen, true); dv.setUint32(o + 4, 0x004E4942, true);
  out.set(bin, o + 8);
  return out.buffer;
}

export function mayuReady() { return !!src; }

const isTail = (t) => /^Tail/.test(t.name);

function prepare(g) {
  const clips = {};
  for (const c of g.animations) {
    const clip = c.clone();
    // the tail belongs to TailWag alone; everything else belongs to the body clips
    clip.tracks = clip.tracks.filter((t) => (c.name === 'TailWag' ? isTail(t) : !isTail(t)));
    clips[c.name] = clip;
  }
  // Where does the modelled staff sit in the hand bone's own space? New staffs are placed along the same line.
  let staffLine = null;
  const pts = [], v = new THREE.Vector3();
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (!o.isSkinnedMesh || !isStaffMesh(o)) return;
    const bi = o.skeleton.bones.findIndex((b) => b.name === 'Hand_R');
    if (bi < 0) return;
    const inv = o.skeleton.boneInverses[bi], pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 2) { v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix).applyMatrix4(inv); pts.push(v.clone()); }
  });
  if (pts.length > 4) {
    const c = new THREE.Vector3(); pts.forEach((p) => c.add(p)); c.multiplyScalar(1 / pts.length);
    let a = pts[0], b = pts[0];
    for (const p of pts) if (p.distanceTo(c) > a.distanceTo(c)) a = p;
    for (const p of pts) if (p.distanceTo(a) > b.distanceTo(a)) b = p;
    // the orb and crescent make the top end the denser one, so the centroid sits nearer the top
    const top = a.distanceTo(c) < b.distanceTo(c) ? a : b, bottom = top === a ? b : a;
    staffLine = { bottom: bottom.clone(), dir: top.clone().sub(bottom).normalize(), len: top.distanceTo(bottom) };
  }
  g.scene.traverse((o) => {
    if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; }
    if (o.isMesh && o.material && o.material.name === 'Cloth') o.material.side = THREE.DoubleSide;
  });
  return { scene: g.scene, clips, staffLine };
}

function isStaffMesh(o) {
  for (let p = o; p; p = p.parent) if (p.name === 'Staff') return true;
  return false;
}

export function makeMayuWizard(robeHex, furHex) {
  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);
  const model = SkeletonUtils.clone(src.scene);
  model.scale.setScalar(SCALE);
  bob.add(model);

  const mats = {};
  model.traverse((o) => {
    if (!o.isMesh) return;
    const mm = Array.isArray(o.material) ? o.material : [o.material];
    const out = mm.map((m) => {
      const key = m.name;
      if (key === 'Fur' || key === 'Cloth' || key === 'Orb' || key === 'Trim') {
        if (!mats[key]) mats[key] = m.clone();
        return mats[key];
      }
      return m;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  const fur = mats.Fur, cloth = mats.Cloth, orb = mats.Orb;
  if (fur) { fur.color.setHex(furHex); fur.emissive = new THREE.Color(0); }
  if (cloth) { cloth.color.setHex(robeHex); cloth.emissive = new THREE.Color(0); }
  if (mats.Trim) mats.Trim.emissive = new THREE.Color(0);
  const glowColor = new THREE.Color();

  const mixer = new THREE.AnimationMixer(model);
  const act = (n, loop) => {
    const a = mixer.clipAction(src.clips[n]);
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    return a;
  };
  const idle = act('Idle', true), walk = act('Walk', true), cast = act('Cast', false), wag = act('TailWag', true);
  idle.play(); walk.play(); wag.play();
  walk.setEffectiveWeight(0);
  idle.time = Math.random() * 2; wag.time = Math.random();
  let castT = 0, chan = false, tSkin = Math.random() * 10;
  const CAST_LEN = src.clips.Cast.duration;

  // staff skins
  const hand = model.getObjectByName('Hand_R');
  const builtIn = [];
  model.traverse((o) => { if (o.isMesh && isStaffMesh(o)) builtIn.push(o); });
  let skin = null, skinId = hasSkin('staff/moon') ? null : 'moon';
  const up = new THREE.Vector3(0, 1, 0);
  const setStaff = (id) => {
    if (id === skinId) return;
    skinId = id;
    if (skin) { skin.group.parent && skin.group.parent.remove(skin.group); skin = null; }
    const custom = (id !== 'moon' || hasSkin('staff/moon')) && hand && src.staffLine;
    for (const o of builtIn) o.visible = !custom;
    if (!custom) return;
    skin = buildStaff(id);
    const L = src.staffLine;
    skin.group.position.copy(L.bottom);
    skin.group.quaternion.setFromUnitVectors(up, L.dir);
    skin.group.scale.setScalar(L.len);
    hand.add(skin.group);
    skin.glowMats.forEach((m) => m.color.copy(glowColor));
  };

  const shadow = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; root.add(shadow);

  return {
    root, bob, shadow, fur, flashMats: [fur, cloth].filter(Boolean), labelY: 3.85, barY: 3.4, kind: 'mayu',
    setFur(hex) { if (fur) fur.color.setHex(hex); },
    setGlow(hex) {
      glowColor.setHex(hex);
      if (orb) { orb.color.copy(glowColor); if (orb.emissive) orb.emissive.copy(glowColor); }
      if (skin) skin.glowMats.forEach((m) => m.color.copy(glowColor));
    },
    setStaff,
    cast() { cast.reset(); cast.play(); castT = CAST_LEN; },
    channel(on) { chan = on; },
    anim(dt, speed, happy) {
      const w = Math.min(1, speed / 4);
      let c = 0;
      if (castT > 0) { castT -= dt; c = castT > 0.1 ? 1 : Math.max(0, castT / 0.1); }
      if (chan) { if (!cast.isRunning()) { cast.reset(); cast.play(); } cast.time = CAST_LEN * 0.32; c = 1; castT = 0.1; }
      idle.setEffectiveWeight((1 - w) * (1 - c));
      walk.setEffectiveWeight(w * (1 - c));
      cast.setEffectiveWeight(c);
      walk.timeScale = 0.75 + speed / 8;
      wag.timeScale = 1 + w * 0.7 + happy * 1.8;
      mixer.update(dt);
      if (skin) { tSkin += dt; skin.tick(tSkin); }
    },
  };
}
