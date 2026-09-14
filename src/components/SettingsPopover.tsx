import { useEffect, useRef, useState } from "react";
import { bubbleBearConfig, supportsBubbleBearRenderer } from "./BubbleBears";
import { saveBearSettings } from "../lib/bearSettings";

export interface BearSettings {
  count: number;
  speed: number;
  hitForce: number;
  animation: boolean;
}

interface SettingsPopoverProps {
  settings: BearSettings;
  onChange: (settings: BearSettings) => void;
}

export default function SettingsPopover({ settings, onChange }: SettingsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [rendererSupported] = useState(supportsBubbleBearRenderer);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const update = (key: "count" | "speed" | "hitForce", value: number) => {
    const next = { ...settings, [key]: value };
    bubbleBearConfig[key] = key === "speed" ? value * 2 : value;
    saveBearSettings(next);
    onChange(next);
  };

  const toggleAnimation = (enabled: boolean) => {
    const next = { ...settings, animation: enabled };
    saveBearSettings(next);
    onChange(next);
  };

  if (!rendererSupported) return null;

  return (
    <div ref={menuRef} className={`settings-menu${open ? " open" : ""}`}>
      <button className="settings-trigger" type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
        Settings
      </button>
      <div className="settings-popover" aria-hidden={!open}>
        <div className="settings-heading settings-heading-toggle"><span>BubbleBears</span><span className="animation-toggle-label"><img className={`animation-off-image${settings.animation ? " hidden" : ""}`} src="/1381479053650952313.webp" alt="BubbleBear animation" /><input type="checkbox" role="switch" aria-label="Toggle BubbleBears animation" aria-checked={settings.animation} checked={settings.animation} onChange={(event) => toggleAnimation(event.target.checked)} /></span></div>
        <label className="settings-slider">
          <span><b>Bears</b><output>{settings.count}</output></span>
          <input type="range" min="1" max="10" step="1" value={settings.count} onChange={(event) => update("count", Number(event.target.value))} />
        </label>
        <label className="settings-slider">
          <span><b>Speed</b><output>{settings.speed.toFixed(1)}×</output></span>
          <input type="range" min="1" max="2" step="0.1" value={settings.speed} onChange={(event) => update("speed", Number(event.target.value))} />
        </label>
        <label className="settings-slider">
          <span><b>Hit force</b><output>{settings.hitForce.toFixed(1)}×</output></span>
          <input type="range" min="0.2" max="2" step="0.1" value={settings.hitForce} onChange={(event) => update("hitForce", Number(event.target.value))} />
        </label>
      </div>
    </div>
  );
}
