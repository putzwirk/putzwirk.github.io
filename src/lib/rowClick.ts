import type { MouseEvent } from "react";

const ROW_CLICK_IGNORE = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "summary",
  "label",
  "[role='button']",
  "[contenteditable='true']",
  ".issue-comments",
  ".issue-attachments",
  ".issue-reference-preview",
  ".attachment-lightbox",
].join(",");

export function isPlainRowClick(event: MouseEvent<HTMLElement>): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const target = event.target as Element | null;
  if (!target || target.closest(ROW_CLICK_IGNORE)) return false;
  return !window.getSelection()?.toString();
}
