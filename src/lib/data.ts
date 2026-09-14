import { supabase, STORAGE_BUCKET } from "./supabase";
import type { Mod, ModVersion, Issue, ModWithVersions } from "../types";
import { uploadIssueAttachments } from "./issueAttachments";
import { invokeOrThrow } from "./functions";
import { ensureSession } from "./session";

export async function fetchModsWithVersions(): Promise<ModWithVersions[]> {
  const { data, error } = await supabase
    .from("mods")
    .select("*, mod_versions(*)")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false, foreignTable: "mod_versions" });

  if (error) throw error;
  const mods = (data as ModWithVersions[]) ?? [];
  for (const mod of mods) {
    mod.mod_versions.sort((a, b) => {
      const releaseOrder = new Date(b.release_date).getTime() - new Date(a.release_date).getTime();
      return releaseOrder || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }
  return mods;
}

export async function fetchModById(id: string): Promise<ModWithVersions | null> {
  const { data, error } = await supabase
    .from("mods")
    .select("*, mod_versions(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const mod = data as ModWithVersions;
  mod.mod_versions.sort((a, b) => {
    const releaseOrder = new Date(b.release_date).getTime() - new Date(a.release_date).getTime();
    return releaseOrder || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return mod;
}

export async function createMod(mod: Omit<Mod, "created_at">): Promise<void> {
  const { error } = await supabase.from("mods").insert(mod);
  if (error) throw error;
}

export async function updateMod(id: string, updates: Partial<Mod>): Promise<void> {
  const { error } = await supabase.from("mods").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteMod(id: string): Promise<void> {
  const { data: files, error: listError } = await supabase.storage.from(STORAGE_BUCKET).list(id);
  if (listError) throw listError;

  if (files && files.length > 0) {
    const paths = files.map((f) => `${id}/${f.name}`);
    const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
    if (removeError) throw removeError;
  }

  const { error } = await supabase.from("mods").delete().eq("id", id);
  if (error) throw error;
}

export async function createVersion(
  version: Omit<ModVersion, "id" | "created_at" | "storage_path" | "download_count">,
  file: File
): Promise<void> {
  const storagePath = `${version.mod_id}/${version.pck_filename}`;
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { error } = await supabase.from("mod_versions").insert({
    ...version,
    storage_path: storagePath,
  });

  if (error) throw error;
}

export async function updateVersion(id: string, updates: Partial<Pick<ModVersion, "version" | "game_version" | "release_date" | "changelog" | "pck_filename" | "storage_path">>, file?: File | null, modId?: string): Promise<void> {
  let storagePath = updates.storage_path;
  let pckFilename = updates.pck_filename;
  if (file && modId) {
    pckFilename = file.name;
    storagePath = `${modId}/${file.name}`;
    const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, { upsert: true });
    if (uploadError) throw uploadError;
  }
  const payload: Record<string, unknown> = {};
  if (updates.version !== undefined) payload.version = updates.version;
  if (updates.game_version !== undefined) payload.game_version = updates.game_version;
  if (updates.release_date !== undefined) payload.release_date = updates.release_date;
  if (updates.changelog !== undefined) payload.changelog = updates.changelog;
  if (pckFilename !== undefined) payload.pck_filename = pckFilename;
  if (storagePath !== undefined) payload.storage_path = storagePath;
  if (Object.keys(payload).length === 0) return;
  const { error } = await supabase.from("mod_versions").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteVersion(version: ModVersion): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([version.storage_path]);

  if (storageError) throw storageError;

  const { error } = await supabase.from("mod_versions").delete().eq("id", version.id);
  if (error) throw error;
}

export function getDownloadUrl(storagePath: string): string {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function registerDownload(versionId: string): Promise<boolean> {
  try {
    const result = await invokeOrThrow<{ url: string; counted: boolean }>("download", { version_id: versionId });
    return Boolean(result?.counted);
  } catch {
    return false;
  }
}

export async function fetchAllPublicIssues(): Promise<Issue[]> {
  const { data, error } = await supabase.from("issues").select("*").is("deleted_at", null).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Issue[];
}

export async function fetchIssuesByMod(modId: string): Promise<Issue[]> {
  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("mod_id", modId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Issue[];
}

export async function fetchIdeas(): Promise<Issue[]> {
  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("type", "idea")
    .is("deleted_at", null)
    .order("votes", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Issue[];
}

export async function fetchIssueCount(): Promise<number> {
  const { count, error } = await supabase
    .from("issues")
    .select("*", { count: "exact", head: true })
    .eq("type", "bug")
    .eq("status", "open")
    .eq("moderation_status", "approved");

  if (error) throw error;
  return count ?? 0;
}

export async function fetchOpenIssueCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("issues")
    .select("mod_id")
    .eq("type", "bug")
    .eq("status", "open")
    .not("mod_id", "is", null)
    .eq("moderation_status", "approved");

  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { mod_id: string }[]) {
    counts[row.mod_id] = (counts[row.mod_id] ?? 0) + 1;
  }
  return counts;
}

export async function createIssue(
  issue: Pick<Issue, "mod_id" | "type" | "title" | "description" | "author_name"> & { attachments?: File[] }
): Promise<Issue> {
  const issueId = crypto.randomUUID();
  const uploads = await uploadIssueAttachments(issueId, issue.attachments ?? []);
  const created = await invokeOrThrow<{ issue: Issue }>("submit-issue", {
    id: issueId,
    mod_id: issue.mod_id,
    type: issue.type,
    title: issue.title,
    description: issue.description,
    author_name: issue.author_name,
    attachment_paths: uploads.map((upload) => upload.path),
  });
  return created.issue;
}

export async function updateIssueContent(id: string, title: string, description: string, attachmentUrls: string[], newAttachments: File[] = []): Promise<string[]> {
  const uploads = await uploadIssueAttachments(id, newAttachments);
  const uploaded = [...attachmentUrls, ...uploads.map((upload) => upload.url)];
  const { error } = await supabase.from("issues").update({ title, description, attachment_urls: uploaded }).eq("id", id);
  if (error) throw error;
  return uploaded;
}

export async function updateIssueStatus(id: string, status: "open" | "closed"): Promise<void> {
  const { error } = await supabase.from("issues").update({ status, closed_at: status === "closed" ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw error;
}

export async function softDeleteIssue(id: string): Promise<void> {
  const { error } = await supabase.from("issues").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function deleteIssue(id: string): Promise<void> {
  const { error } = await supabase.from("issues").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchPendingIssues(): Promise<Issue[]> {
  const { data, error } = await supabase.from("issues").select("*").eq("moderation_status", "pending").is("deleted_at", null).order("created_at", { ascending: false });
  if (error) throw error;
  return data as Issue[];
}

export async function moderateIssue(id: string, status: "approved" | "rejected", reason?: string): Promise<void> {
  const { error } = await supabase.from("issues").update({
    moderation_status: status,
    moderated_at: new Date().toISOString(),
    moderation_reason: status === "rejected" ? (reason?.trim() || "Rejected by moderator") : null,
  }).eq("id", id);
  if (error) throw error;
}

export async function toggleVote(issueId: string): Promise<number> {
  const session = await ensureSession();
  if (!session) throw new Error("Could not start a session to vote.");
  const { data, error } = await supabase.rpc("toggle_vote", { p_issue_id: issueId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchMyVotes(): Promise<Set<string>> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return new Set();
  const { data, error } = await supabase.from("issue_votes").select("issue_id");
  if (error) return new Set();
  return new Set((data ?? []).map((row: { issue_id: string }) => row.issue_id));
}
