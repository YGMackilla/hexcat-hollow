// Bot brain: grab what it needs, keep a comfortable distance, shoot with a little human error,
// shield against incoming spells, dash to escape or grab potions, throw slow-mo traps at targets.
import { TUNE, POWER, arenaR } from './constants.js';

const ULT = { x: 0, z: 0 };

export function thinkBot(w, world, dt) {
  const b = w.brain;
  b.t -= dt;
  if (b.react > 0) b.react -= dt;
  if (b.shieldT > 0) b.shieldT -= dt;

  const ws = world.wizards;
  if (b.t <= 0) {
    b.t = 0.18 + Math.random() * 0.22;
    const prev = b.target;
    b.target = world.nearestEnemy(w.x, w.z, w.id);
    if (b.target !== prev) b.react = 0.35 + Math.random() * 0.3;
    b.aimErr = (Math.random() - 0.5) * 0.26;
    if (Math.random() < 0.18) b.dir = -b.dir;

    let found = false;
    if (w.hp < 48) found = pickupGoal(w, world, (k) => k === POWER.HEAL, 24, b);
    if (!found && w.power === 0) found = pickupGoal(w, world, (k) => k >= 1 && k <= 3, 14, b);
    if (!found && w.q === 0) found = pickupGoal(w, world, (k) => k === POWER.DASH || k === POWER.TRAP, 11, b);
    if (!found && b.target >= 0) {
      const e = ws[b.target];
      const dx = e.x - w.x, dz = e.z - w.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
      if (d > 11) { b.gx = e.x; b.gz = e.z; }
      else if (d < 5) { b.gx = w.x - dx / d * 6; b.gz = w.z - dz / d * 6; }
      else { b.gx = w.x + (-dz / d) * 5 * b.dir; b.gz = w.z + (dx / d) * 5 * b.dir; }
    } else if (!found) { b.gx = 0; b.gz = 0; }
    const r = Math.sqrt(b.gx * b.gx + b.gz * b.gz), lim = arenaR(b.gx, b.gz) - 2.5;
    if (r > lim) { b.gx *= lim / r; b.gz *= lim / r; }

    // Q spells
    if (w.q === POWER.DASH && w.qn > 0) {
      const gdx = b.gx - w.x, gdz = b.gz - w.z, gd = Math.sqrt(gdx * gdx + gdz * gdz);
      if ((w.hp < 40 && Math.random() < 0.35) || (gd > 7 && Math.random() < 0.12)) w.inQ = true;
    }
    if (w.q === POWER.TRAP && w.qn > 0 && b.target >= 0 && b.react <= 0) {
      const e = ws[b.target], d = Math.hypot(e.x - w.x, e.z - w.z);
      if (d > 4 && d < 11 && Math.random() < 0.25) w.inQ = true;
    }
  }

  // Thundershock: wait a moment (so it feels like aiming), then drop it on the biggest crowd
  w.chan = w.ult > 0; // bots plant their feet and raise the staff while they aim
  if (w.ult > 0) {
    b.ultT -= dt;
    if (b.ultT <= 0 || w.ult < 0.6) {
      world.bestUltSpot(w, ULT);
      w.ultX = ULT.x + (Math.random() - 0.5) * 1.5; w.ultZ = ULT.z + (Math.random() - 0.5) * 1.5; w.inUlt = true;
    }
  }

  // shield when a spell is about to hit
  if (w.shieldT <= 0 && w.shieldCd <= 0 && b.shieldT <= 0) {
    for (let i = 0; i < world.proj.length; i++) {
      const p = world.proj[i];
      if (!p.active || p.owner === w.id) continue;
      const dx = w.x - p.x, dz = w.z - p.z, dd = dx * dx + dz * dz;
      if (dd > 9) continue;
      if (dx * p.vx + dz * p.vz <= 0) continue; // flying away
      b.shieldT = 1.2;
      if (Math.random() < (w.hp < 50 ? 0.55 : 0.3)) w.inShield = true;
      break;
    }
  }

  const dx = b.gx - w.x, dz = b.gz - w.z, d = Math.sqrt(dx * dx + dz * dz);
  if (d > 0.6) { w.inMx = dx / d * 0.92; w.inMz = dz / d * 0.92; } else { w.inMx = 0; w.inMz = 0; }

  w.inFire = false;
  if (b.target >= 0) {
    const e = ws[b.target];
    if (e.alive) {
      const ex = e.x - w.x, ez = e.z - w.z, ed = Math.sqrt(ex * ex + ez * ez);
      const t = TUNE.bolt[w.power > 0 ? w.power : 0];
      const lead = ed / t.speed * 0.6;
      const ax = ex + e.vx * lead, az = ez + e.vz * lead;
      w.inYaw = Math.atan2(ax, az) + b.aimErr;
      if (ed < 17 && b.react <= 0) w.inFire = true;
    }
  } else {
    w.inYaw = Math.atan2(-w.x, -w.z);
  }
}

function pickupGoal(w, world, want, range, b) {
  let best = null, bd = range * range;
  for (let i = 0; i < world.pickups.length; i++) {
    const p = world.pickups[i];
    if (!p.active || !want(p.kind)) continue;
    const dx = p.x - w.x, dz = p.z - w.z, dd = dx * dx + dz * dz;
    if (dd < bd) { bd = dd; best = p; }
  }
  if (!best) return false;
  b.gx = best.x; b.gz = best.z;
  return true;
}
