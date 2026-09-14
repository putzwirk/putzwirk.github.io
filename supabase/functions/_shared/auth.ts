import type { SupabaseClient } from "./client.ts";

export interface Actor {
  id: string;
  isAnonymous: boolean;
  isStaff: boolean;
  email: string | null;
  displayName: string | null;
}

function displayNameFromMetadata(metadata: Record<string, unknown>): string | null {
  const custom = (metadata.custom_claims ?? {}) as Record<string, unknown>;
  for (const candidate of [metadata.global_name, custom.global_name, metadata.full_name, metadata.user_name, metadata.name]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
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
    displayName: displayNameFromMetadata((data.user.user_metadata ?? {}) as Record<string, unknown>),
  };
}

export function defaultAuthorName(actor: Actor | null): string {
  if (!actor) return "Anonymous";
  return actor.displayName?.slice(0, 40) || "Anonymous";
}
