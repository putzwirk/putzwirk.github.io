import { useEffect, useRef } from "react";

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const bubbleBearConfig = {
  count: Math.min(10, Math.max(0, Math.round(num(import.meta.env.VITE_BUBBLEBEAR_COUNT, 5)))),
  speed: Math.min(4, Math.max(2, num(import.meta.env.VITE_BUBBLEBEAR_SPEED, 2))),
  rotation: Math.max(0, num(import.meta.env.VITE_BUBBLEBEAR_ROTATION, 18)),
  scale: Math.max(0.05, num(import.meta.env.VITE_BUBBLEBEAR_SCALE, 1)),
  opacity: Math.min(1, Math.max(0, num(import.meta.env.VITE_BUBBLEBEAR_OPACITY, 0.18))),
  hairOpacity: Math.min(1, Math.max(0, num(import.meta.env.VITE_BUBBLEBEAR_HAIR_OPACITY, 1))),
  dprCap: Math.max(0.5, num(import.meta.env.VITE_BUBBLEBEAR_DPR, 2)),
  gravity: Math.max(0, num(import.meta.env.VITE_BUBBLEBEAR_GRAVITY, 3600000)),
  hitForce: 0.2,
};

const IMG_W = 56;
const IMG_H = 112;
const BODY_TOP = 32;
const BODY_H = IMG_H - BODY_TOP;
const IMG_HALF_W = IMG_W / 2;
const IMG_HALF_H = IMG_H / 2;
const BEE_W = 56;
const BEE_H = 65;
const BODY_HALF_H = BODY_H / 2;
const BODY_CENTER_Y = BODY_TOP - IMG_HALF_H + BODY_HALF_H;
const HEAD_CENTER_Y = -IMG_HALF_H + BODY_TOP / 2;
const BODY_MASS = IMG_W * BODY_H;
const HEAD_MASS = IMG_W * BODY_TOP * 0.35;
const TOTAL_MASS = BODY_MASS + HEAD_MASS;
const COM_Y = (BODY_MASS * BODY_CENTER_Y + HEAD_MASS * HEAD_CENTER_Y) / TOTAL_MASS;
const BODY_MOMENT = BODY_MASS * (IMG_W * IMG_W + BODY_H * BODY_H) / 12;
const HEAD_MOMENT = HEAD_MASS * (IMG_W * IMG_W + BODY_TOP * BODY_TOP) / 12;
const COM_MOMENT = BODY_MOMENT + BODY_MASS * (BODY_CENTER_Y - COM_Y) ** 2 + HEAD_MOMENT + HEAD_MASS * (HEAD_CENTER_Y - COM_Y) ** 2;
const GRAB_POINT_Y = -IMG_HALF_H + IMG_H * 0.25;
const MOUSE_TORQUE_MULTIPLIER = 500;
const BODY_DRAW_Y = BODY_CENTER_Y - BODY_HALF_H;
const HAIR_ANCHOR_Y = BODY_TOP - IMG_HALF_H;
const PLANT_SPRING = 34;
const PLANT_DAMPING = 7;
const PLANT_TORQUE = 0.018;
const PLANT_WAVE_SPEED = 8;
const BEE_PHRASES = ["Bee cool!", "This is hive-ly entertaining!", "I bee-lieve in you!", "Have a bee-autiful day!"];
const BODY_BOUND_RADIUS = Math.sqrt(IMG_HALF_W * IMG_HALF_W + BODY_HALF_H * BODY_HALF_H);
const CULL_RADIUS = Math.sqrt(IMG_HALF_W * IMG_HALF_W + IMG_HALF_H * IMG_HALF_H);
const DEG = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const STEER = 0.6;
const RESTITUTION = 1.8;
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
const RELEASE_FADE_RESPONSE = 8;
const FADE_PX = 120;
const OFFSCREEN = 110;
const DESPAWN = 180;
const MAX_SUBSTEPS = 4;
const MAX_GRID_SCALE = 1.3;

let unitDpr = 1;
let offscreen = OFFSCREEN;
let despawn = DESPAWN;
let fadePx = FADE_PX;
let spawnPad = SPAWN_PAD;
let grabbedBear: Bear | null = null;
let nextBeeMessageId = 1;

