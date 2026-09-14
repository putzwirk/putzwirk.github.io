let activeFrame = 0;

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function scrollToCenter(target: HTMLElement, duration = 550) {
  if (typeof window === "undefined") return;
  cancelAnimationFrame(activeFrame);
  const rect = target.getBoundingClientRect();
  const absoluteTop = rect.top + window.scrollY;
  const aboveCenter = window.innerHeight * 0.04;
  const destination = Math.max(0, absoluteTop + rect.height / 2 - window.innerHeight / 2 - aboveCenter);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || duration <= 0) {
    window.scrollTo(0, destination);
    return;
  }
  const start = window.scrollY;
  const distance = destination - start;
  if (Math.abs(distance) < 2) return;
  const began = performance.now();
  const step = (now: number) => {
    const elapsed = Math.min(1, (now - began) / duration);
    window.scrollTo(0, start + distance * easeInOutCubic(elapsed));
    if (elapsed < 1) activeFrame = requestAnimationFrame(step);
  };
  activeFrame = requestAnimationFrame(step);
}

export function centerAfterRender(target: { current: HTMLElement | null }) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (target.current) scrollToCenter(target.current);
    });
  });
}
