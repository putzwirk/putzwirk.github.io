const ISSUE_TYPES = new Set(["bug", "idea"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IssueInput {
  id: string | null;
  mod_id: string | null;
  type: "bug" | "idea";
  title: string;
  description: string;
  author_name: string | null;
  attachment_paths: string[];
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parseIssueInput(raw: unknown): ParseResult<IssueInput> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid request body" };
  const body = raw as Record<string, unknown>;

  const type = asString(body.type);
  if (!type || !ISSUE_TYPES.has(type)) return { ok: false, error: "type must be bug or idea" };

  const title = (asString(body.title) ?? "").trim();
  if (title.length < 1 || title.length > 80) return { ok: false, error: "title must be 1-80 characters" };

  const description = (asString(body.description) ?? "").slice(0, 2000);
  const authorNameRaw = asString(body.author_name);
  if (authorNameRaw !== null && authorNameRaw.length > 40) return { ok: false, error: "author_name is too long" };

  const modId = asString(body.mod_id);
  if (modId !== null && (modId.length < 1 || modId.length > 120)) return { ok: false, error: "invalid mod_id" };

  const id = asString(body.id);
  if (id !== null && !UUID_PATTERN.test(id)) return { ok: false, error: "invalid issue id" };

  const rawPaths = body.attachment_paths;
  const attachmentPaths: string[] = [];
  if (Array.isArray(rawPaths)) {
    if (rawPaths.length > 5) return { ok: false, error: "at most 5 attachments" };
    for (const entry of rawPaths) {
      const value = asString(entry);
      if (!value) return { ok: false, error: "invalid attachment path" };
      attachmentPaths.push(value);
    }
  }

  return {
    ok: true,
    value: {
      id,
      mod_id: modId,
      type: type as "bug" | "idea",
      title,
      description,
      author_name: authorNameRaw,
      attachment_paths: attachmentPaths,
    },
  };
}
