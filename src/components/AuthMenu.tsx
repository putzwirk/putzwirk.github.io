import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { accountDisplayName, isSignedInSession } from "../lib/session";

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
  const { session, signOut, isStaff } = useAuth();
  const signedIn = isSignedInSession(session);
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

  if (!signedIn) {
    return (
      <div className="auth-menu auth-menu-guest">
        <button className="btn btn-accent btn-sm auth-discord-btn" type="button" onClick={handleDiscord} disabled={busy}>
          <svg className="auth-discord-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286ZM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189Zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
            />
          </svg>
          <span className="auth-discord-label">{busy ? "Opening…" : "Login"}</span>
        </button>
        {error && <span className="auth-error auth-error-floating" role="alert">{error}</span>}
      </div>
    );
  }

  return (
    <div ref={menuRef} className={`auth-menu${open ? " open" : ""}`}>
      <button className="auth-trigger" type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((value) => !value)}>
        <span className="auth-name">{accountDisplayName(session) || "Account"}</span>
      </button>
      <div className="auth-popover" aria-hidden={!open}>
        <Link className="auth-item" to="/lucidblocks/my" onClick={() => setOpen(false)}>My reports</Link>
        {isStaff && <Link className="auth-item" to="/lucidblocks/admin" onClick={() => setOpen(false)}>Admin panel</Link>}
        <button className="auth-item" type="button" onClick={() => { setOpen(false); signOut(); }}>Sign out</button>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
