import { useEffect, useRef } from "react";
import { bubbleBearConfig, supportsBubbleBearRenderer } from "../lib/bearConfig";

const DEG = Math.PI / 180;
const STEER = 0.6;
const FLING_CAP_MULT = 10;
const MAX_BLOCKS = 60;
const OFFSCREEN = 90;
const DESPAWN = 170;
const GRAB_SMOOTH = 22;
const SHATTER_FLASH_MS = 140;
const MAX_PARTICLES = 360;
const PARTICLE_GRAVITY = 1100;
const PARTICLE_THRESHOLD = 150;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);

interface BlockPhys {
  mass: number;
  restitution: number;
  cruiseMin: number;
  cruiseMax: number;
  fall: number;
  immovable: boolean;
  fragile: number;
  spin: number;
  weight: number;
}

interface BlockDef {
  id: string;
  src: string;
  size: number;
  phys: BlockPhys;
}

const DEFS: BlockDef[] = [
  { id: "grass", src: "/mcblocks/grass.png", size: 16, phys: { mass: 1, restitution: 0.5, cruiseMin: 16, cruiseMax: 40, fall: 0, immovable: false, fragile: 0, spin: 40, weight: 3 } },
  { id: "cobblestone", src: "/mcblocks/cobblestone.png", size: 16, phys: { mass: 2.4, restitution: 0.25, cruiseMin: 10, cruiseMax: 26, fall: 0, immovable: false, fragile: 0, spin: 22, weight: 2 } },
  { id: "planks", src: "/mcblocks/planks.png", size: 16, phys: { mass: 0.7, restitution: 0.7, cruiseMin: 20, cruiseMax: 48, fall: 0, immovable: false, fragile: 0, spin: 60, weight: 2 } },
  { id: "bricks", src: "/mcblocks/bricks.png", size: 16, phys: { mass: 2, restitution: 0.3, cruiseMin: 12, cruiseMax: 30, fall: 0, immovable: false, fragile: 0, spin: 26, weight: 2 } },
  { id: "sand", src: "/mcblocks/sand.png", size: 16, phys: { mass: 1.1, restitution: 0.12, cruiseMin: 8, cruiseMax: 20, fall: 320, immovable: false, fragile: 0, spin: 12, weight: 2 } },
  { id: "gravel", src: "/mcblocks/gravel.png", size: 16, phys: { mass: 1.2, restitution: 0.3, cruiseMin: 10, cruiseMax: 24, fall: 320, immovable: false, fragile: 0, spin: 16, weight: 2 } },
  { id: "glass", src: "/mcblocks/glass.png", size: 16, phys: { mass: 0.6, restitution: 0.55, cruiseMin: 18, cruiseMax: 44, fall: 0, immovable: false, fragile: 420, spin: 55, weight: 1.4 } },
];

const TOTAL_WEIGHT = DEFS.reduce((sum, def) => sum + def.phys.weight, 0);

interface Species {
  def: BlockDef;
  image: ImageBitmap;
  palette: string[];
}

interface Block {
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
  scale: number;
  mass: number;
  radius: number;
  half: number;
  shatterUntil: number;
  vis: boolean;
  svx?: number;
  svy?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

const particles: Particle[] = [];

function spawnBurst(x: number, y: number, nx: number, ny: number, palettes: string[][], count: number, spread: number) {
  const base = Math.atan2(ny, nx);
  for (let i = 0; i < count; i += 1) {
    if (particles.length >= MAX_PARTICLES) return;
    const palette = palettes[(Math.random() * palettes.length) | 0];
    if (!palette || palette.length === 0) continue;
    const ang = base + rand(-spread, spread);
    const speed = rand(60, 300) * unit;
    const life = rand(0.35, 0.8);
    particles.push({
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - 60 * unit,
      life, maxLife: life,
      size: rand(2, 4.5) * unit,
      color: palette[(Math.random() * palette.length) | 0],
    });
  }
}

let unit = 1;
let grabbed: Block | null = null;

function pickDef(): BlockDef {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const def of DEFS) {
    roll -= def.phys.weight;
    if (roll <= 0) return def;
  }
  return DEFS[0];
}

