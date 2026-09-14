import {
  buildCommentReplyEmail,
  buildIssueModerationEmail,
  planCommentReply,
  planIssueModeration,
  sendEmail,
} from "./email.ts";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const reply = buildCommentReplyEmail({
  issueTitle: "Chest disappears",
  issueUrl: "https://lucidblocks.com/lucidblocks/issues/abc",
  commentAuthor: "modder",
  commentBody: "Can you share the log?",
});

Deno.test("comment reply subject names the issue", () => {
  assert(reply.subject === 'New reply on "Chest disappears"', "unexpected subject");
});

Deno.test("comment reply text includes author, body and link", () => {
  assert(reply.text.includes("modder"), "author missing from text");
  assert(reply.text.includes("Can you share the log?"), "body missing from text");
  assert(reply.text.includes("https://lucidblocks.com/lucidblocks/issues/abc"), "link missing from text");
});

Deno.test("comment reply html escapes user content", () => {
  const content = buildCommentReplyEmail({
    issueTitle: "<b>title</b>",
    issueUrl: "https://example.com/i/1",
    commentAuthor: "a<script>",
    commentBody: "line1\nline2",
  });
  assert(!content.html.includes("<script>"), "raw script tag must not survive");
  assert(content.html.includes("a&lt;script&gt;"), "author should be escaped");
  assert(content.html.includes("line1<br>line2"), "newlines should become breaks");
});

const rejected = buildIssueModerationEmail({
  issueTitle: "Crash on load",
  issueUrl: "https://lucidblocks.com/lucidblocks/issues/xyz",
  status: "rejected",
  reason: "Duplicate report",
});

Deno.test("moderation email subject and reason are included", () => {
  assert(rejected.subject === 'Your issue "Crash on load" was rejected', "unexpected subject");
  assert(rejected.text.includes("Reason: Duplicate report"), "reason missing from text");
  assert(rejected.html.includes("Duplicate report"), "reason missing from html");
});

Deno.test("approved moderation email has no reason block", () => {
  const content = buildIssueModerationEmail({
    issueTitle: "Idea",
    issueUrl: "https://example.com/i/2",
    status: "approved",
    reason: null,
  });
  assert(content.subject.endsWith("was approved"), "approved should read approved");
  assert(!content.text.includes("Reason:"), "reason should be omitted when absent");
});

Deno.test("reply plan sends to a registered author", () => {
  const decision = planCommentReply({
    issueAuthorId: "author-1",
    commentAuthorId: "commenter-1",
    recipientIsAnonymous: false,
    recipientEmail: "author@example.com",
    emailReplies: null,
  });
  assert(decision.send === true, "expected a send");
  if (decision.send) assert(decision.to === "author@example.com", "wrong recipient");
});

Deno.test("reply plan skips a missing author", () => {
  const decision = planCommentReply({
    issueAuthorId: null,
    commentAuthorId: "commenter-1",
    recipientIsAnonymous: false,
    recipientEmail: "author@example.com",
    emailReplies: null,
  });
  assert(decision.send === false && decision.reason === "no author", "expected no author skip");
});

Deno.test("reply plan skips the author's own comment", () => {
  const decision = planCommentReply({
    issueAuthorId: "author-1",
    commentAuthorId: "author-1",
    recipientIsAnonymous: false,
    recipientEmail: "author@example.com",
    emailReplies: null,
  });
  assert(decision.send === false && decision.reason === "own comment", "expected own comment skip");
});

Deno.test("reply plan skips anonymous recipients", () => {
  const decision = planCommentReply({
    issueAuthorId: "author-1",
    commentAuthorId: "commenter-1",
    recipientIsAnonymous: true,
    recipientEmail: null,
    emailReplies: null,
  });
  assert(decision.send === false && decision.reason === "anonymous recipient", "expected anonymous skip");
});

Deno.test("reply plan skips a missing email", () => {
  const decision = planCommentReply({
    issueAuthorId: "author-1",
    commentAuthorId: "commenter-1",
    recipientIsAnonymous: false,
    recipientEmail: null,
    emailReplies: null,
  });
  assert(decision.send === false && decision.reason === "no email", "expected no email skip");
});

Deno.test("reply plan skips an explicit opt-out", () => {
  const decision = planCommentReply({
    issueAuthorId: "author-1",
    commentAuthorId: "commenter-1",
    recipientIsAnonymous: false,
    recipientEmail: "author@example.com",
    emailReplies: false,
  });
  assert(decision.send === false && decision.reason === "opted out", "expected opt-out skip");
});

Deno.test("moderation plan sends on a status change", () => {
  const decision = planIssueModeration({
    previousStatus: "pending",
    nextStatus: "approved",
    issueAuthorId: "author-1",
    recipientIsAnonymous: false,
    recipientEmail: "author@example.com",
    emailStatus: null,
  });
  assert(decision.send === true, "expected a send");
});

Deno.test("moderation plan skips an unchanged status", () => {
  const decision = planIssueModeration({
    previousStatus: "approved",
    nextStatus: "approved",
    issueAuthorId: "author-1",
    recipientIsAnonymous: false,
    recipientEmail: "author@example.com",
    emailStatus: null,
  });
  assert(decision.send === false && decision.reason === "no status change", "expected no-change skip");
});

Deno.test("moderation plan skips an opted-out author", () => {
  const decision = planIssueModeration({
    previousStatus: "pending",
    nextStatus: "rejected",
    issueAuthorId: "author-1",
    recipientIsAnonymous: false,
    recipientEmail: "author@example.com",
    emailStatus: false,
  });
  assert(decision.send === false && decision.reason === "opted out", "expected opt-out skip");
});

Deno.test("sendEmail reports no provider without a key", async () => {
  const previous = Deno.env.get("RESEND_API_KEY");
  Deno.env.delete("RESEND_API_KEY");
  const result = await sendEmail("author@example.com", reply);
  if (previous !== undefined) Deno.env.set("RESEND_API_KEY", previous);
  assert(result.sent === false, "send should be skipped without a key");
  assert(result.error === "no email provider", "expected provider error");
});
