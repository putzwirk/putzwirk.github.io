import { supabase, ISSUE_ATTACHMENTS_BUCKET } from "./supabase";
import { invokeOrThrow } from "./functions";
import { ensureSession } from "./session";

export const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;
export const MAX_ATTACHMENT_TOTAL = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
export const ATTACHMENT_ACCEPT = "image/*,video/*";
export const ATTACHMENT_TYPE_ERROR = "Only images, GIFs and videos can be attached (PNG, JPG, GIF, WEBP, MP4, WEBM, MOV).";
export const ATTACHMENT_SIGNED_URL_TTL = 3600;

const ATTACHMENT_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "apng", "mp4", "webm", "ogg", "ogv", "mov", "avi", "mkv"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogg", "ogv", "mov", "avi", "mkv"]);

export interface UploadedAttachment {
  path: string;
  url: string;
}

export function attachmentExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function isAllowedAttachmentFile(file: Pick<File, "type" | "name">): boolean {
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/") || mime.startsWith("video/")) return true;
  if (mime === "" || mime === "application/octet-stream") return ATTACHMENT_EXTENSIONS.has(attachmentExtension(file.name));
  return false;
}

const EXTENSION_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", avif: "image/avif", apng: "image/apng", mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg", ogv: "video/ogg", mov: "video/quicktime", avi: "video/x-msvideo", mkv: "video/x-matroska" };

export function friendlyAttachmentError(fileName: string, rawMessage: string): Error {
  const detail = rawMessage.toLowerCase();
  if (detail.includes("mime") || detail.includes("content-type") || detail.includes("file type")) return new Error(`${fileName} was rejected ("${rawMessage}"). ${ATTACHMENT_TYPE_ERROR}`);
  return new Error(`${fileName}: ${rawMessage}`);
}

export function isVideoAttachmentUrl(url: string): boolean {
  const clean = url.split("?")[0].split("#")[0];
  const extension = clean.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.has(extension);
}

const ATTACHMENT_URL_MARKERS = ["/object/public/issue-attachments/", "/object/sign/issue-attachments/", "/object/authenticated/issue-attachments/"];

export function issueAttachmentPath(url: string): string | null {
  for (const marker of ATTACHMENT_URL_MARKERS) {
    const index = url.indexOf(marker);
    if (index >= 0) return url.slice(index + marker.length).split("?")[0].split("#")[0];
  }
  return null;
}

export async function signIssueAttachmentUrl(url: string, expiresIn = ATTACHMENT_SIGNED_URL_TTL): Promise<string> {
  const path = issueAttachmentPath(url);
  if (!path) return url;
  const { data, error } = await supabase.storage.from(ISSUE_ATTACHMENTS_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return url;
  return data.signedUrl;
}

export async function signIssueAttachmentUrls(urls: string[], expiresIn = ATTACHMENT_SIGNED_URL_TTL): Promise<string[]> {
  return Promise.all(urls.map((url) => signIssueAttachmentUrl(url, expiresIn)));
}

export async function uploadIssueAttachments(issueId: string, files: File[]): Promise<UploadedAttachment[]> {
  for (const file of files) {
    if (!isAllowedAttachmentFile(file)) throw new Error(`${file.name}: ${ATTACHMENT_TYPE_ERROR}`);
  }
  if (files.length === 0) return [];
  const session = await ensureSession();
  if (!session) throw new Error("Could not start a session for the upload. Please try again.");
  const uploads: UploadedAttachment[] = [];
  for (const file of files) {
    const created = await invokeOrThrow<{ path: string; token: string }>("create-upload-url", {
      issue_id: issueId,
      filename: file.name,
      content_type: file.type || EXTENSION_MIME[attachmentExtension(file.name)] || "application/octet-stream",
      size: file.size,
    });
    const { error: uploadError } = await supabase.storage.from(ISSUE_ATTACHMENTS_BUCKET).uploadToSignedUrl(created.path, created.token, file);
    if (uploadError) throw friendlyAttachmentError(file.name, uploadError.message);
    const { data: publicUrl } = supabase.storage.from(ISSUE_ATTACHMENTS_BUCKET).getPublicUrl(created.path);
    uploads.push({ path: created.path, url: publicUrl.publicUrl });
  }
  return uploads;
}
