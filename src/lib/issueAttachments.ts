import { supabase, ISSUE_ATTACHMENTS_BUCKET } from "./supabase";

export const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;
export const MAX_ATTACHMENT_TOTAL = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;

export async function uploadIssueAttachments(files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const path = `${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from(ISSUE_ATTACHMENTS_BUCKET).upload(path, file);
    if (error) throw error;
    urls.push(supabase.storage.from(ISSUE_ATTACHMENTS_BUCKET).getPublicUrl(path).data.publicUrl);
  }
  return urls;
}