function placeSpawn(block: Block, w: number, h: number, off: number) {
  const edge = Math.floor(Math.random() * 4);
  if (edge === 0) {
    block.x = -off;
    block.y = rand(0, h);
    block.tx = w + off * 2;
    block.ty = rand(0, h);
  } else if (edge === 1) {
    block.x = w + off;
    block.y = rand(0, h);
    block.tx = -off * 2;
    block.ty = rand(0, h);
  } else if (edge === 2) {
    block.x = rand(0, w);
    block.y = -off;
    block.tx = rand(0, w);
    block.ty = h + off * 2;
  } else {
    block.x = rand(0, w);
    block.y = h + off;
    block.tx = rand(0, w);
    block.ty = -off * 2;
  }
}

function respawn(block: Block, w: number, h: number, all: Species[], off: number) {
  const { speed, scale } = bubbleBearConfig;
  const species = all.find((s) => s.def.id === pickDef().id) ?? all[0];
  block.sp = species;
  const phys = species.def.phys;
  block.cruise = rand(phys.cruiseMin, phys.cruiseMax) * speed;
  block.angle = phys.spin > 0 ? rand(0, 360) : rand(-8, 8);
  block.av = rand(-phys.spin, phys.spin);
  block.scale = scale * rand(6.4, 10.4);
  block.mass = phys.mass * block.scale * block.scale;
  block.half = ((species.def.size * block.scale) / 2) * unit;
  block.radius = block.half * 1.42;
  block.shatterUntil = 0;
  placeSpawn(block, w, h, off);
  const dx = block.tx - block.x;
  const dy = block.ty - block.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  block.vx = (dx / d) * block.cruise;
  block.vy = (dy / d) * block.cruise;
}

function applyUnit(block: Block) {
  block.half = ((block.sp.def.size * block.scale) / 2) * unit;
  block.radius = block.half * 1.42;
}

const CORNERS_A = new Float64Array(8);
const CORNERS_B = new Float64Array(8);

function blockCorners(b: Block, out: Float64Array): Float64Array {
  const rad = b.angle * DEG;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const h = b.half;
  out[0] = b.x + (-h * cos + h * sin);
  out[1] = b.y + (-h * sin - h * cos);
  out[2] = b.x + (h * cos + h * sin);
  out[3] = b.y + (h * sin - h * cos);
  out[4] = b.x + (h * cos - h * sin);
  out[5] = b.y + (h * sin + h * cos);
  out[6] = b.x + (-h * cos - h * sin);
  out[7] = b.y + (-h * sin + h * cos);
  return out;
}

function projectRange(c: Float64Array, ax: number, ay: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 8; i += 2) {
    const p = c[i] * ax + c[i + 1] * ay;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return [min, max];
}

