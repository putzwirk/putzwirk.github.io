import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { accountDisplayName } from "../lib/session";

export function authRedirectTarget(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}`;
}

export async function signInWithDiscord(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: authRedirectTarget() } });
  return { error: error?.message ?? null };
}

export function friendlyAuthError(message: string | null): string | null {
  if (!message) return null;
  const lower = message.toLowerCase();
  if (lower.includes("not enabled") || lower.includes("disabled") || (lower.includes("provider") && lower.includes("not"))) {
    return "Discord sign-in is not enabled yet. Use staff sign-in or post anonymously.";
  }
  return "Could not start Discord sign-in. Please try again later.";
}

export default function AuthMenu() {
  const { session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const handleDiscord = async () => {
    setBusy(true);
    setError(null);
    const { error: authError } = await signInWithDiscord();
    if (authError) setError(friendlyAuthError(authError));
    setBusy(false);
  };

  if (!session) {
    return (
      <div className="auth-menu auth-menu-guest">
        <button className="btn btn-accent btn-sm auth-discord-btn" type="button" onClick={handleDiscord} disabled={busy}>
          {busy ? "Opening…" : <><span className="auth-discord-full">Sign in with Discord</span><span className="auth-discord-short">Sign in</span></>}
        </button>
        {error && <span className="auth-error auth-error-floating" role="alert">{error}</span>}
      </div>
    );
  }

  return (
    <div ref={menuRef} className={`auth-menu${open ? " open" : ""}`}>
      <button className="auth-trigger" type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((value) => !value)}>
        <span className="auth-name">{accountDisplayName(session) || "Account"}</span>
        <span className="auth-caret" aria-hidden="true">▾</span>
      </button>
      <div className="auth-popover" aria-hidden={!open}>
        <Link className="auth-item" to="/lucidblocks/my" onClick={() => setOpen(false)}>My reports</Link>
        <button className="auth-item" type="button" onClick={() => { setOpen(false); signOut(); }}>Sign out</button>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
