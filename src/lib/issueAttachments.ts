import { supabase, ISSUE_ATTACHMENTS_BUCKET } from "./supabase";

export const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;
export const MAX_ATTACHMENT_TOTAL = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
export const ATTACHMENT_ACCEPT = "image/*,video/*";
export const ATTACHMENT_TYPE_ERROR = "Only images, GIFs and videos can be attached (PNG, JPG, GIF, WEBP, MP4, WEBM, MOV).";
const ATTACHMENT_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "apng", "mp4", "webm", "ogg", "ogv", "mov", "avi", "mkv"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogg", "ogv", "mov", "avi", "mkv"]);

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

export async function uploadIssueAttachments(files: File[]): Promise<string[]> {
  for (const file of files) {
    if (!isAllowedAttachmentFile(file)) throw new Error(`${file.name}: ${ATTACHMENT_TYPE_ERROR}`);
  }
  const urls: string[] = [];
  for (const file of files) {
    const genericType = file.type === "" || file.type.toLowerCase() === "application/octet-stream";
    const guessed = EXTENSION_MIME[attachmentExtension(file.name)] ?? "application/octet-stream";
    const payload = genericType && guessed !== "application/octet-stream" ? new File([file], file.name, { type: guessed }) : file;
    const path = `${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from(ISSUE_ATTACHMENTS_BUCKET).upload(path, payload, { contentType: payload.type || guessed });
    if (error) throw friendlyAttachmentError(file.name, error.message);
    urls.push(supabase.storage.from(ISSUE_ATTACHMENTS_BUCKET).getPublicUrl(path).data.publicUrl);
  }
  return urls;
}
