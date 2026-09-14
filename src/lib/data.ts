import { supabase, STORAGE_BUCKET } from "./supabase";
import type { Mod, ModVersion, Issue, IssueComment, IssueEvent, IssueState, Label, ModWithVersions } from "../types";
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

export type ModAssetKind = "banner" | "screenshot";

export interface ModMedia {
  tags?: string[];
  banner_path?: string | null;
  screenshots?: string[];
}

export interface VersionMeta {
  published?: boolean;
  channel?: "stable" | "beta";
}

export async function createVersion(
  version: Omit<ModVersion, "id" | "created_at" | "storage_path" | "download_count"> & VersionMeta,
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

export async function updateVersion(id: string, updates: Partial<Pick<ModVersion, "version" | "game_version" | "release_date" | "changelog" | "pck_filename" | "storage_path">> & VersionMeta, file?: File | null, modId?: string): Promise<void> {
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
  if (updates.published !== undefined) payload.published = updates.published;
  if (updates.channel !== undefined) payload.channel = updates.channel;
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

const MOD_ASSETS_BUCKET = "mod-assets";
const MAX_MOD_ASSET_BYTES = 5 * 1024 * 1024;
const MOD_ASSET_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

export function validateModAsset(file: File): string | null {
  if (!MOD_ASSET_TYPES.has(file.type)) return `${file.name} must be a PNG, JPEG, WebP, GIF or AVIF image.`;
  if (file.size > MAX_MOD_ASSET_BYTES) return `${file.name} is larger than 5 MB.`;
  return null;
}

export async function uploadModAsset(modId: string, file: File, kind: ModAssetKind): Promise<string> {
  if (!modId) throw new Error("A mod id is required before uploading assets.");
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
  const path = kind === "banner"
    ? `mods/${modId}/banner-${crypto.randomUUID()}${extension}`
    : `mods/${modId}/screenshots/${crypto.randomUUID()}${extension}`;
  const { error } = await supabase.storage.from(MOD_ASSETS_BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}

export function getModAssetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = supabase.storage.from(MOD_ASSETS_BUCKET).getPublicUrl(path);
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
  await ensureSession();
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

export interface IssueDetailData {
  issue: Issue;
  modName: string | null;
}

export async function fetchIssueById(id: string): Promise<IssueDetailData | null> {
  const { data, error } = await supabase.from("issues").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const issue = data as Issue;
  let modName: string | null = null;
  if (issue.mod_id) {
    const { data: mod } = await supabase.from("mods").select("name").eq("id", issue.mod_id).maybeSingle();
    modName = (mod as { name?: string } | null)?.name ?? null;
  }
  return { issue, modName };
}

export async function fetchComments(issueId: string): Promise<IssueComment[]> {
  const { data, error } = await supabase
    .from("issue_comments")
    .select("*")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as IssueComment[];
}

export async function createComment(issueId: string, body: string, authorName: string, parentId: string | null = null): Promise<IssueComment> {
  const session = await ensureSession();
  if (!session) throw new Error("Could not start a session to comment.");
  const result = await invokeOrThrow<{ comment: IssueComment }>("submit-comment", {
    issue_id: issueId,
    body,
    author_name: authorName,
    parent_id: parentId,
  });
  return result.comment;
}

export async function updateComment(id: string, body: string): Promise<void> {
  const { error } = await supabase.from("issue_comments").update({ body }).eq("id", id);
  if (error) throw error;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from("issue_comments").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchIssueEvents(issueId: string): Promise<IssueEvent[]> {
  const { data, error } = await supabase
    .from("issue_events")
    .select("*")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as IssueEvent[];
}

export async function updateIssueState(id: string, state: IssueState, fixedInVersionId?: string | null): Promise<void> {
  const payload: Record<string, unknown> = { state };
  if (fixedInVersionId !== undefined) payload.fixed_in_version_id = fixedInVersionId;
  const { error } = await supabase.from("issues").update(payload).eq("id", id);
  if (error) throw error;
}

export async function fetchLabels(): Promise<Label[]> {
  const { data, error } = await supabase.from("labels").select("*").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Label[];
}

export async function fetchIssueLabels(issueId: string): Promise<Label[]> {
  const { data, error } = await supabase
    .from("issue_labels")
    .select("label_id, labels(id, name, color, scope)")
    .eq("issue_id", issueId);
  if (error) throw error;
  return (data ?? []).map((row: { labels: Label | Label[] }) => Array.isArray(row.labels) ? row.labels[0] : row.labels).filter((label): label is Label => Boolean(label));
}

export async function createLabel(name: string, color: string): Promise<Label> {
  const { data, error } = await supabase.from("labels").insert({ name: name.trim(), color }).select("*").single();
  if (error) throw error;
  return data as Label;
}

export async function setIssueLabels(issueId: string, labelIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase.from("issue_labels").delete().eq("issue_id", issueId);
  if (deleteError) throw deleteError;
  if (labelIds.length === 0) return;
  const { error: insertError } = await supabase
    .from("issue_labels")
    .insert(labelIds.map((labelId) => ({ issue_id: issueId, label_id: labelId })));
  if (insertError) throw insertError;
}

export async function fetchIssueLabelsForIssues(issueIds: string[]): Promise<Record<string, Label[]>> {
  if (issueIds.length === 0) return {};
  const { data, error } = await supabase
    .from("issue_labels")
    .select("issue_id, labels(id, name, color, scope)")
    .in("issue_id", issueIds);
  if (error) throw error;
  const grouped: Record<string, Label[]> = {};
  for (const row of (data ?? []) as Array<{ issue_id: string; labels: Label | Label[] | null }>) {
    const label = Array.isArray(row.labels) ? row.labels[0] : row.labels;
    if (!label) continue;
    if (!grouped[row.issue_id]) grouped[row.issue_id] = [];
    grouped[row.issue_id].push(label);
  }
  return grouped;
}

export function subscribeToIssue(issueId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`issue-${issueId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "issue_comments", filter: `issue_id=eq.${issueId}` }, onChange)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "issues", filter: `id=eq.${issueId}` }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export interface NotificationPayload {
  preview?: string;
  status?: string;
  [key: string]: unknown;
}

export interface Notification {
  id: string;
  recipient_id: string;
  kind: string;
  issue_id: string | null;
  comment_id: string | null;
  payload: NotificationPayload;
  read_at: string | null;
  created_at: string;
}

export async function fetchNotifications(limit = 30): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw error;
}

export async function fetchMyIssues(): Promise<Issue[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return [];
  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("author_id", sessionData.session.user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Issue[];
}

export async function convertAnonymousAccount(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({ email });
  return { error: error?.message ?? null };
}
