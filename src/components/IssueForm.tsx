import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { accountDisplayName } from "../lib/session";
import type { Issue, Mod } from "../types";
import { ATTACHMENT_ACCEPT, ATTACHMENT_TYPE_ERROR, MAX_ATTACHMENTS, MAX_ATTACHMENT_SIZE, MAX_ATTACHMENT_TOTAL, isAllowedAttachmentFile, isVideoAttachmentUrl } from "../lib/issueAttachments";
import { handleMarkdownShortcut, indentTextarea, undoMarkdownEdit } from "../lib/markdownEditing";
import { buildMentionReferences, type MentionReference } from "../lib/mentionReferences";
import MarkdownToolbar from "./MarkdownToolbar";

interface Props {
  initialType: "bug" | "idea";
  allowTypeChoice?: boolean;
  onSubmit: (title: string, description: string, author: string, type: "bug" | "idea", attachments: File[]) => Promise<void>;
  referenceIssues?: Issue[];
  referenceMods?: Mod[];
}

const LABELS = {
  bug: {
    title: "What's broken",
    titlePlaceholder: "What's broken?",
    descriptionPlaceholder: "Steps to reproduce, what you expected, what happened",
    submit: "Submit Issue",
  },
  idea: {
    title: "Suggest feature description",
    titlePlaceholder: "What would you like to see?",
    descriptionPlaceholder: "Describe the mod you'd like to see in more detail",
    submit: "Submit Idea",
  },
};

