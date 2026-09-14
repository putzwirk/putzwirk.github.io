import { getActor } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/client.ts";
import { fail, json, preflight } from "../_shared/http.ts";
import { rateLimitSubject } from "../_shared/ip.ts";
import { consumeAll } from "../_shared/rateLimit.ts";
import type { RateRule } from "../_shared/rateLimit.ts";

const BUCKET = "issue-attachments";
const MAX_SIZE = 2 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSION_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
  apng: "image/apng",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  ogv: "video/ogg",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
};

const UPLOAD_RULES: RateRule[] = [
  { bucket: "upload:hour", limit: 30, windowSeconds: 3600 },
];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const service = serviceClient();
  const actor = await getActor(service, req);
  if (!actor) return fail("A session is required to upload attachments", 401);

  let body: { issue_id?: unknown; filename?: unknown; content_type?: unknown; size?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }

  const issueId = typeof body.issue_id === "string" ? body.issue_id : "";
  const filename = typeof body.filename === "string" ? body.filename : "";
  const contentType = typeof body.content_type === "string" ? body.content_type : "";
  const size = typeof body.size === "number" ? body.size : null;

  if (!UUID_PATTERN.test(issueId)) return fail("invalid issue_id");
  if (!filename || filename.length > 200) return fail("invalid filename");
  if (size !== null && (size <= 0 || size > MAX_SIZE)) return fail("Each attachment must be 2 MB or smaller.");

  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const mime = contentType || EXTENSION_MIME[extension] || "";
  if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
    return fail("Only images, GIFs and videos can be attached.");
  }

  const pepper = Deno.env.get("IP_HASH_PEPPER") ?? "lucidblocks-dev-pepper";
  const subject = await rateLimitSubject(req, actor, pepper);
  try {
    const allowed = await consumeAll(service, subject, UPLOAD_RULES);
    if (!allowed) return fail("Too many uploads. Please try again later.", 429);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Rate limit unavailable", 500);
  }

  const path = `issues/${issueId}/${actor.id}/${crypto.randomUUID()}.${extension || "bin"}`;

  const { data: existingIssue } = await service
    .from("issues")
    .select("id, author_id")
    .eq("id", issueId)
    .maybeSingle();
  if (existingIssue && existingIssue.author_id !== actor.id && !actor.isStaff) {
    return fail("Not allowed to attach files to this issue", 403);
  }

  const { data: signed, error: signError } = await service.storage.from(BUCKET).createSignedUploadUrl(path);
  if (signError || !signed) return fail(signError?.message ?? "Could not create an upload URL", 500);

  const { error: rowError } = await service.from("attachments").insert({
    issue_id: existingIssue ? issueId : null,
    storage_path: path,
    mime,
    size_bytes: size,
    uploader_id: actor.id,
  });
  if (rowError) return fail(rowError.message, 500);

  return json({ path, token: signed.token, signedUrl: signed.signedUrl });
});