export function supportsBubbleBearRenderer() {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  const canvas = document.createElement("canvas");
  if (!canvas.getContext("2d") || typeof window.createImageBitmap !== "function") return false;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
  const device = navigator as Navigator & { deviceMemory?: number };
  if (mobile && ((device.hardwareConcurrency ?? 4) <= 2 || (device.deviceMemory ?? 4) <= 2)) return false;
  return true;
}

function setUnit(unit: number) {
  unitDpr = unit;
  offscreen = OFFSCREEN * unit;
  despawn = DESPAWN * unit;
  fadePx = FADE_PX * unit;
  spawnPad = SPAWN_PAD * unit;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

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

interface Bear {
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
  grabFade: number;
  plantAngle: number;
  plantVelocity: number;
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
  alpha: number;
  sq: number;
  sqv: number;
  isBee: boolean;
  beeFade: number;
  beeRemoving: boolean;
  beeTimer: number;
  beeMessageId: number;
}

interface BearAssets {
  body: ImageBitmap;
  hair: ImageBitmap;
  bee: ImageBitmap;
}

function applySize(bear: Bear) {
  bear.hw = IMG_HALF_W * bear.scale * unitDpr;
  bear.hh = BODY_HALF_H * bear.scale * unitDpr;
  bear.off = BODY_CENTER_Y * bear.scale * unitDpr;
  bear.comY = COM_Y * bear.scale * unitDpr;
  bear.radius = BODY_BOUND_RADIUS * bear.scale * unitDpr;
  bear.cull = CULL_RADIUS * bear.scale * unitDpr;
}

function makeBear(): Bear {
  return {
    x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, cruise: 0, angle: 0, av: 0, gx: 0, gy: 0,
    scale: 1, mass: 1, hw: IMG_HALF_W, hh: BODY_HALF_H, off: BODY_CENTER_Y, comY: COM_Y, radius: BODY_BOUND_RADIUS, cull: CULL_RADIUS, grabTargetX: 0, grabTargetY: GRAB_POINT_Y, grabFade: 0, plantAngle: 0, plantVelocity: 0,
    cx: 0, cy: 0, xx: 1, xy: 0, yx: 0, yy: 1, ta: 1, tb: 0, tc: 0, td: 1, te: 0, tf: 0, alpha: -1, sq: 0, sqv: 0, isBee: Math.random() < 0.02, beeFade: 1, beeRemoving: false, beeTimer: 0, beeMessageId: 0,
  };
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

function spawnBlocked(bear: Bear, bears: Bear[], self: Bear) {
  const rr = bear.cull + spawnPad;
  for (let k = 0; k < bears.length; k += 1) {
    const other = bears[k];
    if (other === self) continue;
    const dx = other.x - bear.x;
    const dy = other.y - bear.y;
    const r = rr + other.cull;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

function respawn(bear: Bear, w: number, h: number, bears: Bear[], self: Bear) {
  const { speed, rotation, scale } = bubbleBearConfig;
  bear.cruise = rand(16, 40) * speed;
  bear.angle = rand(0, 360);
  bear.av = rand(-rotation, rotation);
  bear.scale = scale * rand(0.7, MAX_GRID_SCALE);
  bear.mass = bear.scale * bear.scale;
  applySize(bear);
  bear.sq = 0;
  bear.sqv = 0;

  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
    placeSpawn(bear, w, h);
    if (!spawnBlocked(bear, bears, self)) break;
  }

  const dx = bear.tx - bear.x;
  const dy = bear.ty - bear.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  bear.vx = (dx / d) * bear.cruise;
  bear.vy = (dy / d) * bear.cruise;
}

function testAxis(ax: number, ay: number, dx: number, dy: number, a: Bear, b: Bear) {
  const dist = dx * ax + dy * ay;
  const ra = a.hw * Math.abs(ax * a.xx + ay * a.xy) + a.hh * Math.abs(ax * a.yx + ay * a.yy);
  const rb = b.hw * Math.abs(ax * b.xx + ay * b.xy) + b.hh * Math.abs(ax * b.yx + ay * b.yy);
  return ra + rb - Math.abs(dist);
}

function collide(a: Bear, b: Bear) {
  if (a.isBee || b.isBee) return;
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;

  let best = Infinity;
  let nax = 0;
  let nay = 0;

  let o = testAxis(a.xx, a.xy, dx, dy, a, b);
  if (o <= 0) return;
  best = o;
  nax = a.xx;
  nay = a.xy;

  o = testAxis(a.yx, a.yy, dx, dy, a, b);
  if (o <= 0) return;
  if (o < best) {
    best = o;
    nax = a.yx;
    nay = a.yy;
  }

  o = testAxis(b.xx, b.xy, dx, dy, a, b);
  if (o <= 0) return;
  if (o < best) {
    best = o;
    nax = b.xx;
    nay = b.xy;
  }

  o = testAxis(b.yx, b.yy, dx, dy, a, b);
  if (o <= 0) return;
  if (o < best) {
    best = o;
    nax = b.yx;
    nay = b.yy;
  }

  if (dx * nax + dy * nay < 0) {
    nax = -nax;
    nay = -nay;
  }

  const impactForce = bubbleBearConfig.hitForce * bubbleBearConfig.speed;
  const invA = a === grabbedBear ? 0 : 1 / a.mass;
  const invB = b === grabbedBear ? 0 : 1 / b.mass;
  const invSum = invA + invB;
  if (invSum === 0) return;
  const push = best * PUSH_BIAS;
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
    const impulse = (-(1 + RESTITUTION * impactForce) * vn) / invSum;
    a.vx -= impulse * nax * invA;
    a.vy -= impulse * nay * invA;
    b.vx += impulse * nax * invB;
    b.vy += impulse * nay * invB;
  }

  const kick = best * SEPARATION_KICK * impactForce + closing * SEPARATION_VEL * impactForce;
  a.vx -= nax * kick * invA;
  a.vy -= nay * kick * invA;
  b.vx += nax * kick * invB;
  b.vy += nay * kick * invB;

  clampSpeed(a);
  clampSpeed(b);

  const denom = a.hh < b.hh ? a.hh : b.hh;
  const impact = (push / denom) * 0.6 + closing * SQUASH_VEL;
  if (impact > 0) {
    const wa = invA / invSum;
    const wb = invB / invSum;
    let sa = impact * wa * 2 * SQUASH_MAX;
    let sb = impact * wb * 2 * SQUASH_MAX;
    if (sa > SQUASH_MAX) sa = SQUASH_MAX;
    if (sb > SQUASH_MAX) sb = SQUASH_MAX;
    if (sa > a.sq) a.sq = sa;
    if (sb > b.sq) b.sq = sb;
  }
}

async function loadBee(src: string): Promise<ImageBitmap> {
  const res = await fetch(src);
  const blob = await res.blob();
  return createImageBitmap(blob, { colorSpaceConversion: "none" });
}

async function loadSprite(src: string): Promise<Omit<BearAssets, "bee">> {
  let full: ImageBitmap;
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    full = await createImageBitmap(blob, { colorSpaceConversion: "none" });
  } catch {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    await img.decode();
    full = await createImageBitmap(img, { colorSpaceConversion: "none" });
  }
  const body = await createImageBitmap(full, 0, BODY_TOP, IMG_W, BODY_H, { colorSpaceConversion: "none" });
  const hair = await createImageBitmap(full, 0, 0, IMG_W, BODY_TOP, { colorSpaceConversion: "none" });
  full.close();
  return { body, hair };
}

function pickBee(bears: Bear[], wx: number, wy: number) {
  for (let i = bears.length - 1; i >= 0; i -= 1) {
    const b = bears[i];
    if (!b.isBee || b.beeRemoving) continue;
    const dx = wx - b.x;
    const dy = wy - b.y;
    const lx = dx * b.xx + dy * b.xy;
    const ly = -dx * b.xy + dy * b.xx;
    const hw = BEE_W * 0.65 * b.scale * unitDpr;
    const hh = BEE_H * 0.65 * b.scale * unitDpr;
    if (lx >= -hw && lx <= hw && ly >= -hh && ly <= hh) return b;
  }
  return null;
}

function pickBear(bears: Bear[], wx: number, wy: number) {
  for (let i = bears.length - 1; i >= 0; i -= 1) {
    const b = bears[i];
    if (b.isBee) continue;
    const dx = wx - b.x;
    const dy = wy - b.y;
    const lx = dx * b.xx + dy * b.xy;
    const ly = -dx * b.xy + dy * b.xx;
    const hw = IMG_HALF_W * b.scale * unitDpr;
    const hh = IMG_HALF_H * b.scale * unitDpr;
    if (lx >= -hw && lx <= hw && ly >= -hh && ly <= hh) return b;
  }
  return null;
}

function updatePlant(bear: Bear, dt: number) {
  bear.plantVelocity += (-bear.plantAngle * PLANT_SPRING - bear.plantVelocity * PLANT_DAMPING - bear.av * PLANT_TORQUE) * dt;
  bear.plantAngle += bear.plantVelocity * dt;
  const limit = 0.55;
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

function integrate(bear: Bear, dt: number, w: number, h: number, bears: Bear[], self: Bear) {
  bear.grabFade *= Math.exp(-RELEASE_FADE_RESPONSE * dt);
  const dx = bear.tx - bear.x;
  const dy = bear.ty - bear.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  bear.vx += ((dx / d) * bear.cruise - bear.vx) * STEER * dt;
  bear.vy += ((dy / d) * bear.cruise - bear.vy) * STEER * dt;
  bear.x += bear.vx * dt;
  bear.y += bear.vy * dt;
  bear.angle += bear.av * dt;

  updateSquash(bear, dt);
  updatePlant(bear, dt);

  if (bear.x < -despawn || bear.x > w + despawn || bear.y < -despawn || bear.y > h + despawn) {
    if (!bear.isBee || !bear.beeRemoving) respawn(bear, w, h, bears, self);
  }

  updateFrame(bear);
}

function integrateGrabbed(bear: Bear, dt: number, px: number, py: number, cvx: number, cvy: number, accX: number, accY: number) {
  const inertia = COM_MOMENT * bear.scale * bear.scale * unitDpr * unitDpr;
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
    const mouseTorque = MOUSE_TORQUE_MULTIPLIER * (vy * accX - vx * accY);
    const angularAcceleration = ((gravityTorque + mouseTorque) / ip) * RAD_TO_DEG;
    av += (angularAcceleration - GRAB_DAMP * av) * hs;
    if (av > GRAB_SPIN_CAP) av = GRAB_SPIN_CAP;
    else if (av < -GRAB_SPIN_CAP) av = -GRAB_SPIN_CAP;
    angle += av * hs;
  }
  bear.angle = angle;
  bear.av = av;

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

  updateSquash(bear, dt);
  updatePlant(bear, dt);
  updateFrame(bear);
}

export default function BubbleBears() {
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
    let assets: BearAssets | null = null;
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;

    const baseDpr = Math.min(window.devicePixelRatio || 1, bubbleBearConfig.dprCap);
    setUnit(baseDpr);

    const bears: Bear[] = [];

    let cols = 1;
    let rows = 1;
    let cell = 1;
    let head = new Int32Array(1);
    let next = new Int32Array(1);
    let lastW = 0;
    let lastH = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let prevX = 0;
    let prevY = 0;
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
      pointerTargetX = e.clientX * dpr;
      pointerTargetY = e.clientY * dpr;
      e.preventDefault();
    };

    const endGrab = () => {
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
      const bee = pickBee(bears, wx, wy);
      if (bee) {
        bee.beeRemoving = true;
        bee.beeTimer = 0;
        const escapeLength = Math.sqrt(bee.vx * bee.vx + bee.vy * bee.vy) || 1;
        bee.tx = bee.x + (bee.vx / escapeLength) * 10000;
        bee.ty = bee.y + (bee.vy / escapeLength) * 10000;
        bee.av = bee.av >= 0 ? 240 : -240;
        bee.beeMessageId = nextBeeMessageId;
        nextBeeMessageId += 1;
        window.dispatchEvent(new CustomEvent("bubblebee-click", { detail: { id: bee.beeMessageId, text: BEE_PHRASES[Math.floor(Math.random() * BEE_PHRASES.length)], x: bee.x / dpr, y: bee.y / dpr } }));
        return;
      }
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
      bear.grabTargetY = GRAB_POINT_Y * bear.scale * unitDpr;
      bear.grabFade = 1;
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
      dpr = Math.min(window.devicePixelRatio || 1, bubbleBearConfig.dprCap);
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

      const maxRadius = BODY_BOUND_RADIUS * bubbleBearConfig.scale * MAX_GRID_SCALE * unitDpr;
      cell = Math.max(1, 2 * maxRadius);
      cols = Math.max(1, Math.ceil((cssW + 2 * despawn) / cell) + 1);
      rows = Math.max(1, Math.ceil((cssH + 2 * despawn) / cell) + 1);
      head = new Int32Array(cols * rows);
    };

    const resolve = () => {
      head.fill(-1);
      for (let i = 0; i < bears.length; i += 1) {
        const bear = bears[i];
        if (bear.x < 0 || bear.x > cssW || bear.y < visibleTop || bear.y > visibleBottom) continue;
        let col = ((bear.cx + despawn) / cell) | 0;
        let row = ((bear.cy + despawn) / cell) | 0;
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
        let col = ((a.cx + despawn) / cell) | 0;
        let row = ((a.cy + despawn) / cell) | 0;
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
    };

    const integrateAll = (sdt: number, accX: number, accY: number, cvx: number, cvy: number) => {
      for (let i = 0; i < bears.length; i += 1) {
        const b = bears[i];
        if (b.isBee && b.beeRemoving) {
          b.beeTimer += sdt;
          const boost = 1 - Math.exp(-1.8 * b.beeTimer);
          const lateBoost = boost ** 4;
          b.cruise += (35 + 900 * lateBoost) * sdt;
          b.av += (b.av >= 0 ? 250 : -250) * sdt;
          b.av += (b.av >= 0 ? 700 : -700) * lateBoost * sdt;
        }
        if (b === grabbedBear) integrateGrabbed(b, sdt, pointerX, pointerY, cvx, cvy, accX, accY);
        else integrate(b, sdt, cssW, cssH, bears, b);
      }
    };

    const step = (now: number) => {
      if (disposed) return;
      for (let i = bears.length - 1; i >= 0; i -= 1) {
        const bee = bears[i];
        if (bee.isBee && bee.beeRemoving && (bee.x < 0 || bee.x > cssW || bee.y - 55 * unitDpr < visibleTop || bee.y - 55 * unitDpr > visibleBottom)) {
          window.dispatchEvent(new CustomEvent("bubblebee-done", { detail: bee.beeMessageId }));
          bears.splice(i, 1);
        }
      }
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;

      const active = bears.length > 1;
      let sub = 1;
      if (active && bubbleBearConfig.speed > 1.5) {
        let maxStep = 0;
        for (let i = 0; i < bears.length; i += 1) {
          const b = bears[i];
          const v = Math.abs(b.vx) > Math.abs(b.vy) ? Math.abs(b.vx) : Math.abs(b.vy);
          if (v > maxStep) maxStep = v;
        }
        const minExtent = IMG_HALF_W * bubbleBearConfig.scale * unitDpr * 0.7;
        sub = Math.ceil((maxStep * dt) / minExtent) | 0;
        if (sub < 1) sub = 1;
        else if (sub > MAX_SUBSTEPS) sub = MAX_SUBSTEPS;
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

      simulationTime += dt;
      if (grabbedBear) {
        prevX = pointerX;
        prevY = pointerY;
      }

      render(simulationTime);

      raf = requestAnimationFrame(step);
    };

    const render = (time: number) => {
      if (!assets) return;
      const sizeBase = unitDpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.filter = "brightness(0.5)";

      for (let i = 0; i < bears.length; i += 1) {
        const b = bears[i];
        const s = b.scale * sizeBase;
        const cos = b.xx;
        const sin = b.xy;
        const sx = (1 + b.sq) * s;
        const sy = (1 - b.sq) * s;
        b.ta = sx * cos;
        b.tb = sx * sin;
        b.tc = -sy * sin;
        b.td = sy * cos;
        b.te = b.x;
        b.tf = b.y;
      }

      let alpha = -1;
      ctx.globalAlpha = 1;
      for (let i = 0; i < bears.length; i += 1) {
        const b = bears[i];
        if (b.y + b.cull < visibleTop || b.y - b.cull > visibleBottom) continue;
        if (b.x + b.cull < 0 || b.x - b.cull > cssW || b.y + b.cull < 0 || b.y - b.cull > cssH) continue;
        const edge = Math.min(b.x, cssW - b.x, b.y - visibleTop, visibleBottom - b.y);
        const edgeFade = edge <= 0 ? 0 : edge >= fadePx ? 1 : edge / fadePx;
        const fade = edgeFade + (1 - edgeFade) * b.grabFade;
        const a = b.isBee && b.beeRemoving ? 1 : fade;
        if (a !== alpha) {
          ctx.globalAlpha = a;
          alpha = a;
        }
        ctx.setTransform(b.ta, b.tb, b.tc, b.td, b.te, b.tf);
        if (b.isBee) {
          if (b.beeRemoving) {
            const messageY = b.y - 55 * unitDpr;
            const messageEdge = Math.min(b.x, cssW - b.x, messageY - visibleTop, visibleBottom - messageY);
            const approachingEdge = (messageY - visibleTop < fadePx && b.vy < 0) || (visibleBottom - messageY < fadePx && b.vy > 0) || (b.x < fadePx && b.vx < 0) || (cssW - b.x < fadePx && b.vx > 0);
            const messageFade = approachingEdge ? Math.max(0, Math.min(1, messageEdge / fadePx)) : 1;
            window.dispatchEvent(new CustomEvent("bubblebee-move", { detail: { id: b.beeMessageId, x: b.x / unitDpr, y: b.y / unitDpr, opacity: messageFade } }));
          }
          ctx.drawImage(assets.bee, -BEE_W * 0.65, -BEE_H * 0.65, BEE_W * 1.3, BEE_H * 1.3);
        } else {
          ctx.drawImage(assets.body, -IMG_HALF_W, BODY_DRAW_Y);
        }
      }

      alpha = -1;
      for (let i = 0; i < bears.length; i += 1) {
        const b = bears[i];
        if (b.isBee) continue;
        if (b.x + b.cull < 0 || b.x - b.cull > cssW || b.y + b.cull < 0 || b.y - b.cull > cssH) continue;
        const edge = Math.min(b.x, cssW - b.x, b.y - visibleTop, visibleBottom - b.y);
        const edgeFade = edge <= 0 ? 0 : edge >= fadePx ? 1 : edge / fadePx;
        const fade = edgeFade + (1 - edgeFade) * b.grabFade;
        const a = fade;
        if (a !== alpha) {
          ctx.globalAlpha = a;
          alpha = a;
        }
        ctx.setTransform(b.ta, b.tb, b.tc, b.td, b.te, b.tf);
        ctx.translate(0, HAIR_ANCHOR_Y);
        const motion = Math.min(1, Math.abs(b.av) * 0.002 + Math.abs(b.sqv) * 0.08);
        const plantSway = Math.sin(time * PLANT_WAVE_SPEED) * (0.1 + motion * 0.25);
        const plantShear = Math.sin(time * PLANT_WAVE_SPEED - 0.8) * (0.12 + motion * 0.4);
        ctx.rotate(b.plantAngle + plantSway);
        ctx.transform(1, 0, plantShear, 1, 0, 0);
        ctx.drawImage(assets.hair, -IMG_HALF_W, -BODY_TOP);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.filter = "none";
    };

    let last = performance.now();

    window.addEventListener("resize", resize);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onHover);
    resize();

    const bearCount = mobile ? Math.min(3, bubbleBearConfig.count) : bubbleBearConfig.count;
    for (let i = 0; i < bearCount; i += 1) {
      const bear = makeBear();
      respawn(bear, cssW, cssH, bears, bear);
      bears.push(bear);
    }
    next = new Int32Array(bears.length);

    Promise.all([loadSprite("/bubblebear.png"), loadBee("/bee.png")]).then(([loaded, bee]) => {
      if (disposed) {
        loaded.body.close();
        loaded.hair.close();
        bee.close();
        return;
      }
      assets = { ...loaded, bee };
      raf = requestAnimationFrame(step);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onHover);
      endGrab();
      if (assets) {
        assets.body.close();
        assets.hair.close();
        assets.bee.close();
        assets = null;
      }
    };
  }, []);

  return (
    <div className="bubblebears" aria-hidden="true">
      <canvas ref={canvasRef} className="bubblebears-canvas" />
    </div>
  );
}
