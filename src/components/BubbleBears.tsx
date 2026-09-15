import { useEffect, useRef } from "react";
import { bubbleBearConfig, supportsBubbleBearRenderer } from "../lib/bearConfig";

const SPAWN_BEAR = 0.7;
const FUNGUS_SHARE = 0.05;

const BEAR_VARIANTS = 5;
const FRUIT_VARIANTS = 7;

const DEG = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const STEER = 0.6;
const PUSH_BIAS = 2.4;
const SEPARATION_KICK = 55;
const SEPARATION_VEL = 2.5;
const FLING_CAP_MULT = 12;
const SQUASH_SPRING = 300;
const SQUASH_DAMP = 7;
const SQUASH_MAX = 0.12;
const SQUASH_VEL = 0.018;
const SPAWN_ATTEMPTS = 16;
const SPAWN_PAD = 6;
const GRAB_DAMP = 0.08;
const GRAB_SPIN_CAP = 100000;
const GRAB_SUBSTEPS = 8;
const GRAB_ANCHOR_RESPONSE = 18;
const POINTER_RESPONSE = 24;
const OFFSCREEN = 110;
const DESPAWN = 180;
const MAX_SUBSTEPS = 4;
const PHYSICS_BUDGET = 1.2;
const MAX_BEARS = 200;
const QUALITY_MIN_UNIT = 0.5;
const QUALITY_SLOW = 0.024;
const QUALITY_PANIC = 0.034;
const QUALITY_DOWN = 0.0195;
const QUALITY_UP = 0.0178;
const QUALITY_QUIET_SHARE = 0.05;
const UNPIN_DELAY_MS = 800;
const LOOP_GAP_MS = 64;
const QUALITY_BAD_SHARE = 0.35;
const QUALITY_PANIC_SHARE = 0.5;
const QUALITY_WINDOW = 0.75;
const QUALITY_SAMPLES = 192;
const QUALITY_HOLD_DOWN = 8;
const QUALITY_BAD_WINDOWS = 2;
const QUALITY_HOLD_UP = 4;
const QUALITY_WARMUP = 3.5;
const QUALITY_LADDER = [1, 0.8, 0.62, 0.5, 0.4, 0.32, 0.25];
const MAX_GRID_SCALE = 1.3;
const PLANT_SPRING = 34;
const PLANT_DAMPING = 7;
const PLANT_TORQUE = 0.018;
const PLANT_WAVE_SPEED = 8;
const MOUSE_TORQUE_MULTIPLIER = 500;
const LEG_ROW = 112;
const LEG_OVERLAP = 2;
const LEG_GAP = 4;
const LEG_SWING = 0.07;
const LEG_WAVE_SPEED = 9;
const HAIR_EXTEND = 8;
const REPAINT_PAD = 2;
const REPAINT_GAP = 0.25;

let unitDpr = 1;
let offscreen = OFFSCREEN;
let despawn = DESPAWN;
let spawnPad = SPAWN_PAD;
let grabbedBear: Bear | null = null;

let hitCount = 0;
let pairCount = 0;
let pushSum = 0;
let contactCount = 0;
let instrument = false;

interface BearDebugSnapshot {
  species: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  angle: number;
  av: number;
  scale: number;
  hw: number;
  hh: number;
  sq: number;
  gx: number;
  gy: number;
  grabbed: boolean;
}

interface BearDebugMetrics {
  bears: number;
  hits: number;
  pairs: number;
  push: number;
  physicsMs: number;
  renderMs: number;
  substeps: number;
  quality: number;
  unit: number;
}

interface BearDebugBridge {
  setCount: (count: number) => void;
  snapshot: () => BearDebugSnapshot[];
  metrics: () => BearDebugMetrics;
  reset: () => void;
  viewport: () => { width: number; height: number; unit: number; top: number; bottom: number };
  overlap: () => { worst: number; pairs: number };
  spawn: (id: string, x: number, y: number, angle: number, scale: number) => boolean;
  hit: (a: string, ax: number, ay: number, aAngle: number, b: string, bx: number, by: number, bAngle: number, scale: number) => number;
  setQuality: (quality: number) => void;
  setAdaptive: (enabled: boolean) => void;
}

function setUnit(unit: number) {
  unitDpr = unit;
  offscreen = OFFSCREEN * unit;
  despawn = DESPAWN * unit;
  spawnPad = SPAWN_PAD * unit;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);

interface Phys {
  uprightGain: number;
  uprightDamp: number;
  settleAccel: number;
  settleRate: number;
  approachGain: number;
  approachLag: number;
  spinRef: number;
  spinDrag: number;
  spinCap: number;
  lean: number;
  leanMax: number;
  bob: number;
  bobRate: number;
  bobSpeedRef: number;
  stepSquash: number;
  massScale: number;
  restitution: number;
  pushBias: number;
  separation: number;
  cruiseMin: number;
  cruiseMax: number;
  spinScale: number;
  grabDamp: number;
  grabUpright: number;
  grabTorque: number;
  squashScale: number;
  hairSway: number;
}

const BEAR_PHYS: Phys = {
  uprightGain: 0,
  uprightDamp: 0,
  settleAccel: 0,
  settleRate: 0,
  approachGain: 0,
  approachLag: 0,
  spinRef: 0,
  spinDrag: 0,
  spinCap: 0,
  lean: 0,
  leanMax: 0,
  bob: 0,
  bobRate: 0,
  bobSpeedRef: 0,
  stepSquash: 0,
  massScale: 1,
  restitution: 1.8,
  pushBias: 1,
  separation: 1,
  cruiseMin: 16,
  cruiseMax: 40,
  spinScale: 1,
  grabDamp: 0,
  grabUpright: 0,
  grabTorque: 1,
  squashScale: 1,
  hairSway: 1,
};

const FRUIT_GIRL_PHYS: Phys = {
  uprightGain: 40,
  uprightDamp: 12.6,
  settleAccel: 120,
  settleRate: 120,
  approachGain: 3,
  approachLag: 5,
  spinRef: 60,
  spinDrag: 1.2,
  spinCap: 3600,
  lean: 0.3,
  leanMax: 22,
  bob: 5,
  bobRate: 0.15,
  bobSpeedRef: 40,
  stepSquash: 0.05,
  massScale: 1.9,
  restitution: 1.4,
  pushBias: 1.3,
  separation: 1,
  cruiseMin: 12,
  cruiseMax: 26,
  spinScale: 0,
  grabDamp: 0,
  grabUpright: 0,
  grabTorque: 1,
  squashScale: 1.5,
  hairSway: 0.5,
};

interface HitBox {
  halfW: number;
  halfH: number;
  centerY: number;
}

interface Geometry {
  w: number;
  h: number;
  bodyTop: number;
  bodyH: number;
  bodyDrawH: number;
  halfW: number;
  halfH: number;
  bodyHalfH: number;
  bodyCenterY: number;
  headCenterY: number;
  comY: number;
  comMoment: number;
  grabPointY: number;
  bodyDrawY: number;
  hairAnchorY: number;
  legTopY: number;
  legCutY: number;
  legW: number;
  legCenterX: number;
  legH: number;
  boxes: HitBox[];
  boundRadius: number;
  cullRadius: number;
}

