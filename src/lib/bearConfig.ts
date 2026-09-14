const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const bubbleBearConfig = {
  count: Math.min(10, Math.max(0, Math.round(num(import.meta.env.VITE_BUBBLEBEAR_COUNT, 5)))),
  speed: Math.min(4, Math.max(2, num(import.meta.env.VITE_BUBBLEBEAR_SPEED, 2))),
  rotation: Math.max(0, num(import.meta.env.VITE_BUBBLEBEAR_ROTATION, 18)),
  scale: Math.max(0.05, num(import.meta.env.VITE_BUBBLEBEAR_SCALE, 1)),
  dprCap: Math.max(0.5, num(import.meta.env.VITE_BUBBLEBEAR_DPR, 2)),
  gravity: Math.max(0, num(import.meta.env.VITE_BUBBLEBEAR_GRAVITY, 3600000)),
  hitForce: 0.2,
};

export function supportsBubbleBearRenderer() {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  const canvas = document.createElement("canvas");
  if (!canvas.getContext("2d") || typeof window.createImageBitmap !== "function") return false;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
  const device = navigator as Navigator & { deviceMemory?: number };
  if (mobile && ((device.hardwareConcurrency ?? 4) <= 2 || (device.deviceMemory ?? 4) <= 2)) return false;
  return true;
}
