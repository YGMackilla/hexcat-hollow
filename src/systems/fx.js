// Pooled additive particles (one Points object, fixed typed arrays) and a few tween helpers.
import * as THREE from 'three';

const MAX = 900;
const tmpC = new THREE.Color();

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.size0 = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.head = 0;
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -999;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 400 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size; varying vec3 vCol; uniform float uScale;
        void main(){ vCol = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec3 vCol;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;
          float a = smoothstep(1.0, 0.0, d); a *= a; if (a < 0.01) discard; gl_FragColor = vec4(vCol * a, a); }`,
      vertexColors: true,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = g;
  }

  setScale(s) { this.uniforms.uScale.value = s; }

  // Emit n particles from a point. speed: outward speed, up: extra upward velocity, grav: downward pull.
  burst(x, y, z, hex, n, speed, life, size, up, grav) {
    tmpC.set(hex);
    const r = tmpC.r, g = tmpC.g, b = tmpC.b;
    for (let k = 0; k < n; k++) {
      const i = this.head; this.head = (this.head + 1) % MAX;
      const a = Math.random() * 6.2832, e = Math.random() * 2 - 1, s = speed * (0.35 + Math.random() * 0.65);
      const rr = Math.sqrt(1 - e * e);
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * rr * s; this.vel[i * 3 + 1] = e * s * 0.7 + up; this.vel[i * 3 + 2] = Math.sin(a) * rr * s;
      this.life[i] = this.max[i] = life * (0.6 + Math.random() * 0.4);
      this.size0[i] = size * (0.6 + Math.random() * 0.6);
      this.grav[i] = grav;
      this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      const l = this.life[i];
      if (l <= 0) { if (this.size[i] !== 0) { this.size[i] = 0; this.pos[i * 3 + 1] = -999; } continue; }
      const nl = l - dt;
      this.life[i] = nl;
      const k = nl / this.max[i];
      const j = i * 3;
      this.vel[j + 1] -= this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.05 && this.grav[i] > 0) { this.pos[j + 1] = 0.05; this.vel[j + 1] *= -0.3; }
      this.size[i] = this.size0[i] * (k > 0 ? Math.sqrt(k) : 0);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

// Easing functions
export const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

// Smoothly count a DOM number up. Allocation-light, used on the game over screen.
export function countUp(el, to, dur, fmt) {
  const t0 = performance.now();
  function f(now) {
    const t = Math.min(1, (now - t0) / dur);
    el.textContent = fmt(Math.round(to * ease.outCubic(t)));
    if (t < 1) requestAnimationFrame(f);
  }
  requestAnimationFrame(f);
}

export function angleLerp(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= 6.2832;
  while (d < -Math.PI) d += 6.2832;
  return a + d * k;
}