function makeGeometry(w: number, h: number, bodyTop: number, boxes: HitBox[] = [], legs = 0): Geometry {
  const bodyH = h - bodyTop;
  const halfW = w / 2;
  const halfH = h / 2;
  const bodyHalfH = bodyH / 2;
  const bodyCenterY = bodyTop - halfH + bodyHalfH;
  const headCenterY = -halfH + bodyTop / 2;
  const bodyMass = w * bodyH;
  const headMass = w * bodyTop * 0.35;
  const totalMass = bodyMass + headMass;
  const comY = (bodyMass * bodyCenterY + headMass * headCenterY) / totalMass;
  const bodyMoment = (bodyMass * (w * w + bodyH * bodyH)) / 12;
  const headMoment = (headMass * (w * w + bodyTop * bodyTop)) / 12;
  return {
    w,
    h,
    bodyTop,
    bodyH,
    bodyDrawH: legs > 0 ? legs - bodyTop : bodyH,
    halfW,
    halfH,
    bodyHalfH,
    bodyCenterY,
    headCenterY,
    comY,
    comMoment:
      bodyMoment + bodyMass * (bodyCenterY - comY) ** 2 + headMoment + headMass * (headCenterY - comY) ** 2,
    grabPointY: -halfH + h * 0.25,
    bodyDrawY: bodyCenterY - bodyHalfH,
    hairAnchorY: bodyTop - halfH,
    legTopY: legs > 0 ? legs - halfH : 0,
    legCutY: legs > 0 ? legs - LEG_OVERLAP - halfH : 0,
    legW: legs > 0 ? halfW : 0,
    legCenterX: legs > 0 ? LEG_GAP + (halfW - LEG_GAP) / 2 : 0,
    legH: legs > 0 ? h - legs + LEG_OVERLAP : 0,
    boxes: boxes.length > 0 ? boxes : [{ halfW, halfH: bodyHalfH, centerY: bodyCenterY }],
    boundRadius: Math.sqrt(halfW * halfW + bodyHalfH * bodyHalfH),
    cullRadius: Math.sqrt(halfW * halfW + halfH * halfH),
  };
}

interface Species {
  id: string;
  kind: "bear" | "fungus" | "fruitgirl";
  src: string;
  phys: Phys;
  geo: Geometry;
  body: ImageBitmap;
  hair: ImageBitmap | null;
  legs: ImageBitmap[] | null;
}

interface Assets {
  all: Species[];
  bears: Species[];
  fungus: Species | null;
  fruitgirls: Species[];
}

interface SpeciesDef {
  id: string;
  kind: Species["kind"];
  src: string;
  w: number;
  h: number;
  bodyTop: number;
  legRow?: number;
  boxes?: HitBox[];
  phys: Phys;
}

const BEAR_DEFS: SpeciesDef[] = Array.from({ length: BEAR_VARIANTS }, (_, index) => ({
  id: `bubblebear_v${index}`,
  kind: "bear" as const,
  src: `/vermin/bubblebear_v${index}.png`,
  w: 56,
  h: 136,
  bodyTop: 40,
  legRow: LEG_ROW,
  phys: BEAR_PHYS,
}));

const FUNGUS_DEF: SpeciesDef = {
  id: "bubblebear_fungus_v0",
  kind: "fungus",
  src: "/vermin/bubblebear_fungus_v0.png",
  w: 56,
  h: 136,
  bodyTop: 40,
  legRow: LEG_ROW,
  phys: BEAR_PHYS,
};

const FRUIT_GIRL_BOXES: HitBox[] = [
  { halfW: 44, halfH: 44, centerY: 36 },
  { halfW: 36, halfH: 20, centerY: -28 },
];

const FRUIT_GIRL_DEFS: SpeciesDef[] = Array.from({ length: FRUIT_VARIANTS }, (_, index) => ({
  id: `fruitgirl_v${index}`,
  kind: "fruitgirl" as const,
  src: `/vermin/fruitgirl_v${index}.png`,
  w: 88,
  h: 160,
  bodyTop: 32,
  boxes: FRUIT_GIRL_BOXES,
  phys: FRUIT_GIRL_PHYS,
}));

const SPECIES_DEFS: SpeciesDef[] = [...BEAR_DEFS, FUNGUS_DEF, ...FRUIT_GIRL_DEFS];
const SPECIES_BOUND_RADIUS = SPECIES_DEFS.reduce(
  (max, def) => Math.max(max, makeGeometry(def.w, def.h, def.bodyTop, def.boxes, def.legRow).boundRadius),
  1,
);
const MIN_SPECIES_HALF_W = SPECIES_DEFS.reduce(
  (min, def) => Math.min(min, makeGeometry(def.w, def.h, def.bodyTop, def.boxes, def.legRow).halfW),
  Infinity,
);

interface Bear {
  sp: Species;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  cruise: number;
  angle: number;
  av: number;
  gx: number;
  gy: number;
  grabTargetX: number;
  grabTargetY: number;
  plantAngle: number;
  plantVelocity: number;
  step: number;
  scale: number;
  mass: number;
  hw: number;
  hh: number;
  off: number;
  comY: number;
  radius: number;
  cull: number;
  cx: number;
  cy: number;
  xx: number;
  xy: number;
  yx: number;
  yy: number;
  ta: number;
  tb: number;
  tc: number;
  td: number;
  te: number;
  tf: number;
  sq: number;
  sqv: number;
  spinning: boolean;
  spinDir: number;
  spinLimit: number;
  ahead: number;
  vis: boolean;
  ma: number;
  mb: number;
  mc: number;
  md: number;
  me: number;
  mf: number;
  two: boolean;
  b2w: number;
  b2h: number;
  b2y: number;
}

function applySize(bear: Bear) {
  const geo = bear.sp.geo;
  const s = bear.scale * unitDpr;
  const box = geo.boxes[0];
  bear.hw = box.halfW * s;
  bear.hh = box.halfH * s;
  bear.off = box.centerY * s;
  bear.comY = geo.comY * s;
  bear.radius = geo.boundRadius * s;
  bear.cull = geo.cullRadius * s;
  const second = geo.boxes[1];
  bear.two = !!second;
  if (second) {
    bear.b2w = second.halfW * s;
    bear.b2h = second.halfH * s;
    bear.b2y = second.centerY * s;
  }
}

function makeBear(species: Species): Bear {
  const geo = species.geo;
  return {
    sp: species,
    x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, cruise: 0, angle: 0, av: 0, gx: 0, gy: 0,
    scale: 1, mass: 1, hw: geo.boxes[0].halfW, hh: geo.boxes[0].halfH, off: geo.boxes[0].centerY, comY: geo.comY,
    radius: geo.boundRadius, cull: geo.cullRadius, grabTargetX: 0, grabTargetY: geo.grabPointY,
    plantAngle: 0, plantVelocity: 0, step: 0,
    cx: 0, cy: 0, xx: 1, xy: 0, yx: 0, yy: 1, ta: 1, tb: 0, tc: 0, td: 1, te: 0, tf: 0,
    sq: 0, sqv: 0, spinning: false, spinDir: 0, spinLimit: 0, ahead: 0, vis: true,
    ma: 1, mb: 0, mc: 0, md: 1, me: 0, mf: 0,
    two: false, b2w: 0, b2h: 0, b2y: 0,
  };
}

function pickSpecies(assets: Assets): Species {
  const roll = Math.random();
  if (roll < SPAWN_BEAR) {
    if (assets.fungus && Math.random() < FUNGUS_SHARE) return assets.fungus;
    return assets.bears[Math.floor(Math.random() * assets.bears.length)];
  }
  return assets.fruitgirls[Math.floor(Math.random() * assets.fruitgirls.length)];
}

function placeSpawn(bear: Bear, w: number, h: number) {
  const edge = Math.floor(Math.random() * 4);
  if (edge === 0) {
    bear.x = -offscreen;
    bear.y = rand(0, h);
    bear.tx = w + offscreen + despawn;
    bear.ty = rand(0, h);
  } else if (edge === 1) {
    bear.x = w + offscreen;
    bear.y = rand(0, h);
    bear.tx = -offscreen - despawn;
    bear.ty = rand(0, h);
  } else if (edge === 2) {
    bear.x = rand(0, w);
    bear.y = -offscreen;
    bear.tx = rand(0, w);
    bear.ty = h + offscreen + despawn;
  } else {
    bear.x = rand(0, w);
    bear.y = h + offscreen;
    bear.tx = rand(0, w);
    bear.ty = -offscreen - despawn;
  }
}

function spawnClearance(bear: Bear, bears: Bear[], self: Bear) {
  let clearance = Infinity;
  for (let k = 0; k < bears.length; k += 1) {
    const other = bears[k];
    if (other === self) continue;
    const dx = other.x - bear.x;
    const dy = other.y - bear.y;
    const r = bear.cull + spawnPad + other.cull;
    const gap = dx * dx + dy * dy - r * r;
    if (gap < clearance) clearance = gap;
  }
  return clearance;
}

