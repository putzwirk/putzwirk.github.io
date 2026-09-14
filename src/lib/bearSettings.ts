import { bubbleBearConfig } from "./bearConfig";
import type { BearSettings } from "../components/SettingsPopover";

const STORAGE_KEY = "lucidblocks-bear-settings";

export function loadBearSettings(): BearSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<BearSettings> | null;
    const next = {
      count: Math.min(10, Math.max(1, saved?.count ?? bubbleBearConfig.count)),
      speed: Math.min(2, Math.max(1, saved?.speed ?? bubbleBearConfig.speed / 2)),
      hitForce: Math.min(2, Math.max(0.2, saved?.hitForce ?? bubbleBearConfig.hitForce)),
      animation: saved?.animation ?? true,
    };
    bubbleBearConfig.count = next.count;
    bubbleBearConfig.speed = next.speed * 2;
    bubbleBearConfig.hitForce = next.hitForce;
    return next;
  } catch {
    return { count: bubbleBearConfig.count, speed: bubbleBearConfig.speed / 2, hitForce: bubbleBearConfig.hitForce, animation: true };
  }
}

export function saveBearSettings(settings: BearSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
}
