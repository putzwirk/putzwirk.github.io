import { useEffect, useRef, useState } from "react";
import type { Issue } from "../types";
import { ATTACHMENT_ACCEPT, ATTACHMENT_TYPE_ERROR, MAX_ATTACHMENTS, MAX_ATTACHMENT_SIZE, MAX_ATTACHMENT_TOTAL, isAllowedAttachmentFile, isVideoAttachmentUrl, signIssueAttachmentUrls } from "../lib/issueAttachments";
import { handleMarkdownShortcut, indentTextarea, undoMarkdownEdit } from "../lib/markdownEditing";
import MarkdownToolbar from "./MarkdownToolbar";

type Attachment = { key: string; url?: string; previewUrl?: string; file?: File };

export default function IssueEditForm({ issue, onSubmit, onCancel, heading = "Edit submission" }: { issue: Issue; onSubmit: (title: string, description: string, attachmentUrls: string[], newAttachments: File[]) => Promise<void>; onCancel: () => void; heading?: string }) {
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>((issue.attachment_urls ?? []).map((url, index) => ({ key: `existing-${index}-${url}`, url })));
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const existingUrls = issue.attachment_urls ?? [];
    signIssueAttachmentUrls(existingUrls)
      .then((signed) => { if (active) setAttachments((items) => items.map((item) => item.url ? { ...item, previewUrl: signed[existingUrls.indexOf(item.url!)] ?? item.url } : item)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [issue.id]);

  const moveAttachment = (index: number) => {
    if (draggedKey === null || dropIndex === null) return;
    const from = attachments.findIndex((item) => item.key === draggedKey);
    if (from < 0) return;
    const next = [...attachments];
    const [moved] = next.splice(from, 1);
    const target = from < index ? index - 1 : index;
    next.splice(Math.max(0, Math.min(next.length, target)), 0, moved);
    setAttachments(next);
    setDraggedKey(null);
    setDropIndex(null);
  };

  const updateDropIndex = (event: React.DragEvent | React.TouchEvent) => {
    const point = "touches" in event ? event.touches[0] : event;
    const target = document.elementFromPoint(point.clientX, point.clientY)?.closest<HTMLElement>("[data-attachment-index]");
    if (!target) { setDropIndex(attachments.length); return; }
    const index = Number(target.dataset.attachmentIndex);
    const after = point.clientX > target.getBoundingClientRect().left + target.offsetWidth / 2;
    setDropIndex(index + (after ? 1 : 0));
  };

  const finishDrop = () => moveAttachment(dropIndex ?? attachments.length);

  return <div className="issue-edit-modal" onClick={onCancel}><form className="panel" onClick={(event) => event.stopPropagation()} onSubmit={async (event) => { event.preventDefault(); await onSubmit(title, description, attachments.filter((item) => item.url).map((item) => item.url!), attachments.filter((item) => item.file).map((item) => item.file!)); }}><h2>{heading}</h2><label>Title<input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required /></label><div className="form-group"><div className="description-head"><label>Description</label><MarkdownToolbar value={description} onChange={setDescription} textareaRef={descriptionRef} /></div><textarea ref={descriptionRef} className="form-textarea" value={description} onChange={(event) => setDescription(event.target.value)} onKeyDown={(event) => { if (undoMarkdownEdit(event, event.currentTarget, setDescription)) return; if (event.key === "Tab") { event.preventDefault(); const edit = indentTextarea(event.currentTarget, description, setDescription); requestAnimationFrame(() => { descriptionRef.current?.focus(); descriptionRef.current?.setSelectionRange(edit.start, edit.end); }); return; } handleMarkdownShortcut(event, description, event.currentTarget, setDescription); }} maxLength={2000} /></div><label>Attachments<input className="form-input" type="file" accept={ATTACHMENT_ACCEPT} multiple onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.some((file) => !isAllowedAttachmentFile(file))) { setError(ATTACHMENT_TYPE_ERROR); event.currentTarget.value = ""; return; } const totalBytes = attachments.reduce((sum, item) => sum + (item.file?.size ?? 0), 0); if (attachments.length + files.length > MAX_ATTACHMENTS) { setError(`A maximum of ${MAX_ATTACHMENTS} attachments is allowed.`); event.currentTarget.value = ""; return; } if (files.some((file) => file.size > MAX_ATTACHMENT_SIZE)) { setError("Each attachment must be 2 MB or smaller."); event.currentTarget.value = ""; return; } if (totalBytes + files.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHMENT_TOTAL) { setError("Attachments must total 10 MB or less."); event.currentTarget.value = ""; return; } setError(null); setAttachments((items) => [...items, ...files.map((file, index) => ({ key: `new-${Date.now()}-${index}-${file.name}`, file, url: URL.createObjectURL(file) }))]); event.currentTarget.value = ""; }} /></label><div className="attachment-edit-grid" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); finishDrop(); }}>{attachments.map((attachment, index) => <div className={`attachment-edit-thumb ${dropIndex === index ? "attachment-drop-target" : ""} ${dropIndex === index + 1 ? "attachment-drop-after attachment-drop-target" : ""}`} data-attachment-index={index} key={attachment.key} draggable onDragStart={() => setDraggedKey(attachment.key)} onDragOver={updateDropIndex} onDragEnd={finishDrop} onTouchStart={() => setDraggedKey(attachment.key)} onTouchMove={updateDropIndex} onTouchEnd={finishDrop}>{attachment.url && isVideoAttachmentUrl(attachment.previewUrl ?? attachment.url) ? <video src={attachment.previewUrl ?? attachment.url} preload="metadata" aria-label="Video attachment" /> : <img src={attachment.previewUrl ?? attachment.url} alt="Attachment" />}<button type="button" onClick={() => { setError(null); setAttachments((items) => items.filter((item) => item.key !== attachment.key)); }} aria-label="Remove attachment">×</button></div>)}</div><div className={`form-error ${error ? "" : "form-error-hidden"}`}>{error || " "}</div><div className="form-actions"><button type="button" className="btn" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-accent" disabled={Boolean(error)}>Save</button></div></form></div>;
}