function respawn(bear: Bear, w: number, h: number, bears: Bear[], self: Bear, assets: Assets) {
  const { speed, rotation, scale } = bubbleBearConfig;
  const species = pickSpecies(assets);
  const phys = species.phys;
  bear.sp = species;
  bear.cruise = rand(phys.cruiseMin, phys.cruiseMax) * speed;
  bear.angle = phys.uprightGain > 0 ? rand(-phys.leanMax, phys.leanMax) * 0.4 : rand(0, 360);
  bear.av = rand(-rotation, rotation) * phys.spinScale;
  bear.scale = scale * rand(0.7, MAX_GRID_SCALE);
  bear.mass = bear.scale * bear.scale * phys.massScale;
  bear.step = rand(0, Math.PI * 2);
  bear.spinning = false;
  bear.spinDir = 0;
  bear.spinLimit = 0;
  bear.ahead = 0;
  bear.plantAngle = 0;
  bear.plantVelocity = 0;
  bear.grabTargetY = species.geo.grabPointY;
  applySize(bear);
  bear.sq = 0;
  bear.sqv = 0;

  let clearance = -Infinity;
  let bestX = bear.x;
  let bestY = bear.y;
  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
    placeSpawn(bear, w, h);
    const gap = spawnClearance(bear, bears, self);
    if (gap > clearance) {
      clearance = gap;
      bestX = bear.x;
      bestY = bear.y;
    }
    if (gap > 0) break;
  }
  bear.x = bestX;
  bear.y = bestY;

  const dx = bear.tx - bear.x;
  const dy = bear.ty - bear.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  bear.vx = (dx / d) * bear.cruise;
  bear.vy = (dy / d) * bear.cruise;
}

function clampSpeed(bear: Bear) {
  if (bear === grabbedBear) return;
  const cap = bear.cruise * FLING_CAP_MULT;
  const s2 = bear.vx * bear.vx + bear.vy * bear.vy;
  if (s2 > cap * cap) {
    const k = cap / Math.sqrt(s2);
    bear.vx *= k;
    bear.vy *= k;
  }
}

interface Contact {
  depth: number;
  nx: number;
  ny: number;
  ahh: number;
  bhh: number;
}

const contact: Contact = { depth: 0, nx: 0, ny: 0, ahh: 0, bhh: 0 };

function computeContact(a: Bear, b: Bear): boolean {
  if (!a.two && !b.two) {
    return axisContact(a, b, a.hw, a.hh, b.hw, b.hh, b.cx - a.cx, b.cy - a.cy);
  }
  const aCount = a.two ? 2 : 1;
  const bCount = b.two ? 2 : 1;
  let found = false;
  let bestDepth = 0;
  let bestNx = 0;
  let bestNy = 0;
  let bestAhh = 0;
  let bestBhh = 0;
  for (let ia = 0; ia < aCount; ia += 1) {
    const acy = ia === 0 ? a.off : a.b2y;
    const aw = ia === 0 ? a.hw : a.b2w;
    const ah = ia === 0 ? a.hh : a.b2h;
    const acx = a.x - acy * a.xy;
    const acy2 = a.y + acy * a.xx;
    for (let ib = 0; ib < bCount; ib += 1) {
      const bcy = ib === 0 ? b.off : b.b2y;
      const bw = ib === 0 ? b.hw : b.b2w;
      const bh = ib === 0 ? b.hh : b.b2h;
      const dx = b.x - bcy * b.xy - acx;
      const dy = b.y + bcy * b.xx - acy2;
      if (!axisContact(a, b, aw, ah, bw, bh, dx, dy)) continue;
      if (!found || contact.depth > bestDepth) {
        found = true;
        bestDepth = contact.depth;
        bestNx = contact.nx;
        bestNy = contact.ny;
        bestAhh = contact.ahh;
        bestBhh = contact.bhh;
      }
    }
  }
  if (!found) return false;
  contact.depth = bestDepth;
  contact.nx = bestNx;
  contact.ny = bestNy;
  contact.ahh = bestAhh;
  contact.bhh = bestBhh;
  return true;
}

function axisContact(a: Bear, b: Bear, aw: number, ah: number, bw: number, bh: number, dx: number, dy: number): boolean {
  const align = a.xx * b.xx + a.xy * b.xy;
  const cross = a.xy * b.xx - a.xx * b.xy;
  const ca = align < 0 ? -align : align;
  const sa = cross < 0 ? -cross : cross;

  let best = Infinity;
  let nax = 0;
  let nay = 0;

  let o = aw + bw * ca + bh * sa - Math.abs(dx * a.xx + dy * a.xy);
  if (o <= 0) return false;
  best = o;
  nax = a.xx;
  nay = a.xy;

  o = ah + bw * sa + bh * ca - Math.abs(dx * a.yx + dy * a.yy);
  if (o <= 0) return false;
  if (o < best) {
    best = o;
    nax = a.yx;
    nay = a.yy;
  }

  o = bw + aw * ca + ah * sa - Math.abs(dx * b.xx + dy * b.xy);
  if (o <= 0) return false;
  if (o < best) {
    best = o;
    nax = b.xx;
    nay = b.xy;
  }

  o = bh + aw * sa + ah * ca - Math.abs(dx * b.yx + dy * b.yy);
  if (o <= 0) return false;
  if (o < best) {
    best = o;
    nax = b.yx;
    nay = b.yy;
  }

  if (dx * nax + dy * nay < 0) {
    nax = -nax;
    nay = -nay;
  }

  contact.depth = best;
  contact.nx = nax;
  contact.ny = nay;
  contact.ahh = ah;
  contact.bhh = bh;
  return true;
}

function collide(a: Bear, b: Bear) {
  const reach = a.cull + b.cull;
  const bx = b.x - a.x;
  const by = b.y - a.y;
  if (bx * bx + by * by > reach * reach) return;
  if (instrument) pairCount += 1;
  if (!computeContact(a, b)) return;

  const best = contact.depth;
  const nax = contact.nx;
  const nay = contact.ny;

  const impactForce = bubbleBearConfig.hitForce * bubbleBearConfig.speed;
  const restitution = (a.sp.phys.restitution + b.sp.phys.restitution) / 2;
  const pushBias = (a.sp.phys.pushBias + b.sp.phys.pushBias) / 2;
  const separation = (a.sp.phys.separation + b.sp.phys.separation) / 2;
  const invA = a === grabbedBear ? 0 : 1 / a.mass;
  const invB = b === grabbedBear ? 0 : 1 / b.mass;
  const invSum = invA + invB;
  if (invSum === 0) return;
  const push = best * PUSH_BIAS * pushBias;
  contactCount += 1;
  if (instrument) {
    hitCount += 1;
    pushSum += push;
  }
  const pa = (push * invA) / invSum;
  const pb = (push * invB) / invSum;

  a.x -= nax * pa;
  a.y -= nay * pa;
  a.cx -= nax * pa;
  a.cy -= nay * pa;
  b.x += nax * pb;
  b.y += nay * pb;
  b.cx += nax * pb;
  b.cy += nay * pb;


  const vn = (b.vx - a.vx) * nax + (b.vy - a.vy) * nay;
  const closing = vn < 0 ? -vn : 0;
  if (vn < 0) {
    const impulse = (-(1 + restitution * impactForce) * vn) / invSum;
    a.vx -= impulse * nax * invA;
    a.vy -= impulse * nay * invA;
    b.vx += impulse * nax * invB;
    b.vy += impulse * nay * invB;
  }

  const kick = best * SEPARATION_KICK * impactForce * separation + closing * SEPARATION_VEL * impactForce * separation;
  a.vx -= nax * kick * invA;
  a.vy -= nay * kick * invA;
  b.vx += nax * kick * invB;
  b.vy += nay * kick * invB;

  clampSpeed(a);
  clampSpeed(b);

  const denom = contact.ahh < contact.bhh ? contact.ahh : contact.bhh;
  const impact = (push / denom) * 0.6 + closing * SQUASH_VEL;
  if (impact > 0) {
    const wa = invA / invSum;
    const wb = invB / invSum;
    let sa = impact * wa * 2 * SQUASH_MAX * a.sp.phys.squashScale;
    let sb = impact * wb * 2 * SQUASH_MAX * b.sp.phys.squashScale;
    if (sa > SQUASH_MAX) sa = SQUASH_MAX;
    if (sb > SQUASH_MAX) sb = SQUASH_MAX;
    if (sa > a.sq) a.sq = sa;
    if (sb > b.sq) b.sq = sb;
  }
}

