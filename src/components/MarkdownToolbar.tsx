import type { ReactNode } from "react";
import { useCallback } from "react";
import { indentSelection, replaceSelection } from "../lib/markdownEditing";

interface Props {
  value: string;
  onChange: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onMention?: () => void;
}

export default function MarkdownToolbar({ value, onChange, textareaRef, onMention }: Props) {
  const updateSelection = useCallback((replacement: string, start: number, end: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(start, end);
    replaceSelection(textarea, replacement, onChange, value);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start, start + replacement.length);
    });
  }, [onChange, textareaRef, value]);

  const wrapSelection = (before: string, after: string, placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    const wrapped = selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length;
    const replacement = wrapped ? selected.slice(before.length, -after.length) : `${before}${selected}${after}`;
    updateSelection(replacement, start, end);
    requestAnimationFrame(() => {
      const current = textareaRef.current;
      if (!current) return;
      const cursorStart = start + (wrapped ? 0 : before.length);
      current.setSelectionRange(cursorStart, cursorStart + (wrapped ? replacement.length : selected.length));
    });
  };

  const toggleBulletList = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = value.lastIndexOf("\n", textarea.selectionStart - 1) + 1;
    const selectedEnd = textarea.selectionEnd;
    const nextBreak = value.indexOf("\n", selectedEnd);
    const end = nextBreak === -1 ? value.length : nextBreak;
    const selected = value.slice(start, end) || "list item";
    const lines = selected.split("\n");
    const bulleted = lines.filter((line) => line.trim()).every((line) => /^\s*[-*+]\s+/.test(line));
    const replacement = lines.map((line) => {
      if (!line.trim()) return line;
      return bulleted ? line.replace(/^(\s*)[-*+]\s+/, "$1") : line.replace(/^(\s*)/, "$1- ");
    }).join("\n");
    updateSelection(replacement, start, end);
  };

  const insertTab = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const edit = indentSelection(value, textarea.selectionStart, textarea.selectionEnd);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    textarea.focus();
    textarea.setSelectionRange(lineStart, end);
    replaceSelection(textarea, edit.replacement ?? "\t", onChange, value);
    requestAnimationFrame(() => {
      const current = textareaRef.current;
      if (!current) return;
      current.focus();
      current.setSelectionRange(edit.start, edit.end);
    });
  };

  const insertLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || "link text";
    const url = window.prompt("Enter URL", "https://");
    if (!url) return;
    updateSelection(`[${selected}](${url})`, start, end);
    requestAnimationFrame(() => {
      const current = textareaRef.current;
      if (current) current.setSelectionRange(start + 1, start + 1 + selected.length);
    });
  };

  const button = (icon: ReactNode, title: string, onClick: () => void) => (
    <button type="button" className="md-toolbar-btn" title={title} aria-label={title} onMouseDown={(event) => event.preventDefault()} onClick={onClick}>{icon}</button>
  );

  return <div className="md-toolbar" role="toolbar" aria-label="Format text">
    {button(<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5 2.5h4.1c1.6 0 2.9 1 2.9 2.5 0 1-.6 1.9-1.5 2.2 1 .3 1.7 1.2 1.7 2.4 0 1.6-1.4 2.9-3 2.9H5V2.5zm1.8 1.8v2.5h2.1c.9 0 1.5-.5 1.5-1.2s-.6-1.3-1.5-1.3H6.8zm0 4.3v2.7h2.3c.9 0 1.6-.6 1.6-1.3s-.7-1.4-1.6-1.4H6.8z" /></svg>, "Bold (Ctrl+B)", () => wrapSelection("**", "**", "text"))}
    {button(<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6.5 2.5h6M4.5 13.5h6M9.2 2.5l-3.4 11" /></svg>, "Italic (Ctrl+I)", () => wrapSelection("*", "*", "text"))}
    {button(<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M6 4.5h8M6 8h8M6 11.5h8" /><circle cx="2.8" cy="4.5" r="1.1" fill="currentColor" stroke="none" /><circle cx="2.8" cy="8" r="1.1" fill="currentColor" stroke="none" /><circle cx="2.8" cy="11.5" r="1.1" fill="currentColor" stroke="none" /></svg>, "Bullet list", toggleBulletList)}
    {button(<span aria-hidden="true">↹</span>, "Insert tab", insertTab)}
    {button(<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.8 8S4 4.6 8 4.6 14.2 8 14.2 8 12 11.4 8 11.4 1.8 8 1.8 8z" /><circle cx="8" cy="8" r="1.7" /></svg>, "Spoiler", () => wrapSelection("||", "||", "spoiler"))}
    {button(<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6.8 9.2a3.3 3.3 0 0 0 4.7 0l1.9-1.9a3.32 3.32 0 0 0-4.7-4.7l-1 1" /><path d="M9.2 6.8a3.3 3.3 0 0 0-4.7 0L2.6 8.7a3.32 3.32 0 0 0 4.7 4.7l1-1" /></svg>, "Link (Ctrl+L)", insertLink)}
    {onMention && button(<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M6.2 2.5L4.2 13.5M11.8 2.5l-2 11M3 6h10.6M2.4 10h10.6" /></svg>, "Mention an issue", onMention)}
  </div>;
}
