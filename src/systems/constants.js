// One palette, one typeface, all tuning numbers. Everything else imports from here.

export const FONT = "'Chewy', cursive";

export const PAL = {
  night: 0x0b0618,
  fog: 0x150a2c,
  ground: 0x1d1430,
  groundHi: 0x2a1d47,
  stone: 0x4b4668,
  moon: 0xfff1c9,
  orange: 0xff8a1f,
  purple: 0x8a4bff,
  teal: 0x1de9c6,
  pink: 0xff5fa2,
  lime: 0xa6ff3c,
  blue: 0x4aa8ff,
  fire: 0xff5a1f,
  ice: 0x7fe6ff,
  storm: 0xd9b8ff,
  heal: 0x5cff8a,
  dash: 0xffd34a,
  trap: 0x9d7bff,
  shield: 0x7ff3ff,
  ink: 0x120a22,
  bone: 0xf3ead2,
  basic: 0xffe9a8,
};

// Per slot: name/bolt colour, fur colour, and cape+hat colour. Each player is easy to tell apart.
export const SLOT_COLORS = [0xff9a3c, 0xb28cff, 0x4fe0b8, 0xff7ab8, 0xe8dc4a, 0x6cb8ff];
export const FUR_COLORS = [0xff8a2a, 0xa57bff, 0x2fd6a8, 0xff6aae, 0xf0d42a, 0x4fa8ff];
export const ROBE_COLORS = [0x5b2fc9, 0x0f8f80, 0xc23a74, 0x3a2a9a, 0x2f7f45, 0xd2601a];

export const NAMES = [
  'Whiskerbell', 'Sir Purrcival', 'Mittens Maleficent', 'Pumpkin Paws', 'Count Catula',
  'Spooky Biscuit', 'Hexy', 'Luna Mewmoon', 'Tabby Grimm', 'Professor Fluff',
  'Boo Whiskers', 'Salem Jr.', 'Madame Meow', 'Noodle Hex', 'Captain Claws',
];

// Elements (change your main spell for a while): 1 fire, 2 ice, 3 storm.
// Q-spells (charges, cast with Q): 5 dash, 6 slow-mo trap. Pickup kind 4 = healing potion.
export const POWER = { NONE: 0, FIRE: 1, ICE: 2, STORM: 3, HEAL: 4, DASH: 5, TRAP: 6 };
export const POWER_NAMES = ['Spell Bolt', 'Fire', 'Ice', 'Storm', 'Potion', 'Air Dash', 'Slow-mo Trap'];
export const POWER_COLORS = [PAL.basic, PAL.fire, PAL.ice, PAL.storm, PAL.heal, PAL.dash, PAL.trap];
export const POWER_ICONS = ['basic', 'fire', 'ice', 'storm', 'heal', 'dash', 'trap'];
export const Q_CHARGES = { 5: 3, 6: 2 };

export const TUNE = {
  arenaR: 17,
  maxWizards: 6,
  hp: 100,
  speed: 6.6,
  accel: 46,
  wizardR: 0.7,
  projR: 0.3,
  step: 1 / 60,
  invuln: 1.6,
  powerDur: 16,
  heal: 35,
  pickupR: 1.35,
  pickupRespawn: 9,
  // per projectile kind: [damage, cooldown, speed, life]. Kind 4 is the slow-mo trap shot.
  bolt: [
    { dmg: 9, cd: 0.42, speed: 20, life: 1.25 },   // basic
    { dmg: 12, cd: 0.5, speed: 17, life: 1.4 },    // fire
    { dmg: 10, cd: 0.5, speed: 16, life: 1.5 },    // ice
    { dmg: 15, cd: 0.7, speed: 27, life: 1.0 },    // storm
    { dmg: 4, cd: 0.4, speed: 12, life: 1.1 },     // slow-mo trap shot
  ],
  burnT: 3, burnDps: 5,
  slowT: 2.5, slowMul: 0.5,
  chainRange: 6.5, chainDmg: 8, chainMax: 2,
  maxProj: 48,
  // shield: everybody has one on E
  shieldT: 1.6, shieldCd: 7,
  // dash
  dashT: 0.2, dashSpeed: 24, dashCd: 0.35,
  // slow-mo fields
  fieldR: 3.3, fieldT: 4.5, fieldMul: 0.3, maxFields: 6,
  // Thundershock ultimate: earned every 2 knockouts, must be used within 5 seconds
  // bots cast slower than people: cooldown x botFireMul plus up to botFireJitter seconds
  botFireMul: 3.6, botFireJitter: 0.8,
  ultKills: 2, ultTime: 5, ultR: 11, ultDmg: 45, ultDelay: 0.5,
};

// Obstacles of the current map: [x, z, collider radius, prop type]. Filled in place by setObstacles() so
// every module holding this array sees the new map.
export const OBST = [];
export function setObstacles(list) {
  OBST.length = 0;
  for (let i = 0; i < list.length; i++) OBST.push(list[i]);
}

// Arena outline of the current map, as the wall distance from the centre for each of 360 directions.
// Every map's floor is star-shaped around the centre, so "how far can I go this way" is all the rules need.
export const ARENA = { r: new Float32Array(360), max: 17 };
export function setArena(shape) {
  let mx = 0;
  for (let i = 0; i < 360; i++) { const a = (i + 0.5) / 360 * Math.PI * 2 - Math.PI; ARENA.r[i] = shape(a); if (ARENA.r[i] > mx) mx = ARENA.r[i]; }
  ARENA.max = mx;
}
// wall distance in the direction of (x, z)
export function arenaR(x, z) {
  let i = ((Math.atan2(z, x) + Math.PI) / (Math.PI * 2) * 360) | 0;
  if (i >= 360) i = 359; else if (i < 0) i = 0;
  return ARENA.r[i];
}
// pull a point back inside the outline (keeping `margin` from the wall); writes into o.x / o.z
export function clampArena(o, margin) {
  const d = Math.sqrt(o.x * o.x + o.z * o.z);
  if (d < 1e-6) return o;
  const lim = arenaR(o.x, o.z) - margin;
  if (d > lim) { o.x *= lim / d; o.z *= lim / d; }
  return o;
}

export const SPAWNS = [];
export const PICKUP_SPOTS = [];
(function build() {
  for (let i = 0; i < 6; i++) {
    const a = (i * 60) * Math.PI / 180;
    SPAWNS.push([Math.cos(a) * 28, Math.sin(a) * 28]);
    PICKUP_SPOTS.push([Math.cos(a) * 16.4, Math.sin(a) * 16.4]);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i * 120 + 90) * Math.PI / 180;
    PICKUP_SPOTS.push([Math.cos(a) * 28.4, Math.sin(a) * 28.4]);
  }
  PICKUP_SPOTS.push([0, 0]);
  // inner ring (maps are twice as big, so there is more to fight over)
  for (let i = 0; i < 6; i++) {
    const a = (i * 60 + 30) * Math.PI / 180;
    PICKUP_SPOTS.push([Math.cos(a) * 9, Math.sin(a) * 9]);
  }
})();

export const SAVE_KEY = 'hexcat-hollow.v1';
