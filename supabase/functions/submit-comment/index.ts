import { defaultAuthorName, getActor } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/client.ts";
import { fail, json, preflight } from "../_shared/http.ts";
import { rateLimitSubject } from "../_shared/ip.ts";
import { consumeAll } from "../_shared/rateLimit.ts";
import { parseCommentInput } from "../_shared/validation.ts";
import type { RateRule } from "../_shared/rateLimit.ts";

const COMMENT_RULES: RateRule[] = [
  { bucket: "comment:hour", limit: 30, windowSeconds: 3600 },
];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const service = serviceClient();
  const actor = await getActor(service, req);
  if (!actor) return fail("A session is required to comment", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }

  const parsed = parseCommentInput(body);
  if (!parsed.ok) return fail(parsed.error);

  const { data: issue, error: issueError } = await service
    .from("issues")
    .select("id, author_id, moderation_status, deleted_at, status")
    .eq("id", parsed.value.issue_id)
    .maybeSingle();
  if (issueError) return fail(issueError.message, 500);
  if (!issue || issue.deleted_at) return fail("Issue not found", 404);
  const canRead = issue.moderation_status === "approved" || issue.author_id === actor.id || actor.isStaff;
  if (!canRead) return fail("Issue not found", 404);
  if (issue.status === "closed") return fail("Comments are closed on this issue", 409);

  if (parsed.value.parent_id) {
    const { data: parent, error: parentError } = await service
      .from("issue_comments")
      .select("id, issue_id, parent_id")
      .eq("id", parsed.value.parent_id)
      .maybeSingle();
    if (parentError) return fail(parentError.message, 500);
    if (!parent || parent.issue_id !== parsed.value.issue_id || parent.parent_id) {
      return fail("Replies must target a top-level comment on the same issue");
    }
  }

  const pepper = Deno.env.get("IP_HASH_PEPPER") ?? "lucidblocks-dev-pepper";
  const subject = await rateLimitSubject(req, actor, pepper);
  try {
    const allowed = await consumeAll(service, subject, COMMENT_RULES);
    if (!allowed) return fail("You are commenting too fast. Please try again later.", 429);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Rate limit unavailable", 500);
  }

  const authorName = (parsed.value.author_name?.trim() || defaultAuthorName(actor)).slice(0, 40) || "Anonymous";
  let moderationStatus: "pending" | "approved" | "rejected" = "pending";
  let moderationReason: string | null = null;
  if (actor.isStaff) {
    moderationStatus = "approved";
  } else {
    const { data: blocked } = await service.rpc("text_is_blocked", { p_text: `${parsed.value.body} ${authorName}` });
    if (blocked === true) {
      moderationStatus = "rejected";
      moderationReason = "Blocked by automatic content moderation";
    } else {
      const { data: trusted } = await service.rpc("is_trusted_contributor", { p_user_id: actor.id });
      if (trusted === true) moderationStatus = "approved";
    }
  }

  const { data: comment, error: insertError } = await service
    .from("issue_comments")
    .insert({
      issue_id: parsed.value.issue_id,
      parent_id: parsed.value.parent_id,
      author_id: actor.id,
      author_name: authorName,
      body: parsed.value.body,
      moderation_status: moderationStatus,
      moderation_reason: moderationReason,
      moderated_at: moderationStatus === "pending" ? null : new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insertError) return fail(insertError.message);

  return json({ comment, moderation_status: moderationStatus });
});
