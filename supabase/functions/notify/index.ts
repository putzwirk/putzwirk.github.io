import { serviceClient } from "../_shared/client.ts";
import type { SupabaseClient } from "../_shared/client.ts";
import {
  buildCommentReplyEmail,
  buildIssueModerationEmail,
  planCommentReply,
  planIssueModeration,
  sendEmail,
} from "../_shared/email.ts";
import { fail, json, preflight } from "../_shared/http.ts";

interface Recipient {
  isAnonymous: boolean;
  email: string | null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function issueUrl(id: string | null): string {
  const base = Deno.env.get("SITE_URL") ?? "https://lucidblocks.com";
  return `${base.replace(/\/$/, "")}/lucidblocks/issues/${id ?? ""}`;
}

async function loadRecipient(service: SupabaseClient, userId: string): Promise<Recipient | null> {
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return { isAnonymous: Boolean(data.user.is_anonymous), email: data.user.email ?? null };
}

async function loadPreference(service: SupabaseClient, userId: string, column: string): Promise<boolean | null> {
  const { data, error } = await service
    .from("notification_preferences")
    .select(column)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const value = (data as Record<string, unknown>)[column];
  return typeof value === "boolean" ? value : null;
}

async function handleComment(service: SupabaseClient, record: Record<string, unknown>): Promise<Response> {
  const issueId = asString(record.issue_id);
  if (!issueId) return json({ skipped: "no issue" });

  const { data: issue, error } = await service
    .from("issues")
    .select("id, title, author_id")
    .eq("id", issueId)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!issue) return json({ skipped: "issue not found" });

  const issueAuthorId = asString(issue.author_id);
  const recipient = issueAuthorId ? await loadRecipient(service, issueAuthorId) : null;
  const emailReplies = issueAuthorId ? await loadPreference(service, issueAuthorId, "email_replies") : null;

  const decision = planCommentReply({
    issueAuthorId,
    commentAuthorId: asString(record.author_id),
    recipientIsAnonymous: recipient?.isAnonymous ?? false,
    recipientEmail: recipient?.email ?? null,
    emailReplies,
  });
  if (!decision.send) return json({ skipped: decision.reason });

  const content = buildCommentReplyEmail({
    issueTitle: asString(issue.title) ?? "",
    issueUrl: issueUrl(issueId),
    commentAuthor: asString(record.author_name) ?? "",
    commentBody: asString(record.body) ?? "",
  });
  const result = await sendEmail(decision.to, content);
  if (!result.sent) return fail(result.error ?? "Email send failed", 502);
  return json({ sent: "comment-reply" });
}

async function handleIssueModeration(
  service: SupabaseClient,
  record: Record<string, unknown>,
  oldRecord: Record<string, unknown>,
): Promise<Response> {
  const nextStatus = asString(record.moderation_status);
  const previousStatus = asString(oldRecord.moderation_status);
  if (nextStatus === previousStatus) return json({ skipped: "no status change" });

  const issueAuthorId = asString(record.author_id);
  const recipient = issueAuthorId ? await loadRecipient(service, issueAuthorId) : null;
  const emailStatus = issueAuthorId ? await loadPreference(service, issueAuthorId, "email_status") : null;

  const decision = planIssueModeration({
    previousStatus,
    nextStatus,
    issueAuthorId,
    recipientIsAnonymous: recipient?.isAnonymous ?? false,
    recipientEmail: recipient?.email ?? null,
    emailStatus,
  });
  if (!decision.send) return json({ skipped: decision.reason });

  const content = buildIssueModerationEmail({
    issueTitle: asString(record.title) ?? "",
    issueUrl: issueUrl(asString(record.id)),
    status: nextStatus ?? "updated",
    reason: asString(record.moderation_reason),
  });
  const result = await sendEmail(decision.to, content);
  if (!result.sent) return fail(result.error ?? "Email send failed", 502);
  return json({ sent: "issue-moderation" });
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("Method not allowed", 405);

  let payload: Record<string, unknown>;
  try {
    payload = asRecord(await req.json());
  } catch {
    return fail("Invalid JSON body");
  }

  if (!Deno.env.get("RESEND_API_KEY")) return json({ skipped: "no email provider" });

  const type = (asString(payload.type) ?? "").toUpperCase();
  const table = asString(payload.table) ?? "";
  const record = asRecord(payload.record);
  const oldRecord = asRecord(payload.old_record);
  const service = serviceClient();

  if (type === "INSERT" && table === "issue_comments") {
    return handleComment(service, record);
  }
  if (type === "UPDATE" && table === "issues") {
    return handleIssueModeration(service, record, oldRecord);
  }
  return json({ skipped: "ignored event" });
});
