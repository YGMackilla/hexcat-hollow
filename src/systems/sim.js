// Authoritative game simulation. Runs on the host (or solo). Clients only mirror its state from snapshots.
// Fixed 60 Hz step, no allocations inside update().
import { TUNE, OBST, SPAWNS, PICKUP_SPOTS, SLOT_COLORS, FUR_COLORS, NAMES, POWER, Q_CHARGES, setObstacles, setArena, arenaR, clampArena } from './constants.js';
import { MAPS, SHAPES } from './maps.js';
import { STAFFS } from './staff-list.js';
import { thinkBot } from './bots.js';

export const EV = {
  CAST: 1, HIT: 2, KO: 3, PICK: 4, HEAL: 5, ZAP: 6, POOF: 7, POWEROFF: 8, JOIN: 9, ROUND: 10,
  SHIELD: 11, BLOCK: 12, DASH: 13, FIELD: 14, ULTREADY: 15, THUNDER: 16, ULTLOST: 17, STRIKE: 18,
};

function makeWizard(i) {
  return {
    id: i, name: '', color: SLOT_COLORS[i], fur: FUR_COLORS[i], human: false, alive: true,
    x: 0, z: 0, yaw: 0, vx: 0, vz: 0, hp: TUNE.hp, power: 0, powerT: 0, cd: 0, slowT: 0, burnT: 0,
    burnOwner: -1, burnAcc: 0, invuln: 0, kills: 0, place: 0, ctl: null,
    shieldT: 0, shieldCd: 0, q: 0, qn: 0, qCd: 0, dashT: 0, dashX: 0, dashZ: 0, inField: false,
    ult: 0, streak: 0, inUlt: false, ultX: 0, ultZ: 0, chan: false, staff: 'moon',
    inMx: 0, inMz: 0, inYaw: 0, inFire: false, inShield: false, inQ: false,
    brain: { t: 0, gx: 0, gz: 0, dir: 1, aimErr: 0, react: 0, target: -1, fireLatch: 0, shieldT: 0, ultT: 0 },
  };
}
function makeProjectile() {
  return { active: false, kind: 0, x: 0, z: 0, vx: 0, vz: 0, life: 0, owner: 0, dmg: 0 };
}

export class World {
  constructor() {
    this.wizards = [];
    for (let i = 0; i < TUNE.maxWizards; i++) this.wizards.push(makeWizard(i));
    this.proj = [];
    for (let i = 0; i < TUNE.maxProj; i++) this.proj.push(makeProjectile());
    this.fields = [];
    for (let i = 0; i < TUNE.maxFields; i++) this.fields.push({ active: false, x: 0, z: 0, t: 0, owner: -1 });
    this.pickups = PICKUP_SPOTS.map((p, i) => ({ id: i, x: p[0], z: p[1], active: true, kind: 1, timer: 0 }));
    this.onEvent = null; // (type, a, b, x, z, k, x2, z2)
    this.acc = 0;
    this.time = 0;
    this.over = false;
    this.winner = -1;
    this.noHumanT = 0;
    this.frozen = false;
    this.zapMask = 0;
    this.map = 0;
    this.spawnPts = SPAWNS.map(() => ({ x: 0, z: 0 }));
    this.setMap(0);
    this.strikes = [];
    for (let i = 0; i < 4; i++) this.strikes.push({ t: 0, x: 0, z: 0, owner: -1 });
  }

  setMap(i) {
    this.map = ((i % MAPS.length) + MAPS.length) % MAPS.length;
    setObstacles(MAPS[this.map].obst);
    setArena(SHAPES[MAPS[this.map].shape]);
    // spawn points and pickup spots follow the outline of this map
    for (let k = 0; k < SPAWNS.length; k++) { const p = this.spawnPts[k]; p.x = SPAWNS[k][0]; p.z = SPAWNS[k][1]; clampArena(p, 2.2); }
    for (let k = 0; k < this.pickups.length; k++) { const p = this.pickups[k]; p.x = PICKUP_SPOTS[k][0]; p.z = PICKUP_SPOTS[k][1]; clampArena(p, 2.4); }
  }

  emit(type, a, b, x, z, k, x2, z2) {
    if (this.onEvent) this.onEvent(type, a, b, x, z, k, x2, z2);
  }

