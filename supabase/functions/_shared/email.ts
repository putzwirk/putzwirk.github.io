export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface CommentReplyInput {
  issueTitle: string;
  issueUrl: string;
  commentAuthor: string;
  commentBody: string;
}

export interface IssueModerationInput {
  issueTitle: string;
  issueUrl: string;
  status: string;
  reason?: string | null;
}

export type SkipReason =
  | "no author"
  | "own comment"
  | "no status change"
  | "anonymous recipient"
  | "no email"
  | "opted out";

export type SendDecision = { send: true; to: string } | { send: false; reason: SkipReason };

export interface CommentReplyRecipient {
  issueAuthorId: string | null;
  commentAuthorId: string | null;
  recipientIsAnonymous: boolean;
  recipientEmail: string | null;
  emailReplies: boolean | null;
}

export interface IssueModerationRecipient {
  previousStatus: string | null;
  nextStatus: string | null;
  issueAuthorId: string | null;
  recipientIsAnonymous: boolean;
  recipientEmail: string | null;
  emailStatus: boolean | null;
}

export interface SendResult {
  sent: boolean;
  error?: string;
}

const STATUS_LABELS: Record<string, string> = {
  approved: "approved",
  pending: "put back in review",
  rejected: "rejected",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function planCommentReply(input: CommentReplyRecipient): SendDecision {
  if (!input.issueAuthorId) return { send: false, reason: "no author" };
  if (input.commentAuthorId && input.commentAuthorId === input.issueAuthorId) {
    return { send: false, reason: "own comment" };
  }
  if (input.recipientIsAnonymous) return { send: false, reason: "anonymous recipient" };
  if (!input.recipientEmail) return { send: false, reason: "no email" };
  if (input.emailReplies === false) return { send: false, reason: "opted out" };
  return { send: true, to: input.recipientEmail };
}

export function planIssueModeration(input: IssueModerationRecipient): SendDecision {
  if (!input.nextStatus || input.nextStatus === input.previousStatus) {
    return { send: false, reason: "no status change" };
  }
  if (!input.issueAuthorId) return { send: false, reason: "no author" };
  if (input.recipientIsAnonymous) return { send: false, reason: "anonymous recipient" };
  if (!input.recipientEmail) return { send: false, reason: "no email" };
  if (input.emailStatus === false) return { send: false, reason: "opted out" };
  return { send: true, to: input.recipientEmail };
}

export function buildCommentReplyEmail(input: CommentReplyInput): EmailContent {
  const title = input.issueTitle.trim() || "your issue";
  const author = input.commentAuthor.trim() || "Someone";
  const body = input.commentBody.trim();
  const subject = `New reply on "${title}"`;
  const text = [
    `${author} replied to your issue "${title}".`,
    "",
    body,
    "",
    `View the thread: ${input.issueUrl}`,
    "",
    "You are receiving this because reply emails are enabled for your account.",
  ].join("\n");
  const html = [
    `<p><strong>${escapeHtml(author)}</strong> replied to your issue "${escapeHtml(title)}".</p>`,
    `<blockquote>${escapeHtml(body).replace(/\n/g, "<br>")}</blockquote>`,
    `<p><a href="${escapeHtml(input.issueUrl)}">View the thread</a></p>`,
    `<p>You are receiving this because reply emails are enabled for your account.</p>`,
  ].join("\n");
  return { subject, text, html };
}

export function buildIssueModerationEmail(input: IssueModerationInput): EmailContent {
  const title = input.issueTitle.trim() || "your issue";
  const label = statusLabel(input.status);
  const reason = (input.reason ?? "").trim();
  const subject = `Your issue "${title}" was ${label}`;
  const text = [
    `Your issue "${title}" was ${label}.`,
    ...(reason ? ["", `Reason: ${reason}`] : []),
    "",
    `View the issue: ${input.issueUrl}`,
    "",
    "You are receiving this because status emails are enabled for your account.",
  ].join("\n");
  const html = [
    `<p>Your issue "${escapeHtml(title)}" was <strong>${escapeHtml(label)}</strong>.</p>`,
    ...(reason ? [`<p>Reason: ${escapeHtml(reason)}</p>`] : []),
    `<p><a href="${escapeHtml(input.issueUrl)}">View the issue</a></p>`,
    `<p>You are receiving this because status emails are enabled for your account.</p>`,
  ].join("\n");
  return { subject, text, html };
}

export async function sendEmail(to: string, content: EmailContent): Promise<SendResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, error: "no email provider" };
  const from = Deno.env.get("EMAIL_FROM") ?? "Lucid Blocks <notifications@lucidblocks.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: content.subject,
      text: content.text,
      html: content.html,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    return { sent: false, error: detail || `Resend request failed with status ${response.status}` };
  }
  return { sent: true };
}
