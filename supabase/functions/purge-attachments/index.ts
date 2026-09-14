import { getActor } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/client.ts";
import { fail, json, preflight } from "../_shared/http.ts";

const BUCKET = "issue-attachments";
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

interface AttachmentRow {
  id: string;
  storage_path: string;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const service = serviceClient();
  const actor = await getActor(service, req);
  const secret = Deno.env.get("PURGE_SECRET") ?? "";
  const header = req.headers.get("x-cron-secret") ?? "";
  const authorized = (secret.length > 0 && header === secret) || Boolean(actor?.isStaff);
  if (!authorized) return fail("Not authorized", 401);

  const cutoff = new Date(Date.now() - ORPHAN_AGE_MS).toISOString();
  const { data: marked, error: markedError } = await service
    .from("attachments")
    .select("id, storage_path")
    .not("deleted_at", "is", null);
  if (markedError) return fail(markedError.message, 500);

  const { data: orphaned, error: orphanError } = await service
    .from("attachments")
    .select("id, storage_path")
    .is("issue_id", null)
    .lt("created_at", cutoff);
  if (orphanError) return fail(orphanError.message, 500);

  const rows: AttachmentRow[] = [...(marked ?? []), ...(orphaned ?? [])];
  if (rows.length === 0) return json({ purged: 0 });

  const paths = rows.map((row) => row.storage_path);
  const { error: removeError } = await service.storage.from(BUCKET).remove(paths);
  if (removeError) return fail(removeError.message, 500);

  const { error: deleteError } = await service
    .from("attachments")
    .delete()
    .in("id", rows.map((row) => row.id));
  if (deleteError) return fail(deleteError.message, 500);

  return json({ purged: rows.length });
});
