// Every way to play, read into one "pad" per device so the game can treat them all alike:
//   kb1   : WASD move, mouse aim, click / Space cast, E shield (or right click), Q spell     (player 1)
//   kb2   : arrow keys move, Enter cast, Right Shift shield, / spell, auto-aim               (a 2nd player on the same keyboard)
//   gp0-3 : left stick move, right stick aim (auto-aim otherwise), RT / A cast, LB / B shield, RB / X spell
//   touch : virtual stick, CAST, SHIELD and spell buttons (phones and tablets)
// No allocations per frame.

function makePad(id) {
  return { id, mx: 0, mz: 0, fire: false, shield: false, q: false, ult: false, aimX: 0, aimZ: 0, hasAim: false, mouseAim: false,
    _sh: false, _q: false, _u: false, firePress: false, _f: false, join: false, _join: false, used: false };
}

export class Input {
  constructor(touchRoot) {
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.keys = Object.create(null);
    this.taps = Object.create(null); // presses since the last frame, so quick taps are never missed
    this.mouseDown = false; this.rightDown = false; this.clickTap = false; this.rightTap = false;
    this.px = 0; this.py = 0; this.hasPointer = false;
    this.onAnyKey = null;
    this.pads = { kb1: makePad('kb1'), kb2: makePad('kb2'), touch: makePad('touch') };
    for (let i = 0; i < 4; i++) this.pads['gp' + i] = makePad('gp' + i);
    this.padList = Object.values(this.pads);
    this.stickId = -1; this.stickX = 0; this.stickY = 0; this.sx = 0; this.sz = 0;
    this.tFire = false; this.tShield = false; this.tQ = false; this.tUlt = false;
    this.lookDX = 0; this.lookDY = 0;
    this.K = (c) => !!(this.keys[c] || this.taps[c]);
    document.addEventListener('mousemove', (e) => { if (document.pointerLockElement) { this.lookDX += e.movementX || 0; this.lookDY += e.movementY || 0; } });

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Slash', 'Tab'].includes(e.key) || e.code === 'Slash' || e.code === 'Space') e.preventDefault();
      this.keys[e.code] = true;
      if (!e.repeat) this.taps[e.code] = true;
      if (this.onAnyKey) this.onAnyKey(e);
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = Object.create(null); this.mouseDown = false; this.rightDown = false; });
    const stage = document.getElementById('app');
    stage.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { this.px = e.clientX; this.py = e.clientY; this.hasPointer = true; } });
    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.target.tagName !== 'CANVAS') return;
      this.px = e.clientX; this.py = e.clientY; this.hasPointer = true;
      if (e.button === 0) { this.mouseDown = true; this.clickTap = true; }
      if (e.button === 2) { this.rightDown = true; this.rightTap = true; }
    });
    addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') { if (e.button === 0) this.mouseDown = false; if (e.button === 2) this.rightDown = false; } });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    let lastTap = 0;
    document.addEventListener('touchend', (e) => { const n = Date.now(); if (n - lastTap < 350) e.preventDefault(); lastTap = n; }, { passive: false });
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

    // touch controls
    this.root = touchRoot;
    this.zone = touchRoot.querySelector('#stick-zone');
    this.stick = touchRoot.querySelector('#stick');
    this.knob = this.stick.querySelector('i');
    this.hint = touchRoot.querySelector('#stick-hint');
    this.zone.addEventListener('pointerdown', (e) => {
      if (this.stickId >= 0) return;
      this.stickId = e.pointerId; this.zone.setPointerCapture(e.pointerId);
      const r = this.root.getBoundingClientRect();
      this.stickX = e.clientX; this.stickY = e.clientY;
      this.stick.style.left = (e.clientX - r.left) + 'px'; this.stick.style.top = (e.clientY - r.top) + 'px';
      this.stick.classList.add('on'); this.knob.style.transform = 'translate(0,0)';
      this.hint.style.opacity = 0;
    });
    this.zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      let dx = e.clientX - this.stickX, dy = e.clientY - this.stickY;
      const d = Math.hypot(dx, dy), max = 60;
      if (d > max) {
        // the base follows the thumb, so sliding past the edge keeps steering instead of getting stuck
        const over = d - max;
        this.stickX += dx / d * over; this.stickY += dy / d * over;
        const r = this.root.getBoundingClientRect();
        this.stick.style.left = (this.stickX - r.left) + 'px'; this.stick.style.top = (this.stickY - r.top) + 'px';
        dx = dx / d * max; dy = dy / d * max;
      }
      // small dead zone, then a gentle curve: fine control near the centre, full speed at the edge
      const m = Math.min(1, Math.hypot(dx, dy) / max);
      const k = m < 0.12 ? 0 : Math.pow((m - 0.12) / 0.88, 0.8);
      const len = Math.hypot(dx, dy) || 1;
      this.sx = dx / len * k; this.sz = dy / len * k;
      this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    });
    const end = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = -1; this.sx = 0; this.sz = 0; this.stick.classList.remove('on');
    };
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
    const hold = (id, key) => {
      const el = touchRoot.querySelector(id);
      el.addEventListener('pointerdown', (e) => { this[key] = true; el.classList.add('down'); el.setPointerCapture(e.pointerId); });
      const up = () => { this[key] = false; el.classList.remove('down'); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    };
    hold('#fire', 'tFire'); hold('#tshield', 'tShield'); hold('#tq', 'tQ'); hold('#tult', 'tUlt');
  }

  showTouch(on) { this.root.classList.toggle('on', on && this.touch); }

  // Read every device. Call once per frame.
  update() {
    const k = this.keys, T = this.taps, K = this.K;
    // keyboard 1
    let p = this.pads.kb1;
    let mx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), mz = (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0);
    norm(p, mx, mz);
    p.fire = this.mouseDown || this.clickTap || K('Space');
    edges(p, K('KeyE') || this.rightDown || this.rightTap, K('KeyQ'), false, K('KeyR'));
    p.mouseAim = (this.hasPointer || !!document.pointerLockElement) && !this.touch;
    if (mx || mz || p.fire) p.used = true;
    // keyboard 2 (arrows)
    p = this.pads.kb2;
    mx = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0); mz = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0);
    norm(p, mx, mz);
    p.fire = K('Enter') || K('NumpadEnter') || K('Numpad0');
    edges(p, K('ShiftRight') || K('Numpad1'), K('Slash') || K('Numpad2') || K('Period'), p.fire || !!(mx || mz), K('ControlRight') || K('Numpad3') || K('Comma'));
    // touch
    p = this.pads.touch;
    norm(p, this.stickId >= 0 ? this.sx : 0, this.stickId >= 0 ? this.sz : 0);
    p.fire = this.tFire;
    edges(p, this.tShield, this.tQ, false, this.tUlt);
    // gamepads
    const gps = navigator.getGamepads ? navigator.getGamepads() : null;
    for (let i = 0; i < 4; i++) {
      const g = gps && gps[i];
      p = this.pads['gp' + i];
      if (!g || !g.connected) { p.mx = 0; p.mz = 0; p.fire = false; p.stickFire = false; p.hasAim = false; p.lookX = 0; edges(p, false, false, false, false); continue; }
      const ax = g.axes, bt = g.buttons;
      const lx = dz(ax[0] || 0), ly = dz(ax[1] || 0);
      const dpx = (btn(bt, 15) ? 1 : 0) - (btn(bt, 14) ? 1 : 0), dpy = (btn(bt, 13) ? 1 : 0) - (btn(bt, 12) ? 1 : 0);
      norm(p, lx + dpx, ly + dpy);
      const rx = dz(ax[2] || 0), ry = dz(ax[3] || 0);
      p.hasAim = rx * rx + ry * ry > 0.2; p.aimX = rx; p.aimZ = ry;
      p.fire = btn(bt, 7) || btn(bt, 0);
      p.stickFire = p.hasAim && rx * rx + ry * ry > 0.7; // twin-stick shooting (overhead view only)
      edges(p, btn(bt, 4) || btn(bt, 1) || btn(bt, 6), btn(bt, 5) || btn(bt, 2), btn(bt, 0) || btn(bt, 9), btn(bt, 3));
      p.lookX = dz(ax[2] || 0);
    }
    // a tap that was already released counts once, then is forgotten
    for (const c in T) { delete T[c]; }
    this.clickTap = false; this.rightTap = false;
  }

  takeLook(out) { out.x = this.lookDX; out.y = this.lookDY; this.lookDX = 0; this.lookDY = 0; return out; }

  // Devices that asked to join this frame (Enter on the arrow keys, A or Start on a controller).
  joinRequests(out) {
    out.length = 0;
    const list = this.padList;
    for (let i = 0; i < list.length; i++) if (list[i].join) out.push(list[i].id);
    return out;
  }

  // Any confirm press (title / game over screens): returns the device id or null.
  confirmPressed() {
    for (let i = 0; i < 4; i++) { const p = this.pads['gp' + i]; if (p.join) return p.id; }
    return null;
  }
}

function norm(p, mx, mz) {
  const d = Math.hypot(mx, mz);
  if (d > 1) { mx /= d; mz /= d; }
  p.mx = mx; p.mz = mz;
}
function edges(p, sh, q, join, ult) {
  p.ult = !!ult && !p._u; p._u = !!ult;
  p.firePress = p.fire && !p._f; p._f = p.fire;
  p.shield = sh && !p._sh; p._sh = sh;
  p.q = q && !p._q; p._q = q;
  p.join = join && !p._join; p._join = join;
}
function dz(v) { return Math.abs(v) < 0.18 ? 0 : v; }
function btn(b, i) { return !!(b[i] && (b[i].pressed || b[i].value > 0.5)); }
