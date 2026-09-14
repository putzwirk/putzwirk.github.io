import { defaultAuthorName, getActor } from "../_shared/auth.ts";
import { publicObjectUrl, serviceClient } from "../_shared/client.ts";
import { fail, json, preflight } from "../_shared/http.ts";
import { rateLimitSubject } from "../_shared/ip.ts";
import { consumeAll } from "../_shared/rateLimit.ts";
import { parseIssueInput } from "../_shared/validation.ts";
import type { RateRule } from "../_shared/rateLimit.ts";

const ISSUE_RULES: RateRule[] = [
  { bucket: "issue:hour", limit: 10, windowSeconds: 3600 },
  { bucket: "issue:day", limit: 30, windowSeconds: 86400 },
];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const service = serviceClient();
  const actor = await getActor(service, req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }

  const parsed = parseIssueInput(body);
  if (!parsed.ok) return fail(parsed.error);

  const pepper = Deno.env.get("IP_HASH_PEPPER") ?? "lucidblocks-dev-pepper";
  const subject = await rateLimitSubject(req, actor, pepper);
  try {
    const allowed = await consumeAll(service, subject, ISSUE_RULES);
    if (!allowed) return fail("You are posting too fast. Please try again later.", 429);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Rate limit unavailable", 500);
  }

  const autoApproved = Boolean(actor && (actor.isStaff || !actor.isAnonymous));
  const moderationStatus = autoApproved ? "approved" : "pending";
  const authorName = (parsed.value.author_name?.trim() || defaultAuthorName(actor)).slice(0, 40) || "Anonymous";
  const attachmentUrls = parsed.value.attachment_paths.map(publicObjectUrl);

  const insertPayload: Record<string, unknown> = {
    mod_id: parsed.value.mod_id,
    type: parsed.value.type,
    title: parsed.value.title,
    description: parsed.value.description,
    author_name: authorName,
    author_id: actor?.id ?? null,
    attachment_urls: attachmentUrls,
    moderation_status: moderationStatus,
    moderated_at: autoApproved ? new Date().toISOString() : null,
  };
  if (parsed.value.id) insertPayload.id = parsed.value.id;

  const { data: issue, error: insertError } = await service
    .from("issues")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError) return fail(insertError.message);

  if (parsed.value.attachment_paths.length > 0 && actor) {
    const { error: linkError } = await service
      .from("attachments")
      .update({ issue_id: issue.id })
      .in("storage_path", parsed.value.attachment_paths)
      .eq("uploader_id", actor.id)
      .is("issue_id", null);
    if (linkError) return fail(linkError.message, 500);
  }

  return json({ issue });
});