  // humanSlots: array of slot indexes controlled by people. Everything else is a bot.
  reset(humanSlots) {
    const used = {};
    for (let i = 0; i < this.wizards.length; i++) {
      const w = this.wizards[i];
      let n;
      do { n = NAMES[(Math.random() * NAMES.length) | 0]; } while (used[n]);
      used[n] = 1;
      w.name = n;
      w.human = humanSlots.indexOf(i) >= 0;
      w.staff = STAFFS[(Math.random() * STAFFS.length) | 0].id; // bots show off random staffs
      w.alive = true; w.hp = TUNE.hp; w.power = 0; w.powerT = 0; w.cd = 0.6; w.slowT = 0; w.burnT = 0;
      w.burnAcc = 0; w.burnOwner = -1; w.invuln = TUNE.invuln; w.kills = 0; w.place = 0; w.ctl = null;
      w.shieldT = 0; w.shieldCd = 0; w.q = 0; w.qn = 0; w.qCd = 0; w.dashT = 0; w.inField = false;
      w.ult = 0; w.streak = 0; w.inUlt = false; w.chan = false;
      w.x = this.spawnPts[i].x; w.z = this.spawnPts[i].z; w.vx = 0; w.vz = 0;
      w.yaw = Math.atan2(-w.x, -w.z); w.inYaw = w.yaw; w.inMx = 0; w.inMz = 0; w.inFire = false; w.inShield = false; w.inQ = false;
      const b = w.brain; b.t = Math.random() * 0.3; b.react = 0.8 + Math.random() * 0.6; b.dir = Math.random() < 0.5 ? 1 : -1;
      b.aimErr = 0; b.target = -1; b.gx = w.x; b.gz = w.z; b.shieldT = 0;
    }
    for (let i = 0; i < this.proj.length; i++) this.proj[i].active = false;
    for (let i = 0; i < this.fields.length; i++) this.fields[i].active = false;
    for (let i = 0; i < this.strikes.length; i++) this.strikes[i].t = 0;
    const outer = [POWER.DASH, POWER.TRAP, POWER.HEAL];
    for (let i = 0; i < this.pickups.length; i++) {
      const p = this.pickups[i];
      p.active = true; p.timer = 0;
      if (i < 6) p.kind = i % 2 === 0 ? 1 + ((i / 2) | 0) : POWER.HEAL;
      else if (i < 9) p.kind = outer[i - 6];
      else if (i === 9) p.kind = 1 + ((Math.random() * 3) | 0);
      else p.kind = [POWER.HEAL, POWER.DASH, 1, POWER.TRAP, 2, 3][(i - 10) % 6];
    }
    this.time = 0; this.acc = 0; this.over = false; this.winner = -1; this.noHumanT = 0;
    this.emit(EV.ROUND, 0, 0, 0, 0, 0, 0, 0);
  }

  aliveCount() {
    let n = 0;
    for (let i = 0; i < this.wizards.length; i++) if (this.wizards[i].alive) n++;
    return n;
  }

  humansAlive() {
    let n = 0;
    for (let i = 0; i < this.wizards.length; i++) { const w = this.wizards[i]; if (w.alive && w.human) n++; }
    return n;
  }

  update(dt) {
    if (this.frozen) return;
    this.acc += dt > 0.1 ? 0.1 : dt;
    const step = TUNE.step;
    while (this.acc >= step) {
      this.acc -= step;
      this.step(step);
    }
  }

