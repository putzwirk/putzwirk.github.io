import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export async function ensureSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;
  const { error } = await supabase.auth.signInAnonymously();
  return !error;
}

export function isSignedInSession(session: Session | null): boolean {
  return Boolean(session) && !session?.user.is_anonymous;
}

export function isDiscordSession(session: Session | null): boolean {
  return session?.user.app_metadata?.provider === "discord";
}

const DISCORD_AUTHORIZATION_KEY = "lucidblocks.discord-authorized";

export function hasDiscordAuthorization(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISCORD_AUTHORIZATION_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberDiscordAuthorization(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISCORD_AUTHORIZATION_KEY, "1");
  } catch {
    return;
  }
}

export function forgetDiscordAuthorization(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DISCORD_AUTHORIZATION_KEY);
  } catch {
    return;
  }
}

export function accountDisplayName(session: Session | null): string {
  if (!session || session.user.is_anonymous) return "";
  const metadata = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const custom = (metadata.custom_claims ?? {}) as Record<string, unknown>;
  for (const candidate of [metadata.global_name, custom.global_name, metadata.full_name, metadata.user_name, metadata.name]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

export function isStaffSession(session: { user?: { app_metadata?: Record<string, unknown> } } | null): boolean {
  const role = session?.user?.app_metadata?.role;
  return role === "admin" || role === "moderator";
}