function collide(a: Block, b: Block, hitForce: number, now: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const reach = a.radius + b.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return;
  const ca = blockCorners(a, CORNERS_A);
  const cb = blockCorners(b, CORNERS_B);
  const ra = a.angle * DEG;
  const rb = b.angle * DEG;
  const axes = [
    Math.cos(ra), Math.sin(ra),
    -Math.sin(ra), Math.cos(ra),
    Math.cos(rb), Math.sin(rb),
    -Math.sin(rb), Math.cos(rb),
  ];
  let bestOverlap = Infinity;
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < 8; i += 2) {
    const ax = axes[i];
    const ay = axes[i + 1];
    const [minA, maxA] = projectRange(ca, ax, ay);
    const [minB, maxB] = projectRange(cb, ax, ay);
    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (overlap <= 0) return;
    if (overlap < bestOverlap) {
      bestOverlap = overlap;
      const sign = dx * ax + dy * ay >= 0 ? 1 : -1;
      nx = ax * sign;
      ny = ay * sign;
    }
  }
  const depth = bestOverlap;
  const invA = a.sp.def.phys.immovable || a === grabbed ? 0 : 1 / a.mass;
  const invB = b.sp.def.phys.immovable || b === grabbed ? 0 : 1 / b.mass;
  const invSum = invA + invB;
  if (invSum === 0) return;
  const push = depth * 0.8;
  a.x -= nx * push * (invA / invSum);
  a.y -= ny * push * (invA / invSum);
  b.x += nx * push * (invB / invSum);
  b.y += ny * push * (invB / invSum);
  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  const closing = vn < 0 ? -vn : 0;
  let jn = 0;
  if (vn < 0) {
    const restitution = ((a.sp.def.phys.restitution + b.sp.def.phys.restitution) / 2) * (0.4 + hitForce);
    jn = (-(1 + restitution) * vn) / invSum;
    a.vx -= jn * nx * invA;
    a.vy -= jn * ny * invA;
    b.vx += jn * nx * invB;
    b.vy += jn * ny * invB;
  }
  const tx = -ny;
  const ty = nx;
  const vt = rvx * tx + rvy * ty;
  const mu = 0.25;
  const maxFriction = jn * mu;
  let jt = -vt / invSum;
  if (jt > maxFriction) jt = maxFriction;
  else if (jt < -maxFriction) jt = -maxFriction;
  a.vx -= jt * tx * invA;
  a.vy -= jt * ty * invA;
  b.vx += jt * tx * invB;
  b.vy += jt * ty * invB;
  if (invA > 0 && a !== grabbed) {
    a.av = clamp(a.av - ((jt * 0.6) / (a.mass * Math.max(1, a.half))) * 57.3, -160, 160);
  }
  if (invB > 0 && b !== grabbed) {
    b.av = clamp(b.av + ((jt * 0.6) / (b.mass * Math.max(1, b.half))) * 57.3, -160, 160);
  }
  const kick = (depth * 8 + closing * 0.8) * hitForce;
  a.vx -= nx * kick * invA;
  a.vy -= ny * kick * invA;
  b.vx += nx * kick * invB;
  b.vy += ny * kick * invB;
  for (const [block, share] of [[a, invA / invSum], [b, invB / invSum]] as const) {
    if (share <= 0) continue;
    const cap = block.cruise * FLING_CAP_MULT;
    const s2 = block.vx * block.vx + block.vy * block.vy;
    if (s2 > cap * cap) {
      const k = cap / Math.sqrt(s2);
      block.vx *= k;
      block.vy *= k;
    }
  }
  if (closing > PARTICLE_THRESHOLD && particles.length < MAX_PARTICLES) {
    spawnBurst(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      nx, ny,
      [a.sp.palette, b.sp.palette],
      Math.min(14, 4 + ((closing / 120) | 0)),
      1.1,
    );
  }
  for (const block of [a, b]) {
    const fragile = block.sp.def.phys.fragile;
    if (fragile > 0 && closing * hitForce > fragile && block !== grabbed) {
      block.shatterUntil = now + SHATTER_FLASH_MS;
      spawnBurst(block.x, block.y, nx, ny, [block.sp.palette], 18, Math.PI);
    }
  }
}

async function loadBitmap(src: string): Promise<ImageBitmap> {
  const res = await fetch(src);
  const blob = await res.blob();
  return createImageBitmap(blob, { colorSpaceConversion: "none" });
}

function samplePalette(image: ImageBitmap): string[] {
  try {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return ["#888888"];
    g.drawImage(image, 0, 0, 8, 8);
    const data = g.getImageData(0, 0, 8, 8).data;
    const buckets = new Map<number, number>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const key = ((data[i] >> 5) << 10) | ((data[i + 1] >> 5) << 5) | (data[i + 2] >> 5);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const colors = [...buckets.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5)
      .map(([key]) => `rgb(${((key >> 10) & 31) * 8 + 4},${((key >> 5) & 31) * 8 + 4},${(key & 31) * 8 + 4})`);
    return colors.length > 0 ? colors : ["#888888"];
  } catch {
    return ["#888888"];
  }
}

function pickBlock(blocks: Block[], wx: number, wy: number): Block | null {
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const b = blocks[i];
    if (b.sp.def.phys.immovable) continue;
    const dx = wx - b.x;
    const dy = wy - b.y;
    const rad = b.angle * DEG;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    if (lx >= -b.half && lx <= b.half && ly >= -b.half && ly <= b.half) return b;
  }
  return null;
}

