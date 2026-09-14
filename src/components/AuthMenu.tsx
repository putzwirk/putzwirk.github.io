import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

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

function displayName(session: Session): string {
  const metadata = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  for (const candidate of [metadata.global_name, metadata.name, metadata.full_name, metadata.user_name]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  const email = session.user.email;
  if (email) return email.split("@")[0];
  return "Account";
}

export default function AuthMenu() {
  const { session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: linkError } = await supabase.auth.linkIdentity({ provider: "discord", options: { redirectTo: authRedirectTarget() } });
    if (linkError) setError(friendlyAuthError(linkError.message));
    else setMessage("Discord linked to this account.");
    setBusy(false);
  };

  if (!session) {
    return (
      <div className="auth-menu auth-menu-guest">
        <button className="btn btn-accent btn-sm auth-discord-btn" type="button" onClick={handleDiscord} disabled={busy}>
          {busy ? "Opening…" : "Sign in with Discord"}
        </button>
        {error && <span className="auth-error auth-error-floating" role="alert">{error}</span>}
      </div>
    );
  }

  const anonymous = Boolean(session.user.is_anonymous);

  return (
    <div ref={menuRef} className={`auth-menu${open ? " open" : ""}`}>
      <button className="auth-trigger" type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((value) => !value)}>
        <span className="auth-name">{displayName(session)}</span>
        <span className="auth-caret" aria-hidden="true">▾</span>
      </button>
      <div className="auth-popover" aria-hidden={!open}>
        {anonymous && (
          <button className="auth-item auth-item-accent" type="button" onClick={handleSave} disabled={busy}>
            {busy ? "Opening…" : "Save your reports"}
          </button>
        )}
        <Link className="auth-item" to="/lucidblocks/my" onClick={() => setOpen(false)}>My reports</Link>
        <button className="auth-item" type="button" onClick={() => { setOpen(false); signOut(); }}>Sign out</button>
        {message && <p className="auth-message">{message}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