  step(dt) {
    this.time += dt;
    const ws = this.wizards;
    this.markFields();
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (!w.alive) continue;
      if (!w.human && !this.over) thinkBot(w, this, dt);
      const tdt = w.inField ? dt * 0.5 : dt; // time trap: everything about you runs slower
      this.abilities(w, tdt);
      this.moveWizard(w, dt);
      this.castLogic(w, tdt);
      if (w.invuln > 0) w.invuln -= dt;
      if (w.slowT > 0) w.slowT -= dt;
      if (w.burnT > 0) {
        w.burnT -= dt; w.burnAcc += dt;
        if (w.burnAcc >= 0.5) { w.burnAcc -= 0.5; this.damage(w, TUNE.burnDps * 0.5, w.burnOwner, w.x, w.z); }
      }
      if (w.power > 0) {
        w.powerT -= dt;
        if (w.powerT <= 0) { w.power = 0; this.emit(EV.POWEROFF, w.id, 0, w.x, w.z, 0, 0, 0); }
      }
    }
    this.separate();
    this.stepProjectiles(dt);
    this.stepFields(dt);
    this.stepStrikes(dt);
    this.stepPickups(dt);
    this.checkRound(dt);
  }

  // ---------- shield (E) and Q spells ----------
  abilities(w, dt) {
    if (w.ult > 0) {
      w.ult -= dt;
      if (w.inUlt && !this.over) { w.inUlt = false; this.thunder(w, w.ultX, w.ultZ); }
      else if (w.ult <= 0) { w.ult = 0; w.chan = false; this.emit(EV.ULTLOST, w.id, 0, w.x, w.z, 0, 0, 0); }
    } else { w.inUlt = false; if (w.human) w.chan = false; }
    if (w.shieldT > 0) { w.shieldT -= dt; if (w.shieldT <= 0) w.shieldCd = TUNE.shieldCd; }
    else if (w.shieldCd > 0) w.shieldCd -= dt;
    if (w.qCd > 0) w.qCd -= dt;
    if (w.dashT > 0) w.dashT -= dt;

    if (w.chan) { w.inShield = false; w.inQ = false; }
    if (w.inShield) {
      w.inShield = false;
      if (w.shieldT <= 0 && w.shieldCd <= 0 && !this.over) {
        w.shieldT = TUNE.shieldT;
        w.burnT = 0;
        this.emit(EV.SHIELD, w.id, 0, w.x, w.z, 0, 0, 0);
      }
    }
    if (w.inQ) {
      w.inQ = false;
      if (w.q === 0 || w.qn <= 0 || w.qCd > 0 || this.over) return;
      if (w.q === POWER.DASH) {
        let dx = w.inMx, dz = w.inMz;
        const m = Math.sqrt(dx * dx + dz * dz);
        if (m < 0.2) { dx = Math.sin(w.inYaw); dz = Math.cos(w.inYaw); } else { dx /= m; dz /= m; }
        w.dashX = dx; w.dashZ = dz; w.dashT = TUNE.dashT; w.qCd = TUNE.dashCd;
        w.invuln = Math.max(w.invuln, 0.12);
        this.emit(EV.DASH, w.id, 0, w.x, w.z, 0, dx, dz);
      } else if (w.q === POWER.TRAP) {
        if (!this.spawnProjectile(w, 4)) return;
        w.qCd = TUNE.bolt[4].cd;
      }
      w.qn--;
      if (w.qn <= 0) { w.q = 0; w.qn = 0; }
    }
  }

  moveWizard(w, dt) {
    if (w.chan) {
      w.dashT = 0; w.vx *= 0.7; w.vz *= 0.7;
    } else if (w.dashT > 0) {
      w.vx = w.dashX * TUNE.dashSpeed; w.vz = w.dashZ * TUNE.dashSpeed;
    } else {
      let mx = w.inMx, mz = w.inMz;
      const m = Math.sqrt(mx * mx + mz * mz);
      if (m > 1) { mx /= m; mz /= m; }
      let sp = TUNE.speed * (w.slowT > 0 ? TUNE.slowMul : 1);
      if (w.inField) sp *= TUNE.fieldMul;
      if (w.shieldT > 0) sp *= 0.8;
      const tvx = mx * sp, tvz = mz * sp;
      const a = TUNE.accel * dt;
      w.vx += clamp(tvx - w.vx, -a, a);
      w.vz += clamp(tvz - w.vz, -a, a);
    }
    w.x += w.vx * dt; w.z += w.vz * dt;
    w.yaw = w.inYaw;
    clampArena(w, TUNE.wizardR);
    for (let i = 0; i < OBST.length; i++) {
      const o = OBST[i];
      const dx = w.x - o[0], dz = w.z - o[1];
      const rr = o[2] + TUNE.wizardR;
      const dd = dx * dx + dz * dz;
      if (dd < rr * rr && dd > 1e-6) {
        const k = Math.sqrt(dd);
        w.x = o[0] + dx / k * rr; w.z = o[1] + dz / k * rr;
      }
    }
  }

  separate() {
    const ws = this.wizards, r2 = TUNE.wizardR * 2;
    for (let i = 0; i < ws.length; i++) {
      const a = ws[i]; if (!a.alive) continue;
      for (let j = i + 1; j < ws.length; j++) {
        const b = ws[j]; if (!b.alive) continue;
        const dx = b.x - a.x, dz = b.z - a.z, dd = dx * dx + dz * dz;
        if (dd < r2 * r2 && dd > 1e-6) {
          const k = Math.sqrt(dd), push = (r2 - k) * 0.5;
          const nx = dx / k, nz = dz / k;
          a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
        }
      }
    }
  }

  spawnProjectile(w, kind) {
    let p = null;
    for (let i = 0; i < this.proj.length; i++) if (!this.proj[i].active) { p = this.proj[i]; break; }
    if (!p) return false;
    const t = TUNE.bolt[kind];
    const sx = Math.sin(w.inYaw), sz = Math.cos(w.inYaw);
    p.active = true; p.kind = kind; p.owner = w.id;
    p.x = w.x + sx * 0.95; p.z = w.z + sz * 0.95;
    p.vx = sx * t.speed; p.vz = sz * t.speed; p.life = t.life; p.dmg = t.dmg;
    this.emit(EV.CAST, w.id, kind, p.x, p.z, 0, sx, sz);
    return true;
  }

  castLogic(w, dt) {
    if (w.cd > 0) w.cd -= dt;
    if (!w.inFire || w.chan || w.cd > 0 || w.invuln > TUNE.invuln - 0.25 || w.shieldT > 0 || w.dashT > 0) return;
    const kind = w.power > 0 ? w.power : 0;
    if (this.spawnProjectile(w, kind)) w.cd = w.human ? TUNE.bolt[kind].cd : TUNE.bolt[kind].cd * TUNE.botFireMul + Math.random() * TUNE.botFireJitter;
  }

  stepProjectiles(dt) {
    const ws = this.wizards;
    for (let i = 0; i < this.proj.length; i++) {
      const p = this.proj[i];
      if (!p.active) continue;
      const slow = this.fieldAt(p.x, p.z, p.owner) ? 0.3 : 1;
      p.x += p.vx * dt * slow; p.z += p.vz * dt * slow; p.life -= dt * slow;
      if (p.life <= 0 || Math.sqrt(p.x * p.x + p.z * p.z) > arenaR(p.x, p.z) + 0.6) { this.endProjectile(p, 0); continue; }
      let dead = false;
      for (let j = 0; j < OBST.length; j++) {
        const o = OBST[j], dx = p.x - o[0], dz = p.z - o[1], rr = o[2] + TUNE.projR;
        if (dx * dx + dz * dz < rr * rr) { dead = true; break; }
      }
      if (dead) { this.endProjectile(p, 1); continue; }
      for (let j = 0; j < ws.length; j++) {
        const w = ws[j];
        if (!w.alive || w.id === p.owner) continue;
        const dx = p.x - w.x, dz = p.z - w.z, rr = TUNE.wizardR + TUNE.projR + (w.shieldT > 0 ? 0.35 : 0);
        if (dx * dx + dz * dz < rr * rr) { this.hit(p, w); p.active = false; break; }
      }
    }
  }

  endProjectile(p, why) {
    p.active = false;
    if (p.kind === 4) this.spawnField(p.x, p.z, p.owner);
    this.emit(EV.POOF, p.kind, why, p.x, p.z, 0, 0, 0);
  }

  hit(p, v) {
    const k = p.kind;
    if (k === 4) { this.spawnField(p.x, p.z, p.owner); this.damage(v, p.dmg, p.owner, p.x, p.z); this.emit(EV.POOF, k, 2, p.x, p.z, 0, 0, 0); return; }
    const blocked = v.shieldT > 0;
    this.damage(v, p.dmg, p.owner, p.x, p.z);
    if (blocked) { this.emit(EV.POOF, k, 2, p.x, p.z, 0, 0, 0); return; }
    if (k === 1 && v.alive) { v.burnT = TUNE.burnT; v.burnOwner = p.owner; }
    if (k === 2 && v.alive) v.slowT = TUNE.slowT;
    if (k === 3) {
      this.zapMask = 1 << v.id;
      let from = v;
      for (let n = 0; n < TUNE.chainMax; n++) {
        let best = null, bd = TUNE.chainRange * TUNE.chainRange;
        for (let i = 0; i < this.wizards.length; i++) {
          const o = this.wizards[i];
          if (!o.alive || o.id === p.owner || (this.zapMask & (1 << o.id))) continue;
          const dx = o.x - from.x, dz = o.z - from.z, dd = dx * dx + dz * dz;
          if (dd < bd) { bd = dd; best = o; }
        }
        if (!best) break;
        this.zapMask |= 1 << best.id;
        this.emit(EV.ZAP, from.id, best.id, from.x, from.z, 0, best.x, best.z);
        this.damage(best, TUNE.chainDmg, p.owner, best.x, best.z);
        from = best;
      }
    }
    this.emit(EV.POOF, k, 2, p.x, p.z, 0, 0, 0);
  }

  damage(v, amount, killer, x, z) {
    if (!v.alive || this.over) return;
    if (v.shieldT > 0) { this.emit(EV.BLOCK, v.id, killer, x, z, 0, 0, 0); return; }
    if (v.invuln > 0) return;
    v.hp -= amount;
    this.emit(EV.HIT, v.id, killer, x, z, Math.round(amount), 0, 0);
    if (v.hp <= 0) {
      v.hp = 0; v.alive = false;
      v.place = this.aliveCount() + 1;
      const k = killer >= 0 ? this.wizards[killer] : null;
      if (k && k.id !== v.id) {
        k.kills++; k.streak++;
        if (k.streak >= TUNE.ultKills && k.alive) {
          k.streak = 0; k.ult = TUNE.ultTime; k.brain.ultT = 0.6 + Math.random() * 1.2;
          this.emit(EV.ULTREADY, k.id, 0, k.x, k.z, 0, 0, 0);
        }
      }
      v.ult = 0; v.streak = 0;
      v.inFire = false; v.vx = 0; v.vz = 0; v.shieldT = 0; v.dashT = 0; v.chan = false;
      this.emit(EV.KO, v.id, killer, v.x, v.z, 0, 0, 0);
    }
  }

  // ---------- Thundershock ultimate ----------
  // The circle appears in the sky and on the ground; the lightning lands half a second later.
  thunder(w, x, z) {
    w.ult = 0; w.chan = false;
    const lim = arenaR(x, z) - 1, d = Math.sqrt(x * x + z * z);
    if (d > lim) { x *= lim / d; z *= lim / d; }
    let s = this.strikes[0];
    for (let i = 0; i < this.strikes.length; i++) if (this.strikes[i].t <= 0) { s = this.strikes[i]; break; }
    s.t = TUNE.ultDelay; s.x = x; s.z = z; s.owner = w.id;
    this.emit(EV.THUNDER, w.id, 0, x, z, 0, 0, 0);
  }

  stepStrikes(dt) {
    const R2 = TUNE.ultR * TUNE.ultR;
    for (let k = 0; k < this.strikes.length; k++) {
      const s = this.strikes[k];
      if (s.t <= 0) continue;
      s.t -= dt;
      if (s.t > 0) continue;
      this.emit(EV.STRIKE, s.owner, 0, s.x, s.z, 0, 0, 0);
      for (let i = 0; i < this.wizards.length; i++) {
        const o = this.wizards[i];
        if (!o.alive || o.id === s.owner) continue;
        const dx = o.x - s.x, dz = o.z - s.z;
        if (dx * dx + dz * dz < R2) { o.invuln = 0; this.damage(o, TUNE.ultDmg, s.owner, o.x, o.z); if (o.alive) o.slowT = Math.max(o.slowT, 1.2); }
      }
    }
  }

  // Best spot for a Thundershock: the enemy with the most other enemies around it.
  bestUltSpot(w, out) {
    let best = -1, bestN = 0;
    const R2 = TUNE.ultR * TUNE.ultR;
    for (let i = 0; i < this.wizards.length; i++) {
      const c = this.wizards[i];
      if (!c.alive || c.id === w.id) continue;
      let n = 0;
      for (let j = 0; j < this.wizards.length; j++) {
        const o = this.wizards[j];
        if (!o.alive || o.id === w.id) continue;
        const dx = o.x - c.x, dz = o.z - c.z;
        if (dx * dx + dz * dz < R2 * 0.8) n++;
      }
      if (n > bestN) { bestN = n; best = i; }
    }
    if (best < 0) { out.x = w.x; out.z = w.z; return 0; }
    out.x = this.wizards[best].x; out.z = this.wizards[best].z;
    return bestN;
  }

  // ---------- slow-mo fields ----------
  spawnField(x, z, owner) {
    let f = this.fields[0];
    for (let i = 0; i < this.fields.length; i++) {
      if (!this.fields[i].active) { f = this.fields[i]; break; }
      if (this.fields[i].t < f.t) f = this.fields[i];
    }
    f.active = true; f.x = x; f.z = z; f.t = TUNE.fieldT; f.owner = owner;
    this.emit(EV.FIELD, owner, 0, x, z, 0, 0, 0);
  }

  stepFields(dt) {
    for (let i = 0; i < this.fields.length; i++) {
      const f = this.fields[i];
      if (f.active) { f.t -= dt; if (f.t <= 0) f.active = false; }
    }
  }

  fieldAt(x, z, notOwner) {
    const R2 = TUNE.fieldR * TUNE.fieldR;
    for (let i = 0; i < this.fields.length; i++) {
      const f = this.fields[i];
      if (!f.active || f.owner === notOwner) continue;
      const dx = x - f.x, dz = z - f.z;
      if (dx * dx + dz * dz < R2) return true;
    }
    return false;
  }

  markFields() {
    for (let i = 0; i < this.wizards.length; i++) {
      const w = this.wizards[i];
      w.inField = w.alive && this.fieldAt(w.x, w.z, w.id);
    }
  }

  // ---------- pickups ----------
  stepPickups(dt) {
    const ws = this.wizards, R2 = TUNE.pickupR * TUNE.pickupR;
    for (let i = 0; i < this.pickups.length; i++) {
      const p = this.pickups[i];
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.active = true;
          const r = Math.random();
          p.kind = r < 0.25 ? POWER.HEAL : r < 0.55 ? (Math.random() < 0.5 ? POWER.DASH : POWER.TRAP) : 1 + ((Math.random() * 3) | 0);
          this.emit(EV.JOIN, i, p.kind, p.x, p.z, 0, 0, 0);
        }
        continue;
      }
      for (let j = 0; j < ws.length; j++) {
        const w = ws[j];
        if (!w.alive) continue;
        const dx = w.x - p.x, dz = w.z - p.z;
        if (dx * dx + dz * dz > R2) continue;
        if (p.kind === POWER.HEAL) {
          if (w.hp >= TUNE.hp) continue;
          w.hp = Math.min(TUNE.hp, w.hp + TUNE.heal);
          w.burnT = 0;
          this.emit(EV.HEAL, w.id, i, p.x, p.z, TUNE.heal, 0, 0);
        } else if (p.kind === POWER.DASH || p.kind === POWER.TRAP) {
          w.q = p.kind; w.qn = Q_CHARGES[p.kind];
          this.emit(EV.PICK, w.id, p.kind, p.x, p.z, i, 0, 0);
        } else {
          w.power = p.kind; w.powerT = TUNE.powerDur;
          this.emit(EV.PICK, w.id, p.kind, p.x, p.z, i, 0, 0);
        }
        p.active = false; p.timer = TUNE.pickupRespawn;
        break;
      }
    }
  }

  checkRound(dt) {
    if (this.over) return;
    const alive = this.aliveCount();
    let humans = 0;
    for (let i = 0; i < this.wizards.length; i++) if (this.wizards[i].human) humans++;
    let end = alive <= 1;
    if (!end && humans > 0 && this.humansAlive() === 0) {
      this.noHumanT += dt;
      if (this.noHumanT > 2.2) end = true;
    }
    if (end) {
      this.over = true;
      this.winner = -1;
      for (let i = 0; i < this.wizards.length; i++) {
        const w = this.wizards[i];
        if (w.alive && alive === 1) { this.winner = w.id; w.place = 1; }
        else if (w.alive) w.place = alive;
      }
      for (let i = 0; i < this.wizards.length; i++) { const w = this.wizards[i]; w.inFire = false; w.inMx = 0; w.inMz = 0; }
    }
  }

  nearestEnemy(x, z, exclude) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < this.wizards.length; i++) {
      const w = this.wizards[i];
      if (!w.alive || w.id === exclude) continue;
      const dx = w.x - x, dz = w.z - z, dd = dx * dx + dz * dz;
      if (dd < bd) { bd = dd; best = i; }
    }
    return best;
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