async function loadBitmap(src: string): Promise<ImageBitmap> {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return await createImageBitmap(blob, { colorSpaceConversion: "none" });
  } catch {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    await img.decode();
    return createImageBitmap(img, { colorSpaceConversion: "none" });
  }
}

async function loadSpecies(def: SpeciesDef): Promise<Species> {
  const legRow = def.legRow ?? 0;
  const full = await loadBitmap(def.src);
  const geo = makeGeometry(def.w, def.h, def.bodyTop, def.boxes, legRow);
  const body = def.bodyTop > 0 ? await createImageBitmap(full, 0, def.bodyTop, def.w, geo.bodyDrawH, { colorSpaceConversion: "none" }) : full;
  let hair: ImageBitmap | null = null;
  if (def.bodyTop > 0) {
    const canvas = document.createElement("canvas");
    canvas.width = def.w;
    canvas.height = def.bodyTop + HAIR_EXTEND;
    const hctx = canvas.getContext("2d");
    if (hctx) {
      hctx.imageSmoothingEnabled = false;
      hctx.drawImage(full, 0, 0, def.w, def.bodyTop, 0, 0, def.w, def.bodyTop);
      for (let i = 0; i < HAIR_EXTEND; i += 1) {
        hctx.drawImage(full, 0, def.bodyTop - 1, def.w, 1, 0, def.bodyTop + i, def.w, 1);
      }
    }
    hair = await createImageBitmap(canvas, { colorSpaceConversion: "none" });
  }
  let legs: ImageBitmap[] | null = null;
  if (legRow > 0) {
    const cut = legRow - LEG_OVERLAP;
    const legW = geo.legW;
    legs = [
      await createImageBitmap(full, 0, cut, legW, geo.legH, { colorSpaceConversion: "none" }),
      await createImageBitmap(full, legW, cut, legW, geo.legH, { colorSpaceConversion: "none" }),
    ];
  }
  if (hair || legs) full.close();
  return {
    id: def.id,
    kind: def.kind,
    src: def.src,
    phys: def.phys,
    geo,
    body,
    hair,
    legs,
  };
}

async function loadSpeciesSet(): Promise<Assets> {
  const loaded = await Promise.all(SPECIES_DEFS.map(loadSpecies));
  const byId = new Map(loaded.map((species) => [species.id, species]));
  return {
    all: loaded,
    bears: BEAR_DEFS.map((def) => byId.get(def.id)).filter((s): s is Species => !!s),
    fungus: byId.get(FUNGUS_DEF.id) ?? null,
    fruitgirls: FRUIT_GIRL_DEFS.map((def) => byId.get(def.id)).filter((s): s is Species => !!s),
  };
}

function closeAssets(assets: Assets) {
  for (const species of assets.all) {
    species.body.close();
    if (species.hair) species.hair.close();
    if (species.legs) for (const leg of species.legs) leg.close();
  }
}

function pickBear(bears: Bear[], wx: number, wy: number) {
  for (let i = bears.length - 1; i >= 0; i -= 1) {
    const b = bears[i];
    const dx = wx - b.x;
    const dy = wy - b.y;
    const lx = dx * b.xx + dy * b.xy;
    const ly = -dx * b.xy + dy * b.xx;
    const hw = b.sp.geo.halfW * b.scale * unitDpr;
    const hh = b.sp.geo.halfH * b.scale * unitDpr;
    if (lx >= -hw && lx <= hw && ly >= -hh && ly <= hh) return b;
  }
  return null;
}

function updatePlant(bear: Bear, dt: number) {
  const sway = bear.sp.phys.hairSway;
  bear.plantVelocity += (-bear.plantAngle * PLANT_SPRING - bear.plantVelocity * PLANT_DAMPING - bear.av * PLANT_TORQUE * sway) * dt;
  bear.plantAngle += bear.plantVelocity * dt;
  const limit = 0.55 * sway;
  if (bear.plantAngle > limit) {
    bear.plantAngle = limit;
    if (bear.plantVelocity > 0) bear.plantVelocity = 0;
  } else if (bear.plantAngle < -limit) {
    bear.plantAngle = -limit;
    if (bear.plantVelocity < 0) bear.plantVelocity = 0;
  }
}

function updateSquash(bear: Bear, dt: number) {
  bear.sqv -= bear.sq * SQUASH_SPRING * dt;
  const damp = 1 - SQUASH_DAMP * dt;
  bear.sqv *= damp > 0 ? damp : 0;
  bear.sq += bear.sqv * dt;
  if (bear.sq > SQUASH_MAX) {
    bear.sq = SQUASH_MAX;
    if (bear.sqv > 0) bear.sqv = 0;
  } else if (bear.sq < -SQUASH_MAX) {
    bear.sq = -SQUASH_MAX;
    if (bear.sqv < 0) bear.sqv = 0;
  }
}

function updateFrame(bear: Bear) {
  const rad = bear.angle * DEG;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  bear.xx = cos;
  bear.xy = sin;
  bear.yx = -sin;
  bear.yy = cos;
  bear.cx = bear.x - bear.off * sin;
  bear.cy = bear.y + bear.off * cos;
}

function clampSpin(bear: Bear) {
  const cap = bear.sp.phys.spinCap;
  if (cap > 0) {
    if (bear.av > cap) bear.av = cap;
    else if (bear.av < -cap) bear.av = -cap;
  }
}


function shortestTurn(error: number) {
  return ((error % 360) + 540) % 360 - 180;
}

function forwardTurn(error: number, direction: number) {
  const ahead = ((error % 360) + 360) % 360;
  return direction > 0 ? ahead : ahead - 360;
}

function stepPhysics(bear: Bear, dt: number) {
  const phys = bear.sp.phys;
  const speed = Math.sqrt(bear.vx * bear.vx + bear.vy * bear.vy);
  if (phys.uprightGain > 0) {
    const lean = clamp(bear.vx * phys.lean, -phys.leanMax, phys.leanMax);
    const shortest = shortestTurn(lean - bear.angle);
    if (bear.spinning) {
      bear.av -= bear.av * phys.spinDrag * dt;
      if (Math.abs(bear.av) <= phys.spinRef) {
        bear.spinning = false;
        bear.ahead = bear.spinDir !== 0 ? forwardTurn(lean - bear.angle, bear.spinDir) : 0;
      }
    }
    if (!bear.spinning) {
      if (bear.spinDir !== 0) {
        const ahead = forwardTurn(lean - bear.angle, bear.spinDir);
        const passed = Math.abs(ahead - bear.ahead) > 90;
        bear.ahead = ahead;
        if (passed || (Math.abs(shortest) < 25 && Math.abs(bear.av) < 40)) {
          bear.spinDir = 0;
        } else {
          const ceiling = bear.spinLimit > 0 ? Math.min(phys.settleRate, bear.spinLimit) : phys.settleRate;
          const rate = Math.min(Math.abs(ahead) * phys.approachGain, ceiling);
          bear.av += (Math.sign(bear.spinDir) * rate - bear.av) * (1 - Math.exp(-phys.approachLag * dt));
        }
      }
      if (bear.spinDir === 0) {
        const accel = shortest * phys.uprightGain - bear.av * phys.uprightDamp;
        bear.av += clamp(accel, -phys.settleAccel, phys.settleAccel) * dt;
        if (Math.abs(shortest) < 5 && Math.abs(bear.av) < 8) bear.spinLimit = 0;
      }
    }
    if (bear.spinLimit > 0 && Math.abs(bear.av) > bear.spinLimit) {
      bear.av = bear.av > 0 ? bear.spinLimit : -bear.spinLimit;
    }
    clampSpin(bear);
    bear.angle += bear.av * dt;
    bear.step += dt * walkRate(phys, speed);
  } else {
    bear.angle += bear.av * dt;
  }
}

