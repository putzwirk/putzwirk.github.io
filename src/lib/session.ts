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
