// Swappable 3D model skins (the Meshy models from the VRChat world).
// Every slot is a plain .glb in assets/models/skins/ listed in skins.json. To swap a model, drop in a new .glb with the
// same file name (or point the slot at another file in skins.json). If a file is missing or fails to load, the game
// quietly keeps its original code-built model for that slot. Add ?skins=off to the URL to play with the classic look.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three-addons/loaders/GLTFLoader.js';

const BASE = './assets/models/skins/';
const loaded = {};          // slot -> THREE.Object3D (template, never added to the scene)
let enabled = true;

export async function loadSkins(onProgress) {
  if (/[?&]skins=(off|0|no)/i.test(location.search)) { enabled = false; return; }
  let list;
  try {
    const r = await fetch(BASE + 'skins.json', { cache: 'no-cache' });
    list = (await r.json()).slots || {};
  } catch (e) { console.warn('[skins] no skins.json, using classic models'); return; }
  const keys = Object.keys(list);
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(keys.map((k) => new Promise((resolve) => {
    loader.load(BASE + list[k], (g) => {
      const root = g.scene;
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false; o.receiveShadow = false;
        const m = o.material;
        if (m && m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        if (m && m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      });
      loaded[k] = root;
      onProgress && onProgress(++done / keys.length);
      resolve();
    }, undefined, () => { console.warn('[skins] could not load', list[k]); onProgress && onProgress(++done / keys.length); resolve(); });
  })));
}

// A fresh copy of a slot's model, or null when that slot has no skin (callers then build the classic model).
export function skin(slot) {
  if (!enabled) return null;
  const t = loaded[slot];
  return t ? t.clone(true) : null;
}

export function hasSkin(slot) { return enabled && !!loaded[slot]; }
