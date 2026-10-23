import { TUNE, POWER_NAMES, POWER_COLORS, PAL, SLOT_COLORS, arenaR } from '../systems/constants.js';
import { EV } from '../systems/sim.js';
import { net, roomLink } from '../systems/net.js';
import { MAPS } from '../systems/maps.js';
import { store } from '../systems/storage.js';

const CAM_NAMES = ['Overhead view', 'Over-the-shoulder view', 'First-person view'];

const r2 = (v) => Math.round(v * 100) / 100;
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const MAX_LOCAL = 4;
const PLABEL = ['P1', 'P2', 'P3', 'P4'];

// The match itself.
//  solo/host: this browser runs the simulation. Up to 4 people on this device (keyboard, arrows, controllers, touch)
//             plus friends who joined online from their own browser. Bots fill every other seat.
//  client:    a friend who joined online mirrors the host's snapshots.
export class Game {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.mode = 'solo';
    this.locals = [];          // [{ slot, devs: [padIds], label }]
    this.p1devs = ['kb1', 'touch'];
    this.out = { x: 0, z: 0 };
    this.outEvents = [];
    this.joinBuf = [];
    this.othersBuf = [];
    this.fwd = false;
    const { ui } = app;
    ui.btnInvite.addEventListener('click', () => this.invite());
    ui.btnLeave.addEventListener('click', () => { app.sfx.play('click'); this.leave(); });
    ui.btnCam.addEventListener('click', () => this.cycleCam());
    this.camMode = store.cam; this.camYaw = 0; this.camPitch = 0; this.look = { x: 0, y: 0 };
    this.round = 1; this.aim = null; this.overT = 0; this.eff = 0; this.pendUlt = null; this.ultSpot = { x: 0, z: 0 };
    const canvas = () => document.querySelector('#gl canvas');
    document.getElementById('app').addEventListener('pointerdown', (e) => {
      if (!this.active || e.pointerType !== 'mouse' || e.target.tagName !== 'CANVAS') return;
      if (this.eff > 0 && !this.aim && !document.pointerLockElement && canvas()) { try { canvas().requestPointerLock(); } catch (err) { /* ignore */ } }
    });
    this.onEvent = (type, a, b, x, z, k, x2, z2) => this.handleEvent(type, a, b, x, z, k, x2, z2);
  }

  get local() { return this.locals.length ? this.locals[0].slot : -1; }
  isLocal(slot) { for (let i = 0; i < this.locals.length; i++) if (this.locals[i].slot === slot) return true; return false; }
  localIndex(slot) { for (let i = 0; i < this.locals.length; i++) if (this.locals[i].slot === slot) return i; return -1; }

  // ---------- lifecycle ----------
  enter(opts) {
    const { app } = this, { world, stage, ui, input } = app;
    this.active = true;
    this.mode = opts.mode;
    if (opts.p1devs) this.p1devs = opts.p1devs;
    this.ended = false; this.endT = 0; this.aliveT = 0; this.shown = 0; this.sendT = 0; this.snapT = 0; this.helloT = 0;
    this.outEvents.length = 0; this.joined = false; this.specT = 0; this.spec = -1;
    this.lastHp = -1; this.lastAlive = -1; this.lastScore = -1; this.hurtShown = '';
    this.pendShield = false; this.pendQ = false;
    this.fwd = false;
    world.onEvent = this.onEvent;
    ui.hide(ui.over); ui.hide(ui.title);
    ui.show(ui.hud); ui.clearFeed(); ui.clearToast();
    ui.room.classList.remove('on');
    input.showTouch(true);
    ui.aliveSub.textContent = 'last cat wins';
    ui.setKeys(input.touch ? '' : 'E', input.touch ? '' : 'Q');

    if (opts.mode === 'client') {
      world.frozen = true;
      world.reset([]);
      this.locals = [];
      stage.setLocals([]);
      ui.btnInvite.style.display = 'none';
      ui.joinhint.textContent = '';
      if (opts.resume && opts.welcome) this.onNet(opts.welcome);
      else this.connect(opts.room);
    } else {
      world.frozen = false;
      ui.btnInvite.style.display = '';
      // keep the people on this device from the last round (fresh match: just player 1)
      const keep = opts.keepLocals && this.locals.length ? this.locals.map((l) => l.devs) : [this.p1devs];
      this.locals = [];
      const humans = [];
      for (let i = 0; i < keep.length && i < MAX_LOCAL; i++) { this.locals.push({ slot: i, devs: keep[i], label: PLABEL[i] }); humans.push(i); }
      this.round = opts.keepLocals ? this.round + 1 : 1;
      world.setMap((this.round - 1) % MAPS.length);
      const waiting = [];
      for (let i = 0; i < net.conns.length; i++) {
        if (humans.length < TUNE.maxWizards) { waiting.push({ c: net.conns[i], slot: humans.length }); humans.push(humans.length); }
        else net.send(net.conns[i], { t: 'full' });
      }
      world.reset(humans);
      for (const l of this.locals) world.wizards[l.slot].ctl = 'local';
      for (const w of waiting) world.wizards[w.slot].ctl = w.c.peer;
      stage.setLocals(this.locals.map((l) => l.slot));
      this.fwd = net.mode === 'host';
      if (this.fwd) {
        const roster = this.roster();
        for (const w of waiting) net.send(w.c, { t: 'welcome', slot: w.slot, roster });
        this.showRoom();
      }
      ui.showMap(this.round, MAPS[world.map].name, world.map);
      this.updateJoinHint();
      this.updateControls();
    }
    this.aim = null; this.overT = 0; this.pendUlt = null; this.ultQueue = null; app.stage.showUltAim(false);
    ui.aimhint.classList.remove('on');
    // the Enter / A press that started this match must not also count as a join or a cast
    for (const c in input.taps) delete input.taps[c];
    input.update();
    this.hasPad = false;
    this.camYaw = world.wizards[Math.max(0, this.local)].yaw; this.camPitch = 0;
    const first = world.wizards[Math.max(0, this.local)];
    stage.camX = first.x; stage.camZ = first.z;
  }

  exit() {
    if (this.aim) this.endAim(false);
    this.ultQueue = null;
    if (document.pointerLockElement) document.exitPointerLock();
    this.app.input.takeLook(this.look);
    this.app.ui.aimhint.classList.remove('on');
    this.active = false;
    this.app.ui.hide(this.app.ui.hud);
    this.app.input.showTouch(false);
    this.app.ui.clearToast();
  }

  leave() {
    this.app.net.close();
    this.locals = [];
    this.app.go('Title');
  }

  key(e) {
    if (e.repeat) return;
    if (e.code === 'Tab' || e.code === 'KeyC') this.cycleCam();
    else if (e.code === 'KeyI') this.invite();
  }

  cycleCam() {
    const { ui, sfx, input } = this.app;
    if (!this.active) return;
    if (this.locals.length > 1) { ui.toast('Overhead only with several players on one screen', PAL.bone); return; }
    this.camMode = (this.camMode + 1) % 3;
    store.setCam(this.camMode);
    const lw = this.local >= 0 ? this.app.world.wizards[this.local] : null;
    if (lw) this.camYaw = lw.yaw;
    this.camPitch = 0;
    if (this.camMode === 0 && document.pointerLockElement) document.exitPointerLock();
    ui.toast(CAM_NAMES[this.camMode] + (this.camMode && !input.touch ? ' - click to look around' : ''), PAL.teal);
    sfx.play('click');
  }

  // Controls panel on the left: player 1's controls, plus a line for every extra player on this device.
  updateControls() {
    const { ui, input } = this.app;
    const groups = [];
    if (input.touch) {
      groups.push({ title: '', rows: [['Stick', 'Move'], ['CAST', 'Cast (auto-aim)'], ['Shield', 'Block all damage'], ['Spell', 'Dash / slow-mo'], ['Bolt', 'Thundershock'], ['Cam', 'Camera view']] });
    } else {
      groups.push({ title: this.locals.length > 1 ? 'P1 keyboard' : 'Controls', rows: [
        ['W / A / S / D', 'Move'], ['Mouse', 'Aim'], ['Click', 'Cast'], ['E', 'Shield'], ['Q', 'Dash / slow-mo'],
        ['R', 'Thundershock'], ['Tab', 'Camera view'], ['M', 'Sound'],
      ] });
      for (let i = 0; i < this.locals.length; i++) {
        const L = this.locals[i];
        if (L.devs.indexOf('kb2') >= 0) groups.push({ title: L.label + ' arrow keys', rows: [['\u2190\u2191\u2192\u2193', 'Move'], ['Enter', 'Cast'], ['R-Shift', 'Shield'], ['/', 'Spell'], ['R-Ctrl', 'Thundershock']] });
        else if (L.devs.some((d) => d[0] === 'g')) groups.push({ title: L.label + ' controller', rows: [['LS', 'Move'], ['RS', 'Aim'], ['RT / A', 'Cast'], ['LB / B', 'Shield'], ['RB / X', 'Spell'], ['Y', 'Thundershock']] });
      }
    }
    ui.setControls(groups, input.touch);
  }

  updateJoinHint() {
    const { ui, input } = this.app;
    if (this.mode === 'client' || input.touch || this.locals.length >= MAX_LOCAL) { ui.joinhint.textContent = ''; return; }
    const kb2Free = !this.locals.some((l) => l.devs.indexOf('kb2') >= 0);
    ui.joinhint.textContent = kb2Free ? 'Another player? Arrow keys + Enter, or press A on a controller' : 'Another player? Press A on a controller';
  }

  // ---------- same-device players ----------
  checkLocalJoins() {
    const { app } = this, { input, world, ui, sfx } = app;
    if (this.mode === 'client' || world.over || this.ended) return;
    input.joinRequests(this.joinBuf);
    for (let i = 0; i < this.joinBuf.length; i++) {
      const dev = this.joinBuf[i];
      if (dev === 'kb1' || dev === 'touch') continue;
      if (this.locals.some((l) => l.devs.indexOf(dev) >= 0)) continue;
      if (this.locals.length >= MAX_LOCAL) return;
      let w = null; // take over the healthiest bot
      for (let j = 0; j < world.wizards.length; j++) {
        const o = world.wizards[j];
        if (!o.human && o.alive && (!w || o.hp > w.hp)) w = o;
      }
      if (!w) return;
      w.human = true; w.ctl = 'local'; w.inFire = false; w.chan = false; w.invuln = Math.max(w.invuln, 1.2);
      if (dev[0] === 'g') this.hasPad = true;
      const label = PLABEL[this.locals.length];
      this.locals.push({ slot: w.id, devs: [dev], label });
      app.stage.setLocals(this.locals.map((l) => l.slot));
      if (this.fwd) net.broadcast(this.roster());
      ui.toast(label + ' joined as ' + w.name + '!', SLOT_COLORS[w.id]);
      ui.feed('★ ' + label + ' (' + (dev === 'kb2' ? 'arrow keys' : 'controller') + ') took over ' + w.name, SLOT_COLORS[w.id]);
      sfx.play('join');
      this.updateJoinHint();
      this.updateControls();
    }
  }

  readLocal(L, w) {
    const { input, world, stage } = this.app;
    let mx = 0, mz = 0, fire = false, sh = false, q = false, ult = false, aimSet = false, mouse = false, lookX = 0;
    for (let i = 0; i < L.devs.length; i++) {
      const p = input.pads[L.devs[i]];
      if (!p) continue;
      mx += p.mx; mz += p.mz; fire = fire || p.fire || (p.stickFire && this.eff === 0); sh = sh || p.shield; q = q || p.q; ult = ult || p.ult;
      if (p.hasAim && this.eff === 0) { w.inYaw = Math.atan2(p.aimX, p.aimZ); aimSet = true; }
      if (p.lookX) lookX += p.lookX;
      if (p.mouseAim) mouse = true;
    }
    const d = Math.hypot(mx, mz);
    if (d > 1) { mx /= d; mz /= d; }
    // Thundershock: start aiming
    if (ult && w.ult > 0) { if (!this.aim) this.startAim(L, w); else if (this.aim.slot !== w.id) this.ultQueue = L; }
    if (this.aim && this.aim.slot === w.id) { w.inMx = 0; w.inMz = 0; w.inFire = false; return; }
    if (this.eff > 0 && L === this.locals[0]) {
      // over the shoulder / first person: move relative to where the camera looks
      input.takeLook(this.look);
      this.camYaw -= this.look.x * 0.0026 + lookX * 2.8 * this.dt;
      this.camPitch = Math.max(-0.45, Math.min(0.4, this.camPitch - this.look.y * 0.002));
      const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw), rx = -fz, rz = fx;
      const wx = rx * mx - fx * mz, wz = rz * mx - fz * mz;
      if (input.touch && !document.pointerLockElement) {
        const t = world.nearestEnemy(w.x, w.z, w.id);
        let ty = this.camYaw;
        if (t >= 0) { const e = world.wizards[t]; ty = Math.atan2(e.x - w.x, e.z - w.z); }
        w.inYaw = ty;
        let dd = ty - this.camYaw; while (dd > Math.PI) dd -= 6.2832; while (dd < -Math.PI) dd += 6.2832;
        this.camYaw += dd * Math.min(1, this.dt * 2.5);
      } else w.inYaw = this.camYaw;
      w.inMx = wx; w.inMz = wz; w.inFire = fire && w.alive;
      if (sh) w.inShield = true;
      if (q) w.inQ = true;
      return;
    }
    if (!aimSet && mouse) {
      stage.groundAt(input.px, input.py, this.out);
      const dx = this.out.x - w.x, dz = this.out.z - w.z;
      if (dx * dx + dz * dz > 0.25) { w.inYaw = Math.atan2(dx, dz); aimSet = true; }
    }
    if (!aimSet) {
      const t = world.nearestEnemy(w.x, w.z, w.id);
      if (t >= 0) { const e = world.wizards[t]; w.inYaw = Math.atan2(e.x - w.x, e.z - w.z); }
      else if (mx || mz) w.inYaw = Math.atan2(mx, mz);
    }
    w.inMx = mx; w.inMz = mz; w.inFire = fire && w.alive;
    if (sh) w.inShield = true;
    if (q) w.inQ = true;
  }

  // ---------- Thundershock aiming ----------
  startAim(L, w) {
    const { world, stage, ui, input, sfx } = this.app;
    world.bestUltSpot(w, this.ultSpot);
    const usesMouse = L.devs.indexOf('kb1') >= 0 && !input.touch;
    this.aim = { L, slot: w.id, x: this.ultSpot.x, z: this.ultSpot.z, t: 0, mouse: usesMouse, px: input.px, py: input.py, follow: false };
    w.chan = true; this.chanSend = true;
    if (document.pointerLockElement) document.exitPointerLock();
    stage.showUltAim(true, this.aim.x, this.aim.z, SLOT_COLORS[w.id]);
    ui.aimhint.textContent = usesMouse ? 'Move the circle - click to strike!' : input.touch ? 'Drag to move - tap \u26a1 to strike!' : 'Move the circle - press cast to strike!';
    ui.aimhint.classList.add('on');
    sfx.play('aim');
  }

  updateAim(dt) {
    if (!this.aim) return;
    const { input, world, stage, ui } = this.app;
    const A = this.aim, w = world.wizards[A.slot];
    A.t += dt;
    if (!w.alive || (this.mode !== 'client' && w.ult <= 0 && A.t > 0.1)) { this.endAim(false); return; }
    let mx = 0, mz = 0, go = false;
    for (let i = 0; i < A.L.devs.length; i++) {
      const p = input.pads[A.L.devs[i]];
      if (!p) continue;
      mx += p.mx + (p.hasAim ? p.aimX : 0); mz += p.mz + (p.hasAim ? p.aimZ : 0);
      if ((p.firePress || p.ult) && A.t > 0.15) go = true;
    }
    if (A.mouse && !A.follow && A.t > 0.35 && (Math.abs(input.px - A.px) + Math.abs(input.py - A.py) > 4)) A.follow = true;
    if (A.mouse && A.follow && input.hasPointer) { stage.groundAt(input.px, input.py, stage._aimPt || (stage._aimPt = { x: 0, z: 0 })); A.x = stage._aimPt.x; A.z = stage._aimPt.z; }
    A.x += mx * 18 * dt; A.z += mz * 18 * dt;
    const lim = arenaR(A.x, A.z) - 1, d = Math.hypot(A.x, A.z);
    if (d > lim) { A.x *= lim / d; A.z *= lim / d; }
    stage.showUltAim(true, A.x, A.z);
    const left = this.mode === 'client' ? TUNE.ultTime - A.t : w.ult;
    if (go || A.t > 3.5 || left < 0.2) this.endAim(true);
  }

  endAim(fire) {
    const { world, stage, ui } = this.app;
    const A = this.aim; this.aim = null;
    stage.showUltAim(false);
    if (A) world.wizards[A.slot].chan = false;
    this.chanSend = false;
    ui.aimhint.classList.remove('on');
    if (A && this.ultQueue) {
      const Q = this.ultQueue; this.ultQueue = null;
      const qw = world.wizards[Q.slot];
      if (qw.alive && qw.ult > 0.3 && this.active) setTimeout(() => { if (this.active && !this.aim && qw.ult > 0) this.startAim(Q, qw); }, 0);
    }
    if (!fire || !A) return;
    const w = world.wizards[A.slot];
    if (this.mode === 'client') this.pendUlt = { x: r2(A.x), z: r2(A.z) };
    else { w.ultX = A.x; w.ultZ = A.z; w.inUlt = true; }
    this.overT = 1.6;
  }

  // ---------- networking: host ----------
  roster() {
    const ws = this.app.world.wizards, n = [], h = [];
    for (let i = 0; i < ws.length; i++) { n.push(ws[i].name); h.push(ws[i].human ? 1 : 0); }
    return { t: 'roster', n, h };
  }

  showRoom() {
    const { ui } = this.app;
    if (net.code) { ui.room.textContent = 'Room ' + net.code + ' · friends can join any time'; ui.room.classList.add('on'); }
  }

  async invite() {
    if (this.mode === 'client' || !this.active) return;
    const { ui, sfx } = this.app;
    sfx.play('click');
    try {
      if (!net.code) {
        ui.toast('Opening a room...', PAL.teal);
        await net.host({
          onJoin: (c) => this.hostJoin(c),
          onData: (c, m) => this.hostData(c, m),
          onLeave: (c) => this.hostLeave(c),
        });
        this.fwd = true;
      }
      const link = roomLink(net.code);
      let ok = false;
      try { await navigator.clipboard.writeText(link); ok = true; } catch (e) { /* fall through */ }
      if (!ok && navigator.share) { try { await navigator.share({ title: 'Hexcat Hollow', text: 'Join my kitty wizard battle!', url: link }); ok = true; } catch (e) { /* ignore */ } }
      if (ok) { this.showRoom(); ui.toast('Invite link copied!', PAL.teal); }
      else { ui.room.textContent = link; ui.room.classList.add('on'); ui.room.style.pointerEvents = 'auto'; ui.room.style.userSelect = 'text'; ui.toast('Share the link below', PAL.teal); }
    } catch (e) {
      ui.toast('Online rooms are unavailable right now', PAL.pink);
    }
  }

  hostJoin(c) {
    c.lastSeen = performance.now();
    this.hostHello(c);
  }

  // A friend asks for a seat. Safe to receive many times: re-sends the seat if it already has one.
  hostHello(c) {
    const { world } = this.app;
    for (let i = 0; i < world.wizards.length; i++) {
      const w = world.wizards[i];
      if (w.ctl === c.peer && w.human) { net.send(c, { t: 'welcome', slot: w.id, roster: this.roster() }); return; }
    }
    if (!this.active || world.over || this.ended) { net.send(c, { t: 'wait' }); return; }
    this.seat(c);
  }

  seat(c) {
    const { world, ui, sfx } = this.app;
    let w = null;
    for (let i = 0; i < world.wizards.length; i++) {
      const o = world.wizards[i];
      if (!o.human && o.alive && (!w || o.hp > w.hp)) w = o;
    }
    if (!w) { net.send(c, { t: 'full' }); return; }
    w.human = true; w.ctl = c.peer; w.inFire = false; w.chan = false; w.invuln = Math.max(w.invuln, 1.2);
    net.send(c, { t: 'welcome', slot: w.id, roster: this.roster() });
    net.broadcast(this.roster());
    ui.toast(w.name + ' joined!', SLOT_COLORS[w.id]);
    ui.feed('★ ' + w.name + ' joined online', SLOT_COLORS[w.id]);
    sfx.play('join');
  }

  hostData(c, m) {
    c.lastSeen = performance.now();
    if (m && m.t === 'hello') { this.hostHello(c); return; }
    if (!m || m.t !== 'i') return;
    const { world } = this.app;
    for (let i = 0; i < world.wizards.length; i++) {
      const w = world.wizards[i];
      if (w.ctl === c.peer && w.human) {
        w.inMx = Math.max(-1, Math.min(1, num(m.mx))); w.inMz = Math.max(-1, Math.min(1, num(m.mz)));
        w.inYaw = num(m.yaw); w.inFire = !!m.f && !world.over;
        if (m.s) w.inShield = true;
        if (m.q) w.inQ = true;
        w.chan = !!m.c && w.ult > 0;
        if (m.u) { w.ultX = num(m.ux); w.ultZ = num(m.uz); w.inUlt = true; w.chan = false; }
        return;
      }
    }
  }

  hostLeave(c) {
    const { world, ui } = this.app;
    for (let i = 0; i < world.wizards.length; i++) {
      const w = world.wizards[i];
      if (w.ctl === c.peer) {
        w.human = false; w.ctl = null; w.inFire = false;
        ui.feed(w.name + ' left - a bot took over', PAL.bone);
        net.broadcast(this.roster());
      }
    }
  }

  dropSilent() {
    const now = performance.now();
    for (let i = net.conns.length - 1; i >= 0; i--) {
      const c = net.conns[i];
      if (c.lastSeen && now - c.lastSeen > 5000) {
        net.conns.splice(i, 1);
        try { c.close(); } catch (e) { /* ignore */ }
        this.hostLeave(c);
      }
    }
  }

  buildSnap() {
    const { world } = this.app;
    const w = [];
    for (let i = 0; i < world.wizards.length; i++) {
      const o = world.wizards[i];
      const f = (o.alive ? 1 : 0) | (o.human ? 2 : 0) | (o.slowT > 0 ? 4 : 0) | (o.burnT > 0 ? 8 : 0) | (o.invuln > 0 ? 16 : 0) | (o.inField ? 32 : 0) | (o.chan ? 64 : 0);
      w.push([r2(o.x), r2(o.z), r2(o.yaw), Math.round(o.hp), f, o.power, o.kills, o.place, Math.round(o.powerT * 10) / 10,
        Math.round(o.shieldT * 10) / 10, Math.round(o.shieldCd * 10) / 10, o.q, o.qn, Math.round(o.ult * 10) / 10]);
    }
    const p = [];
    for (let i = 0; i < world.proj.length; i++) {
      const q = world.proj[i];
      if (q.active) p.push([i, q.kind, r2(q.x), r2(q.z), r2(q.vx), r2(q.vz), q.owner]);
    }
    const k = [];
    for (let i = 0; i < world.pickups.length; i++) k.push([world.pickups[i].active ? 1 : 0, world.pickups[i].kind]);
    const fl = [];
    for (let i = 0; i < world.fields.length; i++) { const f = world.fields[i]; fl.push(f.active ? [1, r2(f.x), r2(f.z), f.owner] : [0]); }
    const m = { t: 's', w, p, k, f: fl, e: this.outEvents, o: world.over ? world.winner + 1 : 0, mp: world.map, rd: this.round };
    this.outEvents = [];
    return m;
  }

  // ---------- networking: client ----------
  async connect(code) {
    const { app } = this, { ui } = app;
    ui.toast('Joining room ' + code + '...', PAL.teal, true);
    try {
      await net.join(code, {
        onData: (m) => { if (net.onMsg) net.onMsg(m); },
        onClose: (r) => app.netClosed(r),
      });
    } catch (e) {
      app.go('Title', { msg: e.message || 'Could not join that room.' });
    }
  }

  applyRoster(m) {
    const ws = this.app.world.wizards;
    for (let i = 0; i < ws.length; i++) { if (m.n && m.n[i]) ws[i].name = String(m.n[i]).slice(0, 24); ws[i].human = !!(m.h && m.h[i]); }
  }

  onNet(m) {
    if (!m || this.mode !== 'client') return;
    const { app } = this, { world, stage, ui, sfx } = app;
    switch (m.t) {
      case 'welcome':
        world.reset([]);
        this.applyRoster(m.roster);
        this.locals = [{ slot: m.slot, devs: this.p1devs, label: 'P1' }];
        stage.setLocals([m.slot]);
        this.joined = true; this.ended = false; this.endT = 0; this.aliveT = 0; this.shown = 0;
        this.updateControls();
        ui.clearToast(); sfx.play('go');
        this.mapShownFor = -1;
        break;
      case 'roster': this.applyRoster(m); break;
      case 's': this.applySnap(m); break;
      case 'wait': ui.toast('Round in progress - you join the next one', PAL.teal, true); break;
      case 'full': app.net.close(); app.go('Title', { msg: 'That match is full.' }); break;
      default: break;
    }
  }

  applySnap(m) {
    const { world } = this.app;
    if (!this.joined) return;
    for (let i = 0; i < m.w.length && i < world.wizards.length; i++) {
      const a = m.w[i], o = world.wizards[i];
      o.x = a[0]; o.z = a[1]; o.yaw = a[2]; o.hp = a[3];
      const f = a[4];
      o.alive = !!(f & 1); o.human = !!(f & 2); o.slowT = f & 4 ? 1 : 0; o.burnT = f & 8 ? 1 : 0; o.invuln = f & 16 ? 1 : 0; o.inField = !!(f & 32); o.chan = !!(f & 64);
      o.power = a[5]; o.kills = a[6]; o.place = a[7]; o.powerT = a[8];
      o.shieldT = a[9] || 0; o.shieldCd = a[10] || 0; o.q = a[11] || 0; o.qn = a[12] || 0; o.ult = a[13] || 0;
    }
    for (let i = 0; i < world.proj.length; i++) world.proj[i].active = false;
    for (let i = 0; i < m.p.length; i++) {
      const a = m.p[i], q = world.proj[a[0]];
      if (!q) continue;
      q.active = true; q.kind = a[1]; q.x = a[2]; q.z = a[3]; q.vx = a[4]; q.vz = a[5]; q.owner = a[6];
    }
    for (let i = 0; i < m.k.length && i < world.pickups.length; i++) { world.pickups[i].active = !!m.k[i][0]; world.pickups[i].kind = m.k[i][1]; }
    if (m.f) for (let i = 0; i < m.f.length && i < world.fields.length; i++) {
      const a = m.f[i], f = world.fields[i];
      f.active = !!a[0]; if (f.active) { f.x = a[1]; f.z = a[2]; f.owner = a[3]; }
    }
    for (let i = 0; i < m.e.length; i++) { const e = m.e[i]; this.handleEvent(e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7]); }
    if (m.o && !world.over) { world.over = true; world.winner = m.o - 1; }
    if (typeof m.mp === 'number' && m.mp !== world.map) { world.setMap(m.mp); this.app.ui.showMap(m.rd || 1, MAPS[world.map].name, world.map); }
  }

  // ---------- events -> sound, shake, HUD ----------
  handleEvent(type, a, b, x, z, k, x2, z2) {
    const { app } = this, { stage, sfx, ui, world } = app;
    stage.event(type, a, b, x, z, k, x2, z2);
    if (this.fwd && type !== EV.ROUND && this.outEvents.length < 80) this.outEvents.push([type, a, b, r2(x), r2(z), k, r2(x2), r2(z2)]);
    const dx = x - stage.camX, dz = z - stage.camZ;
    const near = Math.max(0, 1 - Math.sqrt(dx * dx + dz * dz) / 50);
    const aMe = this.isLocal(a), bMe = b >= 0 && this.isLocal(b);
    const solo = this.locals.length <= 1;
    const who = (slot) => (solo ? '' : this.locals[this.localIndex(slot)].label + ' ');
    switch (type) {
      case EV.CAST: sfx.play('cast' + Math.min(b, 4), aMe ? 1 : near * 0.7); break;
      case EV.HIT:
        sfx.play('hit', aMe ? 0.9 : near);
        if (aMe) { stage.shake(0.6); if (a === this.local) stage.hurt = 1; sfx.play('hurt'); } else if (bMe) stage.shake(0.18);
        if (k > 0) ui.dmg(x, z, '-' + k, bMe ? PAL.orange : PAL.bone);
        break;
      case EV.KO: {
        sfx.play('ko', aMe ? 1 : near);
        stage.shake(aMe ? 1.1 : near * 0.7);
        const v = world.wizards[a], kl = b >= 0 ? world.wizards[b] : null;
        ui.feed(kl && kl.id !== v.id ? kl.name + ' knocked out ' + v.name : v.name + ' fizzled out', kl ? SLOT_COLORS[kl.id] : PAL.bone);
        if (aMe) { ui.toast(who(a) + 'Knocked out!', PAL.pink, solo); if (solo) ui.aliveSub.textContent = 'spectating'; }
        else if (bMe) ui.toast(who(b) + 'Nice hex! +100', PAL.orange);
        break;
      }
      case EV.PICK:
        if (aMe) { sfx.play('pick'); ui.toast(who(a) + POWER_NAMES[b].toUpperCase() + '!', POWER_COLORS[b]); stage.shake(0.15); } else sfx.play('pick', near * 0.35);
        break;
      case EV.HEAL:
        if (aMe) { sfx.play('heal'); ui.toast(who(a) + '+' + k + ' HP', PAL.heal); ui.dmg(x, z, '+' + k, PAL.heal); } else sfx.play('heal', near * 0.3);
        break;
      case EV.ZAP: sfx.play('zap', near); break;
      case EV.POWEROFF: if (aMe) { sfx.play('off'); if (solo) ui.toast('Power faded', PAL.bone); } break;
      case EV.SHIELD: sfx.play('shield', aMe ? 1 : near * 0.6); break;
      case EV.BLOCK: sfx.play('block', aMe ? 1 : near * 0.7); if (aMe) ui.dmg(x, z, 'BLOCK', PAL.shield); break;
      case EV.DASH: sfx.play('dash', aMe ? 1 : near * 0.6); if (aMe) stage.shake(0.12); break;
      case EV.FIELD: sfx.play('trap', Math.max(near, 0.3)); break;
      case EV.THUNDER: sfx.play('charge'); if (aMe) ui.toast(who(a) + 'THUNDERSHOCK!', 0x7ff3ff); break;
      case EV.STRIKE: sfx.play('thunder'); stage.shake(aMe ? 1.6 : 1.1); break;
      case EV.ULTREADY:
        if (aMe) { sfx.play('ultready'); if (!solo) ui.toast(who(a) + 'Thundershock ready!', 0x7ff3ff); }
        break;
      case EV.ULTLOST: if (aMe) { ui.toast(who(a) + 'Thundershock fizzled', PAL.bone); if (this.aim && this.aim.slot === a) this.endAim(false); } break;
      default: break;
    }
  }

  // ---------- per frame ----------
  update(dt) {
    const { app } = this, { world, stage, ui, input, sfx } = app;
    input.update();
    this.dt = dt;
    const client = this.mode === 'client';
    const lw = this.local >= 0 ? world.wizards[this.local] : null;
    this.eff = this.locals.length === 1 && lw && lw.alive && !world.over ? this.camMode : 0;
    if (this.eff === 0 && document.pointerLockElement) document.exitPointerLock();
    this.updateAim(dt);
    if (this.overT > 0) this.overT -= dt;

    if (!client) {
      this.checkLocalJoins();
      for (let i = 0; i < this.locals.length; i++) {
        const L = this.locals[i], w = world.wizards[L.slot];
        if (w.alive && !world.over) this.readLocal(L, w); else { w.inMx = 0; w.inMz = 0; w.inFire = false; }
      }
      world.update(dt);
      if (this.fwd) this.dropSilent();
      if (this.outEvents.length && !net.conns.length) this.outEvents.length = 0;
      if (this.fwd && net.conns.length) {
        this.snapT += dt;
        if (this.snapT >= 1 / 15 || (world.over && !this.ended)) { this.snapT = 0; net.broadcast(this.buildSnap()); }
      }
    } else {
      // friend online: read controls into our mirrored wizard and send them to the host
      if (lw && lw.alive && !world.over && this.joined) {
        this.readLocal(this.locals[0], lw);
        if (lw.inShield) { this.pendShield = true; lw.inShield = false; }
        if (lw.inQ) { this.pendQ = true; lw.inQ = false; }
      }
      this.sendT += dt; this.helloT += dt;
      if (this.sendT >= 0.05 && this.joined && lw && lw.alive) {
        this.sendT = 0;
        const msg = { t: 'i', mx: r2(lw.inMx), mz: r2(lw.inMz), yaw: r2(lw.inYaw), f: lw.inFire ? 1 : 0, s: this.pendShield ? 1 : 0, q: this.pendQ ? 1 : 0, c: this.chanSend ? 1 : 0 };
        if (this.pendUlt) { msg.u = 1; msg.ux = this.pendUlt.x; msg.uz = this.pendUlt.z; this.pendUlt = null; }
        net.sendHost(msg);
        this.pendShield = false; this.pendQ = false;
      }
      if (this.helloT >= 1) { this.helloT = 0; net.sendHost(this.joined ? { t: 'p' } : { t: 'hello' }); }
      for (let i = 0; i < world.proj.length; i++) { const q = world.proj[i]; if (q.active) { q.x += q.vx * dt; q.z += q.vz * dt; } }
    }

    stage.sync(world, dt, client ? 0.3 : 1);
    stage.hurt = stage.hurt > 0.01 ? stage.hurt * Math.exp(-5 * dt) : 0;
    const hv = stage.hurt > 0.01 ? stage.hurt.toFixed(2) : '0';
    if (hv !== this.hurtShown) { this.hurtShown = hv; ui.hurt.style.opacity = hv; }
    const fv = stage.flash > 0.01 ? (stage.flash * 0.85).toFixed(2) : '0';
    if (fv !== this.flashShown) { this.flashShown = fv; ui.flash.style.opacity = fv; }

    this.updateCamera(dt);
    this.updateHud(dt, lw);

    // round end
    if (world.over && !this.ended && (!client || this.joined)) {
      this.ended = true; this.endT = 0;
      const won = this.isLocal(world.winner);
      sfx.play(won ? 'win' : 'lose');
      ui.clearToast();
      const label = won && this.locals.length > 1 ? this.locals[this.localIndex(world.winner)].label + ' WINS!' : won ? 'VICTORY!' : 'Round over';
      ui.toast(label, won ? PAL.orange : PAL.pink, true);
      if (world.winner >= 0) {
        const v = stage.views[world.winner]; v.happy = 99;
        if (won) { stage.shake(0.5); stage.fx.burst(v.x, 2, v.z, PAL.orange, 60, 9, 1.4, 0.6, 4, 4); }
      }
    }
    if (this.ended) {
      this.endT += dt;
      if (this.endT > 2.4) this.finish(lw);
    }
    ui.update(dt, stage);
  }

  updateCamera(dt) {
    const { world, stage, ui } = this.app;
    const lw = this.local >= 0 ? world.wizards[this.local] : null;
    const view = (this.aim || this.overT > 0) ? 3 : this.eff;
    stage.camMode = view; stage.hideSlot = view === 2 && lw ? lw.id : -1; stage.chaseSlot = (view === 1 || view === 2) && lw ? lw.id : -1;
    ui.xhair.classList.toggle('on', view === 1 || view === 2);
    ui.xhair.classList.toggle('tps', view === 1);
    if (this.mode === 'client' && !this.joined) { stage.orbit(dt); return; }
    if (view === 3) { stage.overview(dt); return; }
    if (view > 0 && lw) { const v = stage.views[lw.id]; stage.chase(v.x, v.z, this.camYaw, this.camPitch, dt, view); return; }
    let n = 0, cx = 0, cz = 0;
    for (let i = 0; i < this.locals.length; i++) {
      const w = world.wizards[this.locals[i].slot];
      if (!w.alive) continue;
      const v = stage.views[w.id]; cx += v.x; cz += v.z; n++;
    }
    if (n > 0) {
      cx /= n; cz /= n;
      let spread = 0;
      for (let i = 0; i < this.locals.length; i++) {
        const w = world.wizards[this.locals[i].slot];
        if (!w.alive) continue;
        const v = stage.views[w.id]; spread = Math.max(spread, Math.hypot(v.x - cx, v.z - cz) * 2);
      }
      stage.follow(cx, cz, dt, spread);
      return;
    }
    this.specT -= dt;
    if (this.specT <= 0 || (this.spec >= 0 && !world.wizards[this.spec].alive)) {
      this.specT = 0.6;
      this.spec = world.nearestEnemy(stage.camX, stage.camZ, -1);
    }
    if (this.spec >= 0) { const v = stage.views[this.spec]; stage.follow(v.x, v.z, dt, 0); }
    else stage.follow(stage.camX, stage.camZ, dt, 0);
  }

  updateHud(dt, lw) {
    const { ui, world } = this.app;
    if (lw) {
      const hp = Math.max(0, Math.ceil(lw.hp));
      if (hp !== this.lastHp) {
        this.lastHp = hp;
        ui.hpFill.style.width = hp + '%'; ui.hpTxt.textContent = hp;
        ui.hp.classList.toggle('low', hp <= 30);
      }
      ui.setPower(lw.power, lw.power > 0 ? Math.max(0, Math.min(1, lw.powerT / TUNE.powerDur)) : 0);
      const sf = lw.shieldT > 0 ? 1 : 1 - Math.max(0, Math.min(1, lw.shieldCd / TUNE.shieldCd));
      ui.setAbilities(sf, lw.shieldT > 0, lw.q, lw.qn);
      const ultOn = lw.ult > 0 && lw.alive && !this.aim;
      if (ultOn !== this.ultShown) { this.ultShown = ultOn; ui.ultbar.classList.toggle('on', ultOn); }
      const tOn = ultOn || (!!this.aim && this.aim.slot === lw.id);
      if (tOn !== this.tultShown) { this.tultShown = tOn; ui.tult.classList.toggle('on', tOn); }
      if (ultOn) {
        const tenths = Math.ceil(lw.ult * 10);
        if (tenths !== this.ultTenths) {
          this.ultTenths = tenths;
          ui.ultTime.style.width = Math.max(0, lw.ult / TUNE.ultTime * 100).toFixed(1) + '%';
          const pad = this.hasPad || this.p1devs.length > 2;
          ui.ultHint.textContent = this.app.input.touch ? 'tap the \u26a1 button' : (pad ? 'press R / Y  \u00b7  ' : 'press R  \u00b7  ') + (tenths / 10).toFixed(1) + 's';
        }
      }
      if (lw.alive && !world.over) this.aliveT += dt;
    }
    // reuse the same card objects every frame (no allocations in the loop)
    const list = this.othersBuf;
    if (!this.cardPool) this.cardPool = [{}, {}, {}];
    list.length = 0;
    for (let i = 1; i < this.locals.length; i++) {
      const L = this.locals[i], w = world.wizards[L.slot], c = this.cardPool[i - 1];
      if (c.slot !== w.id || c.name !== w.name) { c.slot = w.id; c.name = w.name; c.label = L.label + ' ' + w.name; c.color = SLOT_COLORS[w.id]; }
      c.hp = w.hp; c.alive = w.alive;
      list.push(c);
    }
    ui.setOthers(list);
    const n = world.aliveCount();
    if (n !== this.lastAlive) { this.lastAlive = n; ui.aliveN.textContent = n; }
    const target = lw ? lw.kills * 100 + Math.floor(this.aliveT * 3) : 0;
    this.shown += (target - this.shown) * Math.min(1, dt * 8);
    const s = Math.round(this.shown + 0.4);
    if (s !== this.lastScore) { this.lastScore = s; ui.score.textContent = s; }
  }

  finish(lw) {
    const { app } = this, { world } = app;
    if (!this.active) return;
    const won = world.winner === this.local;
    const place = won ? 1 : (lw && lw.place ? lw.place : world.aliveCount() + 1);
    const kills = lw ? lw.kills : 0;
    const base = kills * 100 + Math.floor(this.aliveT * 3);
    const bonus = Math.max(0, 7 - place) * 60 + (won ? 250 : 0);
    let winnerLabel = '';
    if (this.locals.length > 1 && this.isLocal(world.winner)) winnerLabel = this.locals[this.localIndex(world.winner)].label + ' wins!';
    else if (world.winner >= 0 && !won) winnerLabel = world.wizards[world.winner].name + ' won the round';
    app.go('GameOver', { won, place, kills, base, bonus, score: base + bonus, mode: this.mode, secs: Math.round(this.aliveT), winnerLabel, players: this.locals.length, nextMap: MAPS[this.round % MAPS.length].name });
  }
}