function walkRate(phys: Phys, speed: number) {
  if (phys.bobSpeedRef <= 0) return phys.bobRate * speed;
  return phys.bobRate * phys.bobSpeedRef * (1 - Math.exp(-speed / phys.bobSpeedRef));
}

function integrate(bear: Bear, dt: number, w: number, h: number, bears: Bear[], self: Bear, assets: Assets) {
  const dx = bear.tx - bear.x;
  const dy = bear.ty - bear.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  bear.vx += ((dx / d) * bear.cruise - bear.vx) * STEER * dt;
  bear.vy += ((dy / d) * bear.cruise - bear.vy) * STEER * dt;
  bear.x += bear.vx * dt;
  bear.y += bear.vy * dt;

  stepPhysics(bear, dt);
  updateSquash(bear, dt);
  if (bear.sp.hair) updatePlant(bear, dt);

  if (bear.x < -despawn || bear.x > w + despawn || bear.y < -despawn || bear.y > h + despawn) {
    respawn(bear, w, h, bears, self, assets);
  }

  updateFrame(bear);
}

function integrateGrabbed(bear: Bear, dt: number, px: number, py: number, cvx: number, cvy: number, accX: number, accY: number) {
  const phys = bear.sp.phys;
  const geo = bear.sp.geo;
  const inertia = geo.comMoment * bear.scale * bear.scale * unitDpr * unitDpr;
  const anchorLerp = 1 - Math.exp(-GRAB_ANCHOR_RESPONSE * dt);
  bear.gx += (bear.grabTargetX - bear.gx) * anchorLerp;
  bear.gy += (bear.grabTargetY - bear.gy) * anchorLerp;

  let mx = -bear.gx;
  let my = bear.comY - bear.gy;
  let r2 = mx * mx + my * my;
  const minLever = 10 * unitDpr * bear.scale;
  if (r2 < minLever * minLever) {
    const r = Math.sqrt(r2);
    if (r > 1e-6) {
      const k = minLever / r;
      mx *= k;
      my *= k;
    } else {
      mx = 0;
      my = minLever;
    }
    r2 = mx * mx + my * my;
  }
  const ip = inertia + r2;
  const gravity = bubbleBearConfig.gravity * unitDpr;

  const hs = dt / GRAB_SUBSTEPS;
  let angle = bear.angle;
  let av = bear.av;
  for (let i = 0; i < GRAB_SUBSTEPS; i += 1) {
    const rad = angle * DEG;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const vx = mx * cos - my * sin;
    const vy = mx * sin + my * cos;
    const gravityTorque = gravity * vx;
    const mouseTorque = MOUSE_TORQUE_MULTIPLIER * phys.grabTorque * (vy * accX - vx * accY);
    const uprightTorque = phys.grabUpright * -angle;
    const angularAcceleration = ((gravityTorque + mouseTorque) / ip) * RAD_TO_DEG + uprightTorque;
    av += (angularAcceleration - (GRAB_DAMP + phys.grabDamp) * av) * hs;
    if (av > GRAB_SPIN_CAP) av = GRAB_SPIN_CAP;
    else if (av < -GRAB_SPIN_CAP) av = -GRAB_SPIN_CAP;
    angle += av * hs;
  }
  bear.angle = angle;
  bear.av = av;
  clampSpin(bear);

  const rad = angle * DEG;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const gxw = bear.gx * cos - bear.gy * sin;
  const gyw = bear.gx * sin + bear.gy * cos;
  bear.x = px - gxw;
  bear.y = py - gyw;
  const angularVelocity = av * DEG;
  bear.vx = cvx + angularVelocity * gyw;
  bear.vy = cvy - angularVelocity * gxw;

  const speed = Math.sqrt(bear.vx * bear.vx + bear.vy * bear.vy);
  if (phys.uprightGain > 0) bear.step += dt * walkRate(phys, speed);

  updateSquash(bear, dt);
  if (bear.sp.hair) updatePlant(bear, dt);
  updateFrame(bear);
}