export default function MinecraftBlocks({ dim = 0 }: { dim?: number }) {
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
    let species: Species[] = [];
    const blocks: Block[] = [];
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let last = performance.now();
    let pointerX = 0;
    let pointerY = 0;
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let smoothVx = 0;
    let smoothVy = 0;
    let prevGrabX = 0;
    let prevGrabY = 0;
    let quality = 1;
    let slowFrames = 0;
    const updateDpr = () => {
      dpr = Math.min(window.devicePixelRatio || 1, bubbleBearConfig.dprCap) * quality;
      unit = dpr;
    };
    updateDpr();

    const isInteractive = (node: EventTarget | null) => {
      const el = node as Element | null;
      if (!el || !el.closest) return false;
      return !!el.closest(
        "button, a, img, input, textarea, select, label, [role='button'], [contenteditable='true'], header, footer, nav",
      );
    };

    const onGrabMove = (e: PointerEvent) => {
      if (!grabbed) return;
      pointerTargetX = e.clientX * dpr;
      pointerTargetY = e.clientY * dpr;
      e.preventDefault();
    };

    const endGrab = () => {
      if (grabbed) {
        grabbed.av = clamp(smoothVx * 0.02, -160, 160) + rand(-20, 20);
      }
      grabbed = null;
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onGrabMove);
      window.removeEventListener("pointerup", endGrab);
      window.removeEventListener("pointercancel", endGrab);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (mobile || e.pointerType === "touch" || e.button !== 0 || grabbed) return;
      if (isInteractive(e.target)) return;
      const block = pickBlock(blocks, e.clientX * dpr, e.clientY * dpr);
      if (!block) return;
      grabbed = block;
      const idx = blocks.indexOf(block);
      if (idx >= 0 && idx !== blocks.length - 1) {
        blocks.splice(idx, 1);
        blocks.push(block);
      }
      pointerX = e.clientX * dpr;
      pointerY = e.clientY * dpr;
      pointerTargetX = pointerX;
      pointerTargetY = pointerY;
      prevGrabX = pointerX;
      prevGrabY = pointerY;
      smoothVx = 0;
      smoothVy = 0;
      document.body.style.cursor = "grabbing";
      window.addEventListener("pointermove", onGrabMove, { passive: false });
      window.addEventListener("pointerup", endGrab);
      window.addEventListener("pointercancel", endGrab);
      e.preventDefault();
    };

    const onHover = (e: PointerEvent) => {
      if (mobile || grabbed || e.pointerType === "touch") return;
      const want = !isInteractive(e.target) && pickBlock(blocks, e.clientX * dpr, e.clientY * dpr) ? "grab" : "";
      if (document.body.style.cursor !== want) document.body.style.cursor = want;
    };

    const resize = () => {
      updateDpr();
      const w = Math.max(1, Math.round(window.innerWidth * dpr));
      const h = Math.max(1, Math.round(window.innerHeight * dpr));
      if (w === cssW && h === cssH) {
        for (const block of blocks) applyUnit(block);
        return;
      }
      cssW = w;
      cssH = h;
      canvas.width = w;
      canvas.height = h;
      ctx.imageSmoothingEnabled = false;
      for (const block of blocks) applyUnit(block);
    };

    const step = (now: number) => {
      if (disposed) return;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      if (dt <= 0) {
        raf = requestAnimationFrame(step);
        return;
      }
      const off = OFFSCREEN * dpr;
      const despawn = DESPAWN * dpr;
      const { speed, hitForce } = bubbleBearConfig;

      if (grabbed) {
        const lerp = 1 - Math.exp(-GRAB_SMOOTH * dt);
        pointerX += (pointerTargetX - pointerX) * lerp;
        pointerY += (pointerTargetY - pointerY) * lerp;
        const idt = 1 / dt;
        const k = Math.min(1, 20 * dt);
        smoothVx += ((pointerX - prevGrabX) * idt - smoothVx) * k;
        smoothVy += ((pointerY - prevGrabY) * idt - smoothVy) * k;
        prevGrabX = pointerX;
        prevGrabY = pointerY;
      }

      for (const block of blocks) {
        if (block === grabbed) {
          block.x += (pointerX - block.x) * (1 - Math.exp(-GRAB_SMOOTH * dt));
          block.y += (pointerY - block.y) * (1 - Math.exp(-GRAB_SMOOTH * dt));
          block.vx = smoothVx;
          block.vy = smoothVy;
          block.angle += block.av * dt;
          block.av *= 1 - 1.6 * dt;
        } else {
          const dx = block.tx - block.x;
          const dy = block.ty - block.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          block.vx += ((dx / d) * block.cruise - block.vx) * STEER * dt;
          block.vy += ((dy / d) * block.cruise - block.vy) * STEER * dt;
          const fall = block.sp.def.phys.fall * unit * speed;
          if (fall > 0) block.vy += fall * dt;
          block.x += block.vx * dt;
          block.y += block.vy * dt;
          block.angle += block.av * dt;
          block.av *= 1 - 0.4 * dt;
        }
        if (block.shatterUntil > 0 && now >= block.shatterUntil) {
          if (block !== grabbed) respawn(block, cssW, cssH, species, off);
        }
        if (block.x < -despawn || block.x > cssW + despawn || block.y < -despawn || block.y > cssH + despawn) {
          if (block === grabbed) {
            grabbed = null;
            document.body.style.cursor = "";
          }
          respawn(block, cssW, cssH, species, off);
        }
      }

      for (let i = 0; i < blocks.length; i += 1) {
        for (let j = i + 1; j < blocks.length; j += 1) {
          collide(blocks[i], blocks[j], hitForce * speed, now);
        }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const block of blocks) {
        if (block.x + block.radius < 0 || block.x - block.radius > cssW || block.y + block.radius < 0 || block.y - block.radius > cssH) {
          block.vis = false;
          continue;
        }
        block.vis = true;
        void block.vis;
        if (block.shatterUntil > now) {
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.translate(block.x, block.y);
          ctx.rotate(block.angle * DEG);
          const s = (block.sp.def.size * block.scale * unit) / block.sp.def.size;
          ctx.scale(s, s);
          ctx.drawImage(block.sp.image, -block.sp.def.size / 2, -block.sp.def.size / 2);
          ctx.restore();
          continue;
        }
        const s = block.scale * unit;
        ctx.setTransform(
          s * Math.cos(block.angle * DEG),
          s * Math.sin(block.angle * DEG),
          -s * Math.sin(block.angle * DEG),
          s * Math.cos(block.angle * DEG),
          block.x,
          block.y,
        );
        ctx.drawImage(block.sp.image, -block.sp.def.size / 2, -block.sp.def.size / 2, block.sp.def.size, block.sp.def.size);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.vy += PARTICLE_GRAVITY * unit * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) {
          particles[i] = particles[particles.length - 1];
          particles.pop();
          continue;
        }
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      if (dt > 0.024) slowFrames += 1;
      else slowFrames = Math.max(0, slowFrames - 2);
      if (slowFrames > 90 && quality > 0.5) {
        quality = 0.5;
        slowFrames = 0;
        updateDpr();
        resize();
        for (const block of blocks) applyUnit(block);
      }

      raf = requestAnimationFrame(step);
    };

    let alive = true;
    Promise.all(DEFS.map(async (def) => {
      const image = await loadBitmap(def.src);
      return { def, image, palette: samplePalette(image) };
    }))
      .then((loaded) => {
        if (!alive || disposed) {
          for (const s of loaded) s.image.close();
          return;
        }
        species = loaded;
        resize();
        const target = Math.max(0, Math.min(MAX_BLOCKS, Math.round(bubbleBearConfig.count * 1.6)));
        for (let i = 0; i < target; i += 1) {
          const def = pickDef();
          const sp = species.find((s) => s.def.id === def.id) ?? species[0];
          const block: Block = {
            sp, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, cruise: 0,
            angle: 0, av: 0, scale: 1, mass: 1, radius: 0, half: 0,
            shatterUntil: 0, vis: true,
          };
          respawn(block, cssW || window.innerWidth * dpr, cssH || window.innerHeight * dpr, species, OFFSCREEN * dpr);
          block.x = rand(0, cssW);
          block.y = rand(0, cssH);
          blocks.push(block);
        }
        for (const block of blocks) {
          block.svx = block.vx;
          block.svy = block.vy;
          block.vx = 0;
          block.vy = 0;
        }
        for (let k = 0; k < 24; k += 1) {
          for (let i = 0; i < blocks.length; i += 1) {
            for (let j = i + 1; j < blocks.length; j += 1) {
              collide(blocks[i], blocks[j], 0, 0);
            }
          }
        }
        for (const block of blocks) {
          block.vx = block.svx ?? 0;
          block.vy = block.svy ?? 0;
        }
        window.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointermove", onHover);
        window.addEventListener("resize", resize);
        raf = requestAnimationFrame((t) => {
          last = t;
          step(t);
        });
      })
      .catch(() => undefined);

    return () => {
      alive = false;
      disposed = true;
      cancelAnimationFrame(raf);
      particles.length = 0;
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onHover);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onGrabMove);
      window.removeEventListener("pointerup", endGrab);
      window.removeEventListener("pointercancel", endGrab);
      if (grabbed) {
        grabbed = null;
        document.body.style.cursor = "";
      }
      for (const s of species) s.image.close();
    };
  }, [dim]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 0,
        opacity: dim > 0 ? 1 - dim / 100 : 1,
      }}
    />
  );
}