export default function IssueForm({ initialType, allowTypeChoice, onSubmit, referenceIssues = [], referenceMods = [] }: Props) {
  const { session } = useAuth();
  const accountName = accountDisplayName(session);
  const [category, setCategory] = useState<"bug" | "idea">(initialType);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [referenceActive, setReferenceActive] = useState(false);
  const editedAuthorRef = useRef(false);
  const [author, setAuthor] = useState(accountName);
  const [attachments, setAttachments] = useState<File[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [draggedAttachment, setDraggedAttachment] = useState<number | null>(null);
  const [dragOverAttachment, setDragOverAttachment] = useState<number | null>(null);
  const [dropAfter, setDropAfter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const descriptionWrapRef = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!accountName || editedAuthorRef.current) return;
    setAuthor(accountName);
  }, [accountName]);

  const labels = LABELS[category];
  const [descriptionCursor, setDescriptionCursor] = useState<number | null>(null);
  const referenceQuery = (descriptionCursor === null ? description : description.slice(0, descriptionCursor)).match(/\[\[([^\]]*)$/)?.[1] ?? null;
  const [attachmentPreviews, setAttachmentPreviews] = useState<Array<{ file: File; url: string }>>([]);
  useEffect(() => {
    const next = attachments.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setAttachmentPreviews(next);
    return () => {
      next.forEach(({ url }) => URL.revokeObjectURL(url));
    };
  }, [attachments]);
  const mentionReferences = useMemo(() => buildMentionReferences(referenceMods, referenceIssues), [referenceMods, referenceIssues]);
  const referenceOptions = useMemo(() => {
    const query = (referenceQuery ?? "").toLowerCase();
    return mentionReferences.filter((reference) => reference.title.toLowerCase().includes(query) || reference.detail.toLowerCase().includes(query) || reference.kindLabel.toLowerCase().startsWith(query)).slice(0, 30);
  }, [mentionReferences, referenceQuery]);
  const pickerVisible = referenceActive && referenceQuery !== null && referenceOptions.length > 0;
  useEffect(() => {
    if (!pickerVisible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onPointerDown = (event: PointerEvent) => {
      if (descriptionWrapRef.current && !descriptionWrapRef.current.contains(event.target as Node)) setReferenceActive(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReferenceActive(false);
        descriptionRef.current?.blur();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerVisible]);

  const insertReference = (reference: MentionReference) => {
    const cursor = descriptionCursor ?? description.length;
    const markerStart = description.slice(0, cursor).lastIndexOf("[[");
    if (markerStart < 0) return;
    const replacement = `[[${reference.id}]] `;
    setDescription(`${description.slice(0, markerStart)}${replacement}${description.slice(cursor)}`);
    setDescriptionCursor(markerStart + replacement.length);
    setReferenceActive(false);
    requestAnimationFrame(() => {
      descriptionRef.current?.focus();
      descriptionRef.current?.setSelectionRange(markerStart + replacement.length, markerStart + replacement.length);
    });
  };

  const insertTab = () => {
    const textarea = descriptionRef.current;
    if (!textarea) return;
    const edit = indentTextarea(textarea, description, setDescription);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(edit.start, edit.end);
      setDescriptionCursor(edit.end);
    });
  };

  const insertMentionTrigger = () => {
    const textarea = descriptionRef.current;
    const start = textarea?.selectionStart ?? description.length;
    const end = textarea?.selectionEnd ?? description.length;
    setDescription(`${description.slice(0, start)}[[${description.slice(end)}`);
    setDescriptionCursor(start + 2);
    setReferenceActive(true);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + 2, start + 2);
    });
  };

  const handleAttachments = (files: File[]) => {
    const selected = [...attachments, ...files];
    if (selected.length > MAX_ATTACHMENTS) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} images.`);
      return;
    }
    if (selected.some((file) => !isAllowedAttachmentFile(file))) {
      setError(ATTACHMENT_TYPE_ERROR);
      return;
    }
    if (selected.some((file) => file.size > MAX_ATTACHMENT_SIZE)) {
      setError("Each attachment must be 2 MB or smaller.");
      return;
    }
    if (selected.reduce((total, file) => total + file.size, 0) > MAX_ATTACHMENT_TOTAL) {
      setError("Attachments must total 10 MB or less.");
      return;
    }
    setError(null);
    setAttachments(selected);
  };

  const reorderAttachments = (insertionIndex: number) => { if (draggedAttachment === null) return; setAttachments((items) => { const next = [...items]; const [moved] = next.splice(draggedAttachment, 1); const targetIndex = draggedAttachment < insertionIndex ? insertionIndex - 1 : insertionIndex; next.splice(targetIndex, 0, moved); return next; }); setDraggedAttachment(null); setDragOverAttachment(null); setDropAfter(false); };

  const handleMarkdownHotkey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (undoMarkdownEdit(e, e.currentTarget, setDescription)) return;
    if (e.key === "Tab") {
      e.preventDefault();
      insertTab();
      return;
    }
    handleMarkdownShortcut(e, description, e.currentTarget, setDescription);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await onSubmit(title, description, author || "Anonymous", category, attachments);
      setTitle("");
      setDescription("");
      setAuthor(accountName);
      setAttachments([]);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
    setSubmitting(false);
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      {allowTypeChoice && (
        <div className="form-group">
          <label>What are you submitting?</label>
          <div className="type-choice">
            <button
              type="button"
              className={`type-choice-btn choice-bug ${category === "bug" ? "active" : ""}`}
              onClick={() => setCategory("bug")}
            >
              Bug
            </button>
            <button
              type="button"
              className={`type-choice-btn choice-feature ${category === "idea" ? "active" : ""}`}
              onClick={() => setCategory("idea")}
            >
              Idea
            </button>
          </div>
        </div>
      )}
      <div className="form-group">
        <label>{labels.title}</label>
        <input
          className="form-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={80}
          placeholder={labels.titlePlaceholder}
        />
      </div>
      <div className="form-group" ref={descriptionWrapRef}>
        <div className="description-head">
          <label>Description (optional)</label>
          <MarkdownToolbar value={description} onChange={setDescription} textareaRef={descriptionRef} onMention={insertMentionTrigger} />
        </div>
        <textarea
          ref={descriptionRef}
          className="form-textarea"
          onFocus={() => setReferenceActive(true)}
          onBlur={() => setReferenceActive(false)}
          value={description}
          onSelect={(e) => setDescriptionCursor(e.currentTarget.selectionStart)}
          onChange={(e) => { setDescription(e.target.value); setDescriptionCursor(e.target.selectionStart); }}
          onKeyDown={handleMarkdownHotkey}
          maxLength={2000}
          placeholder={labels.descriptionPlaceholder}
        />
        {pickerVisible && <div className="reference-picker issue-reference-picker">{referenceOptions.map((reference) => <button type="button" className="reference-picker-item" key={reference.id} onMouseDown={(event) => event.preventDefault()} onClick={() => insertReference(reference)}>{reference.kind !== "mod" && <span className="reference-picker-mod">{reference.detail}</span>}<span className={`reference-picker-kind reference-picker-kind-kind-${reference.kind}`}>{reference.kindLabel}</span><span className="reference-picker-title">{reference.title}</span></button>)}</div>}
      </div>
      <div className="form-group">
        <label>Attachments (optional)</label>
        <input ref={attachmentInputRef} className="form-input" type="file" accept={ATTACHMENT_ACCEPT} multiple onChange={(e) => handleAttachments(Array.from(e.target.files ?? []))} />
        {attachments.length > 0 && <div className="attachment-edit-grid" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (dragOverAttachment !== null) reorderAttachments(dragOverAttachment + (dropAfter ? 1 : 0)); }}>{attachmentPreviews.map(({ file, url }, index) => <div className={`attachment-edit-thumb ${dragOverAttachment === index || dragOverAttachment === index + 1 ? "attachment-drop-target" : ""} ${dragOverAttachment === index + 1 ? "attachment-drop-after" : ""}`} key={`${file.name}-${index}`} data-attachment-index={index} draggable={!window.matchMedia("(pointer: coarse)").matches} onDragStart={() => setDraggedAttachment(index)} onDragOver={(event) => { event.preventDefault(); const after = event.clientX > event.currentTarget.getBoundingClientRect().left + event.currentTarget.offsetWidth / 2; setDragOverAttachment(index + (after ? 1 : 0)); setDropAfter(after); }} onDragEnd={() => { if (dragOverAttachment !== null) reorderAttachments(dragOverAttachment); else { setDraggedAttachment(null); setDropAfter(false); } }} onTouchStart={() => setDraggedAttachment(index)} onTouchMove={(event) => { const touch = event.touches[0]; const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest<HTMLElement>("[data-attachment-index]"); if (!target) { setDragOverAttachment(attachments.length); return; } const targetIndex = Number(target.dataset.attachmentIndex); const after = touch.clientX > target.getBoundingClientRect().left + target.offsetWidth / 2; setDragOverAttachment(targetIndex + (after ? 1 : 0)); setDropAfter(after); }} onTouchEnd={() => { if (dragOverAttachment !== null) reorderAttachments(dragOverAttachment); }}>{isVideoAttachmentUrl(file.name) ? <video src={url} preload="metadata" aria-label={file.name} /> : <img src={url} alt={file.name} />}<button type="button" onClick={() => { setAttachments((items) => items.filter((_item, itemIndex) => itemIndex !== index)); if (attachmentInputRef.current) attachmentInputRef.current.value = ""; }} aria-label={`Remove ${file.name}`}>×</button></div>)}</div>}
        {attachments.length > 0 && <small>{attachments.length} file{attachments.length === 1 ? "" : "s"} selected (images, GIFs, videos) · 2 MB each, 10 MB total maximum</small>}
      </div>
      <div className="form-group">
        <label>Your Name (optional)</label>
        <input
          className="form-input"
          value={author}
          onChange={(e) => { editedAuthorRef.current = true; setAuthor(e.target.value); }}
          maxLength={40}
          placeholder="Anonymous"
        />
      </div>
      {error && <p className="form-error">{error}</p>}
      {success && <p className="form-success">Submitted! Thank you.</p>}
      <div className="form-actions">
        <button className="btn btn-accent" type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : labels.submit}
        </button>
      </div>
    </form>
  );
}
