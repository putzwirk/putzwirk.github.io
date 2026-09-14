import type { SupabaseClient } from "./client.ts";

export interface Actor {
  id: string;
  isAnonymous: boolean;
  isStaff: boolean;
  email: string | null;
}

export async function getActor(service: SupabaseClient, req: Request): Promise<Actor | null> {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const jwt = header.slice(7).trim();
  if (!jwt) return null;
  const { data, error } = await service.auth.getUser(jwt);
  if (error || !data.user) return null;
  const role = String((data.user.app_metadata as Record<string, unknown> | undefined)?.role ?? "");
  return {
    id: data.user.id,
    isAnonymous: Boolean(data.user.is_anonymous),
    isStaff: role === "admin" || role === "moderator",
    email: data.user.email ?? null,
  };
}

export function defaultAuthorName(actor: Actor | null): string {
  if (!actor) return "Anonymous";
  if (actor.email) return actor.email.split("@")[0].slice(0, 40);
  return "Anonymous";
}
