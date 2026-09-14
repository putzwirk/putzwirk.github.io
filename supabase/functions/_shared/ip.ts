export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
}

export async function hashIp(ip: string, pepper: string): Promise<string> {
  const data = new TextEncoder().encode(`${pepper}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function rateLimitSubject(req: Request, actor: { id: string } | null, pepper: string): Promise<string> {
  if (actor) return `user:${actor.id}`;
  return `ip:${await hashIp(clientIp(req), pepper)}`;
}