export default function BubbleBears({ dim = 0 }: { dim?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bubbleBearConfig.count === 0 || !supportsBubbleBearRenderer()) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let disposed = false;
    let raf = 0;
    let assets: Assets | null = null;
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;

    const baseDpr = Math.min(window.devicePixelRatio || 1, bubbleBearConfig.dprCap);
    let unitMax = baseDpr;
    let quality = 1;
    setUnit(baseDpr);

    const bears: Bear[] = [];

    let cols = 1;
    let rows = 1;
    let cell = 1;
    let head = new Int32Array(1);
    let next = new Int32Array(MAX_BEARS);
    let lastW = 0;
    let lastH = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let prevX = 0;
    let prevY = 0;
    let lastClientX = 0;
    let lastClientY = 0;
    let simulationTime = 0;
    let visibleTop = 0;
    let visibleBottom = 0;
    let smoothVx = 0;
    let smoothVy = 0;
    let prevAccVx = 0;
    let prevAccVy = 0;

    const isInteractive = (node: EventTarget | null) => {
      const el = node as Element | null;
      if (!el || !el.closest) return false;
      return !!el.closest(
        "button, a, img, input, textarea, select, label, [role='button'], [contenteditable='true'], header, footer, nav",
      );
    };

    const onGrabMove = (e: PointerEvent) => {
      if (!grabbedBear) return;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      pointerTargetX = e.clientX * dpr;
      pointerTargetY = e.clientY * dpr;
      e.preventDefault();
    };

    const endGrab = () => {
      if (grabbedBear && Math.abs(grabbedBear.av) > 25) {
        grabbedBear.spinning = true;
        grabbedBear.spinDir = grabbedBear.av > 0 ? 1 : -1;
        grabbedBear.spinLimit = Math.abs(grabbedBear.av);
      }
      grabbedBear = null;
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onGrabMove);
      window.removeEventListener("pointerup", endGrab);
      window.removeEventListener("pointercancel", endGrab);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (mobile || e.pointerType === "touch" || e.button !== 0 || grabbedBear) return;
      if (isInteractive(e.target)) return;
      const wx = e.clientX * dpr;
      const wy = e.clientY * dpr;
      const bear = pickBear(bears, wx, wy);
      if (!bear) return;
      grabbedBear = bear;
      const idx = bears.indexOf(bear);
      if (idx >= 0 && idx !== bears.length - 1) {
        bears.splice(idx, 1);
        bears.push(bear);
      }
      bear.sq = 0;
      bear.sqv = 0;
      const gdx = wx - bear.x;
      const gdy = wy - bear.y;
      bear.gx = gdx * bear.xx + gdy * bear.xy;
      bear.gy = -gdx * bear.xy + gdy * bear.xx;
      bear.grabTargetX = 0;
      bear.grabTargetY = bear.sp.geo.grabPointY * bear.scale * unitDpr;
      pointerX = wx;
      pointerY = wy;
      pointerTargetX = wx;
      pointerTargetY = wy;
      prevX = wx;
      prevY = wy;
      smoothVx = 0;
      smoothVy = 0;
      prevAccVx = 0;
      prevAccVy = 0;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      document.body.style.cursor = "grabbing";
      window.addEventListener("pointermove", onGrabMove, { passive: false });
      window.addEventListener("pointerup", endGrab);
      window.addEventListener("pointercancel", endGrab);
      e.preventDefault();
    };

    const onHover = (e: PointerEvent) => {
      if (mobile || grabbedBear || e.pointerType === "touch") return;
      const want =
        !isInteractive(e.target) && pickBear(bears, e.clientX * dpr, e.clientY * dpr) ? "grab" : "";
      if (document.body.style.cursor !== want) document.body.style.cursor = want;
    };

    const resize = () => {
      unitMax = Math.min(window.devicePixelRatio || 1, bubbleBearConfig.dprCap);
      dpr = unitMax * quality;
      setUnit(dpr);
      const header = document.querySelector<HTMLElement>(".site-header");
      const footer = document.querySelector<HTMLElement>(".site-footer");
      visibleTop = (header?.getBoundingClientRect().bottom || 0) * dpr;
      visibleBottom = (footer?.getBoundingClientRect().top || window.innerHeight) * dpr;
      const w = Math.max(1, Math.round(window.innerWidth * dpr));
      const h = Math.max(1, Math.round(window.innerHeight * dpr));
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      cssW = w;
      cssH = h;
      canvas.width = w;
      canvas.height = h;
      ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < bears.length; i += 1) applySize(bears[i]);

      const maxRadius = SPECIES_BOUND_RADIUS * bubbleBearConfig.scale * MAX_GRID_SCALE * unitDpr;
      cell = Math.max(1, 2 * maxRadius);
      cols = Math.max(1, Math.ceil((cssW + 2 * despawn) / cell) + 1);
      rows = Math.max(1, Math.ceil((cssH + 2 * despawn) / cell) + 1);
      head = new Int32Array(cols * rows);
    };

    const coveredByChrome = (bear: Bear) =>
      bear.y + bear.cull <= visibleTop || bear.y - bear.cull >= visibleBottom;

    const resolvePass = () => {
      head.fill(-1);
      for (let i = 0; i < bears.length; i += 1) {
        const bear = bears[i];
        let col = ((bear.x + despawn) / cell) | 0;
        let row = ((bear.y + despawn) / cell) | 0;
        if (col < 0) col = 0;
        else if (col >= cols) col = cols - 1;
        if (row < 0) row = 0;
        else if (row >= rows) row = rows - 1;
        const id = row * cols + col;
        next[i] = head[id];
        head[id] = i;
      }

      for (let i = 0; i < bears.length; i += 1) {
        const a = bears[i];
        let col = ((a.x + despawn) / cell) | 0;
        let row = ((a.y + despawn) / cell) | 0;
        if (col < 0) col = 0;
        else if (col >= cols) col = cols - 1;
        if (row < 0) row = 0;
        else if (row >= rows) row = rows - 1;
        const c0 = col > 0 ? col - 1 : 0;
        const c1 = col < cols - 1 ? col + 1 : cols - 1;
        const r0 = row > 0 ? row - 1 : 0;
        const r1 = row < rows - 1 ? row + 1 : rows - 1;
        for (let r = r0; r <= r1; r += 1) {
          const base = r * cols;
          for (let c = c0; c <= c1; c += 1) {
            for (let j = head[base + c]; j !== -1; j = next[j]) {
              if (j <= i) continue;
              collide(a, bears[j]);
            }
          }
        }
      }
      return contactCount;
    };

    const resolve = () => {
      contactCount = 0;
      resolvePass();
      if (contactCount === 0 || physicsMs > PHYSICS_BUDGET) return;
      contactCount = 0;
      resolvePass();
      if (contactCount === 0 || physicsMs > PHYSICS_BUDGET) return;
      contactCount = 0;
      resolvePass();
    };

    const integrateAll = (sdt: number, accX: number, accY: number, cvx: number, cvy: number) => {
      for (let i = 0; i < bears.length; i += 1) {
        const b = bears[i];
        if (b === grabbedBear) integrateGrabbed(b, sdt, pointerX, pointerY, cvx, cvy, accX, accY);
        else integrate(b, sdt, cssW, cssH, bears, b, assets as Assets);
      }
    };

    let physicsMs = 0;
    let renderMs = 0;
    let subSteps = 1;

    const applyQuality = (next: number) => {
      const target = next > unitMax ? unitMax : next < QUALITY_MIN_UNIT ? QUALITY_MIN_UNIT : next;
      if (target === unitDpr) return;
      const ratio = target / unitDpr;
      quality = target / unitMax;
      qualityWarmup = 1;
      for (let i = 0; i < bears.length; i += 1) {
        const b = bears[i];
        b.x *= ratio;
        b.y *= ratio;
        b.cx *= ratio;
        b.cy *= ratio;
        b.vx *= ratio;
        b.vy *= ratio;
        b.tx *= ratio;
        b.ty *= ratio;
        b.cruise *= ratio;
        b.gx *= ratio;
        b.gy *= ratio;
        b.grabTargetY *= ratio;
      }
      if (grabbedBear) {
        pointerX = lastClientX * dpr;
        pointerY = lastClientY * dpr;
        pointerTargetX = pointerX;
        pointerTargetY = pointerY;
        prevX = pointerX;
        prevY = pointerY;
        smoothVx *= ratio;
        smoothVy *= ratio;
        prevAccVx *= ratio;
        prevAccVy *= ratio;
      }
      lastW = 0;
      lastH = 0;
      resize();
      for (let i = 0; i < bears.length; i += 1) updateFrame(bears[i]);
    };

    let qualityElapsed = 0;
    let qualityWarmup = QUALITY_WARMUP;
    let qualityFrames = 0;
    let qualityBad = 0;
    let qualityStep = 0;
    let qualityHold = 0;
    let adaptive = true;
    const qualityTimes = new Float64Array(QUALITY_SAMPLES);

    const tuneQuality = (dt: number) => {
      if (!adaptive) return;
      if (qualityWarmup > 0) {
        qualityWarmup -= dt;
        qualityElapsed = 0;
        qualityFrames = 0;
        return;
      }
      if (dt > 0.25) return;
      qualityElapsed += dt;
      qualityFrames += 1;
      if (qualityFrames <= QUALITY_SAMPLES) qualityTimes[qualityFrames - 1] = dt;
      if (qualityElapsed < QUALITY_WINDOW) return;
      const sampled = qualityFrames < QUALITY_SAMPLES ? qualityFrames : QUALITY_SAMPLES;
      const sorted = qualityTimes.subarray(0, sampled);
      sorted.sort();
      const median = sorted[sampled >> 1];
      let slow = 0;
      for (let i = 0; i < sampled; i += 1) if (sorted[i] > QUALITY_SLOW) slow += 1;
      const share = slow / qualityFrames;
      if (qualityHold > 0) qualityHold -= 1;
      const low = median > QUALITY_DOWN || share > QUALITY_BAD_SHARE;
      if ((low && qualityStep < QUALITY_LADDER.length - 1) || share > QUALITY_PANIC_SHARE) {
        qualityBad += 1;
        if (qualityBad >= QUALITY_BAD_WINDOWS || share > QUALITY_PANIC_SHARE) {
          qualityStep += median > QUALITY_PANIC || share > QUALITY_PANIC_SHARE ? 2 : 1;
          if (qualityStep > QUALITY_LADDER.length - 1) qualityStep = QUALITY_LADDER.length - 1;
          applyQuality(unitMax * QUALITY_LADDER[qualityStep]);
          qualityBad = 0;
          qualityHold = QUALITY_HOLD_DOWN;
        }
      } else if (qualityStep > 0 && qualityHold <= 0 && median < QUALITY_UP && share < QUALITY_QUIET_SHARE) {
        qualityBad = 0;
        qualityStep -= 1;
        applyQuality(unitMax * QUALITY_LADDER[qualityStep]);
        qualityHold = QUALITY_HOLD_UP;
      } else if (median <= QUALITY_DOWN) {
        qualityBad = 0;
      }
      qualityElapsed = 0;
      qualityFrames = 0;
    };

    const step = (now: number) => {
      if (disposed) return;
      const elapsed = (now - last) / 1000;
      if (elapsed > REPAINT_GAP) fullClear = true;
      let dt = elapsed > 0.05 ? 0.05 : elapsed;
      last = now;
      tuneQuality(dt);

      const active = bears.length > 1;
      let sub = 1;
      if (active && bubbleBearConfig.speed > 1.5) {
        let maxStep = 0;
        for (let i = 0; i < bears.length; i += 1) {
          const b = bears[i];
          const v = Math.abs(b.vx) > Math.abs(b.vy) ? Math.abs(b.vx) : Math.abs(b.vy);
          if (v > maxStep) maxStep = v;
        }
        const minExtent = MIN_SPECIES_HALF_W * bubbleBearConfig.scale * unitDpr * 0.7;
        sub = Math.ceil((maxStep * dt) / minExtent) | 0;
        const ceiling = physicsMs > PHYSICS_BUDGET * 2 ? 1 : physicsMs > PHYSICS_BUDGET ? 2 : MAX_SUBSTEPS;
        if (sub < 1) sub = 1;
        else if (sub > ceiling) sub = ceiling;
      }

      const idt = dt > 0 ? 1 / dt : 0;
      let accX = 0;
      let accY = 0;
      let cvx = 0;
      let cvy = 0;
      if (grabbedBear) {
        const pointerLerp = 1 - Math.exp(-POINTER_RESPONSE * dt);
        pointerX += (pointerTargetX - pointerX) * pointerLerp;
        pointerY += (pointerTargetY - pointerY) * pointerLerp;
        const k = Math.min(1, 20 * dt);
        smoothVx += ((pointerX - prevX) * idt - smoothVx) * k;
        smoothVy += ((pointerY - prevY) * idt - smoothVy) * k;
        accX = (smoothVx - prevAccVx) * idt;
        accY = (smoothVy - prevAccVy) * idt;
        prevAccVx = smoothVx;
        prevAccVy = smoothVy;
        cvx = smoothVx;
        cvy = smoothVy;
      }

      const physicsStart = performance.now();
      if (sub > 1) {
        const sdt = dt / sub;
        for (let s = 0; s < sub; s += 1) {
          integrateAll(sdt, accX, accY, cvx, cvy);
          if (active) resolve();
        }
      } else {
        integrateAll(dt, accX, accY, cvx, cvy);
        if (active) resolve();
      }
      subSteps = sub;
      physicsMs = performance.now() - physicsStart;

      simulationTime += dt;
      if (grabbedBear) {
        prevX = pointerX;
        prevY = pointerY;
      }

      const renderStart = performance.now();
      render(simulationTime);
      renderMs = performance.now() - renderStart;

      raf = requestAnimationFrame(step);
    };

    let fullClear = true;
    let prevMinX = 0;
    let prevMinY = 0;
    let prevMaxX = 0;
    let prevMaxY = 0;
    let bMinX = 0;
    let bMinY = 0;
    let bMaxX = 0;
    let bMaxY = 0;

    const addQuad = (
      m0: number, m1: number, m2: number, m3: number, m4: number, m5: number,
      x0: number, x1: number, y0: number, y1: number,
    ) => {
      const ex0 = m0 * x0 + m4;
      const ex1 = m0 * x1 + m4;
      const cy0 = m2 * y0;
      const cy1 = m2 * y1;
      const ey0 = m1 * x0 + m5;
      const ey1 = m1 * x1 + m5;
      const dy0 = m3 * y0;
      const dy1 = m3 * y1;
      const xa = ex0 + cy0;
      const xb = ex0 + cy1;
      const xc = ex1 + cy0;
      const xd = ex1 + cy1;
      if (xa < bMinX) bMinX = xa;
      if (xb < bMinX) bMinX = xb;
      if (xc < bMinX) bMinX = xc;
      if (xd < bMinX) bMinX = xd;
      if (xa > bMaxX) bMaxX = xa;
      if (xb > bMaxX) bMaxX = xb;
      if (xc > bMaxX) bMaxX = xc;
      if (xd > bMaxX) bMaxX = xd;
      const ya = ey0 + dy0;
      const yb = ey0 + dy1;
      const yc = ey1 + dy0;
      const yd = ey1 + dy1;
      if (ya < bMinY) bMinY = ya;
      if (yb < bMinY) bMinY = yb;
      if (yc < bMinY) bMinY = yc;
      if (yd < bMinY) bMinY = yd;
      if (ya > bMaxY) bMaxY = ya;
      if (yb > bMaxY) bMaxY = yb;
      if (yc > bMaxY) bMaxY = yc;
      if (yd > bMaxY) bMaxY = yd;
    };

    const render = (time: number) => {
      if (!assets) return;
      const sizeBase = unitDpr;
      const wave = time * PLANT_WAVE_SPEED;
      const waveSway = Math.sin(wave);
      const waveShear = Math.sin(wave - 0.8);

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (let i = 0; i < bears.length; i += 1) {
        const b = bears[i];
        if (coveredByChrome(b) || b.x + b.cull < 0 || b.x - b.cull > cssW) {
          b.vis = false;
          continue;
        }
        b.vis = true;
        const geo = b.sp.geo;
        const phys = b.sp.phys;
        const s = b.scale * sizeBase;
        const cos = b.xx;
        const sin = b.xy;
        const wobble = phys.stepSquash > 0 ? Math.abs(Math.sin(b.step)) * phys.stepSquash : 0;
        const sx = (1 + b.sq + wobble * 0.6) * s;
        const sy = (1 - b.sq - wobble) * s;
        const ta = sx * cos;
        const tb = sx * sin;
        const tc = -sy * sin;
        const td = sy * cos;
        const te = b.x;
        const tf = b.y + (phys.bob > 0 ? Math.sin(b.step) * phys.bob * s : 0);
        b.ta = ta;
        b.tb = tb;
        b.tc = tc;
        b.td = td;
        b.te = te;
        b.tf = tf;

        bMinX = Infinity;
        bMinY = Infinity;
        bMaxX = -Infinity;
        bMaxY = -Infinity;
        const pad = (b.sp.legs ? LEG_SWING * geo.legH : 0) + REPAINT_PAD;
        addQuad(ta, tb, tc, td, te, tf, -geo.halfW - pad, geo.halfW + pad, geo.bodyDrawY - pad, geo.bodyDrawY + geo.bodyH + pad);

        if (b.sp.hair) {
          const motion = Math.min(1, Math.abs(b.av) * 0.002 + Math.abs(b.sqv) * 0.08);
          const swayScale = phys.hairSway;
          const rot = b.plantAngle + waveSway * (0.1 + motion * 0.25) * swayScale;
          const shear = waveShear * (0.12 + motion * 0.4) * swayScale;
          const cr = Math.cos(rot);
          const sr = Math.sin(rot);
          const ha = cr;
          const hb = sr;
          const hc = cr * shear - sr;
          const hd = sr * shear + cr;
          const anchor = geo.hairAnchorY;
          const ma = ta * ha + tc * hb;
          const mb = tb * ha + td * hb;
          const mc = ta * hc + tc * hd;
          const md = tb * hc + td * hd;
          const me = tc * anchor + te;
          const mf = td * anchor + tf;
          b.ma = ma;
          b.mb = mb;
          b.mc = mc;
          b.md = md;
          b.me = me;
          b.mf = mf;
          addQuad(ma, mb, mc, md, me, mf, -geo.halfW - pad, geo.halfW + pad, -geo.bodyTop - pad, HAIR_EXTEND + pad);
        }

        if (bMinX < minX) minX = bMinX;
        if (bMinY < minY) minY = bMinY;
        if (bMaxX > maxX) maxX = bMaxX;
        if (bMaxY > maxY) maxY = bMaxY;
      }

      const clearMinX = Math.max(0, Math.min(minX, prevMinX));
      const clearMinY = Math.max(0, Math.min(minY, prevMinY));
      const clearMaxX = Math.min(canvas.width, Math.max(maxX, prevMaxX));
      const clearMaxY = Math.min(canvas.height, Math.max(maxY, prevMaxY));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (fullClear) {
        fullClear = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } else if (clearMaxX > clearMinX && clearMaxY > clearMinY) {
        ctx.clearRect(clearMinX, clearMinY, clearMaxX - clearMinX, clearMaxY - clearMinY);
      }
      prevMinX = minX;
      prevMinY = minY;
      prevMaxX = maxX;
      prevMaxY = maxY;
      if (minX === Infinity) return;

      for (let i = 0; i < bears.length; i += 1) {
        const b = bears[i];
        if (!b.vis) continue;
        const geo = b.sp.geo;
        const legs = b.sp.legs;
        if (legs) {
          const swing = LEG_SWING * Math.sin(time * LEG_WAVE_SPEED + b.step);
          for (let k = 0; k < 2; k += 1) {
            const side = k === 0 ? -1 : 1;
            const pivotX = side * geo.legCenterX;
            const pivotY = geo.legTopY;
            const cr = Math.cos(side * swing);
            const sr = Math.sin(side * swing);
            ctx.setTransform(
              b.ta * cr + b.tc * sr,
              b.tb * cr + b.td * sr,
              b.tc * cr - b.ta * sr,
              b.td * cr - b.tb * sr,
              b.ta * pivotX + b.tc * pivotY + b.te,
              b.tb * pivotX + b.td * pivotY + b.tf,
            );
            const drawX = (k === 0 ? -geo.halfW : 0) - pivotX;
            ctx.drawImage(legs[k], drawX, geo.legCutY - geo.legTopY, geo.legW, geo.legH);
          }
        }
        const hair = b.sp.hair;
        if (hair) {
          ctx.setTransform(b.ma, b.mb, b.mc, b.md, b.me, b.mf);
          ctx.drawImage(hair, -geo.halfW, -geo.bodyTop, geo.w, geo.bodyTop + HAIR_EXTEND);
        }
        ctx.setTransform(b.ta, b.tb, b.tc, b.td, b.te, b.tf);
        ctx.drawImage(b.sp.body, -geo.halfW, geo.bodyDrawY, geo.w, geo.bodyDrawH);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    let last = performance.now();
    let rearmTimer = 0;

    const restartLoop = () => {
      if (disposed) return;
      cancelAnimationFrame(raf);
      clearTimeout(rearmTimer);
      rearmTimer = window.setTimeout(() => {
        if (!disposed) raf = requestAnimationFrame(step);
      }, LOOP_GAP_MS);
    };

    const unpinLoop = () => {
      clearTimeout(rearmTimer);
      rearmTimer = window.setTimeout(restartLoop, UNPIN_DELAY_MS);
    };

    const onVisible = () => {
      if (!document.hidden) restartLoop();
    };

    const setBearCount = (count: number) => {
      if (!assets) return;
      const target = Math.max(0, Math.min(MAX_BEARS, Math.round(count)));
      while (bears.length > target) {
        const removed = bears.pop();
        if (removed === grabbedBear) {
          grabbedBear = null;
          document.body.style.cursor = "";
        }
      }
      while (bears.length < target) {
        const bear = makeBear(assets.bears[0]);
        respawn(bear, cssW, cssH, bears, bear, assets);
        bears.push(bear);
      }
    };

    const installDebug = () => {
      if (!import.meta.env.DEV) return;
      const bridge: BearDebugBridge = {
        setCount: (count: number) => {
          setBearCount(count);
        },
        snapshot: () => bears.map((b) => ({
          species: b.sp.id,
          x: b.x,
          y: b.y,
          cx: b.cx,
          cy: b.cy,
          angle: b.angle,
          av: b.av,
          scale: b.scale,
          hw: b.hw,
          hh: b.hh,
          sq: b.sq,
          gx: b.gx,
          gy: b.gy,
          grabbed: b === grabbedBear,
        })),
        metrics: () => {
          const metrics: BearDebugMetrics = {
            bears: bears.length,
            hits: hitCount,
            pairs: pairCount,
            push: pushSum,
            physicsMs,
            renderMs,
            substeps: subSteps,
            quality,
            unit: unitDpr,
          };
          hitCount = 0;
          pairCount = 0;
          pushSum = 0;
          return metrics;
        },
        reset: () => {
          hitCount = 0;
          pairCount = 0;
          pushSum = 0;
        },
        viewport: () => ({ width: cssW, height: cssH, unit: unitDpr, top: visibleTop, bottom: visibleBottom }),
        overlap: () => {
          let worst = 0;
          let pairs = 0;
          for (let i = 0; i < bears.length; i += 1) {
            const a = bears[i];
            if (a.x + a.cull < 0 || a.x - a.cull > cssW || a.y + a.cull < visibleTop || a.y - a.cull > visibleBottom) continue;
            for (let j = i + 1; j < bears.length; j += 1) {
              const b = bears[j];
              if (b.x + b.cull < 0 || b.x - b.cull > cssW || b.y + b.cull < visibleTop || b.y - b.cull > visibleBottom) continue;
              const bx = b.x - a.x;
              const by = b.y - a.y;
              const reach = a.cull + b.cull;
              if (bx * bx + by * by > reach * reach) continue;
              if (!computeContact(a, b)) continue;
              pairs += 1;
              if (contact.depth > worst) worst = contact.depth;
            }
          }
          return { worst, pairs };
        },
        spawn: (id: string, x: number, y: number, angle: number, scale: number) => {
          if (!assets) return false;
          const species = assets.all.find((s) => s.id === id);
          if (!species) return false;
          const bear = makeBear(species);
          bear.x = x;
          bear.y = y;
          bear.scale = scale;
          bear.mass = scale * scale * species.phys.massScale;
          bear.angle = angle;
          bear.av = 0;
          bear.cruise = 0;
          bear.vx = 0;
          bear.vy = 0;
          bear.tx = x;
          bear.ty = y;
          applySize(bear);
          updateFrame(bear);
          bears.push(bear);
          return true;
        },
        hit: (aId: string, ax: number, ay: number, aAngle: number, bId: string, bx: number, by: number, bAngle: number, scale: number) => {
          if (!assets) return -1;
          const sa = assets.all.find((s) => s.id === aId);
          const sb = assets.all.find((s) => s.id === bId);
          if (!sa || !sb) return -1;
          const a = makeBear(sa);
          const b = makeBear(sb);
          a.scale = scale;
          b.scale = scale;
          a.angle = aAngle;
          b.angle = bAngle;
          a.x = ax;
          a.y = ay;
          b.x = bx;
          b.y = by;
          applySize(a);
          applySize(b);
          updateFrame(a);
          updateFrame(b);
          return computeContact(a, b) ? contact.depth : 0;
        },
        setQuality: (next: number) => {
          applyQuality(next);
          let best = 0;
          for (let i = 1; i < QUALITY_LADDER.length; i += 1) {
            if (Math.abs(unitMax * QUALITY_LADDER[i] - next) < Math.abs(unitMax * QUALITY_LADDER[best] - next)) best = i;
          }
          qualityStep = best;
          qualityFrames = 0;
          qualityBad = 0;
          qualityHold = QUALITY_HOLD_DOWN;
        },
        setAdaptive: (enabled: boolean) => {
          adaptive = enabled;
        },
      };
      instrument = true;
      (window as unknown as { __bubbleBears?: BearDebugBridge }).__bubbleBears = bridge;
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onHover);
    window.addEventListener("load", unpinLoop);
    if (document.readyState === "complete") unpinLoop();
    document.addEventListener("visibilitychange", onVisible);

    loadSpeciesSet()
      .then((loaded) => {
        if (disposed) {
          closeAssets(loaded);
          return;
        }
        assets = loaded;
        resize();
        const bearCount = mobile ? Math.min(3, bubbleBearConfig.count) : bubbleBearConfig.count;
        setBearCount(bearCount);
        installDebug();
        raf = requestAnimationFrame(step);
      })
      .catch(() => {
        assets = null;
      });

    const removeDebug = () => {
      if (!import.meta.env.DEV) return;
      delete (window as unknown as { __bubbleBears?: BearDebugBridge }).__bubbleBears;
    };

    return () => {
      disposed = true;
      removeDebug();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onHover);
      window.removeEventListener("load", unpinLoop);
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(rearmTimer);
      endGrab();
      if (assets) {
        closeAssets(assets);
        assets = null;
      }
    };
  }, []);

  return (
    <div className="bubblebears" aria-hidden="true">
      <canvas ref={canvasRef} className="bubblebears-canvas" style={dim > 0 ? { filter: `brightness(${(100 - dim) / 100})` } : undefined} />
    </div>
  );
}
