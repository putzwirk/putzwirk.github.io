import { supabase } from "./supabase";

export async function ensureSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;
  const { error } = await supabase.auth.signInAnonymously();
  return !error;
}

export function isStaffSession(session: { user?: { app_metadata?: Record<string, unknown> } } | null): boolean {
  const role = session?.user?.app_metadata?.role;
  return role === "admin" || role === "moderator";
}
