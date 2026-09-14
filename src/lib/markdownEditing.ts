export interface TextSelectionEdit {
  value: string;
  start: number;
  end: number;
  replacement?: string;
}

export function indentSelection(value: string, start: number, end: number): TextSelectionEdit {
  if (start === end) return { value: `${value.slice(0, start)}\t${value.slice(end)}`, start: start + 1, end: end + 1, replacement: "\t" };
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const selected = value.slice(lineStart, lineEnd);
  const lines = selected.split("\n");
  const replacement = lines.map((line) => `\t${line}`).join("\n");
  return {
    value: `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
    start: start + 1,
    end: end + lines.length,
    replacement,
  };
}

export function indentTextarea(textarea: HTMLTextAreaElement, value: string, onChange: (value: string) => void) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const edit = indentSelection(value, start, end);
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  textarea.focus();
  textarea.setSelectionRange(lineStart, end);
  replaceSelection(textarea, edit.replacement ?? "\t", onChange, value);
  return edit;
}

interface MarkdownHistoryEntry {
  value: string;
  start: number;
  end: number;
}

const markdownHistory = new WeakMap<HTMLTextAreaElement, { past: MarkdownHistoryEntry[]; future: MarkdownHistoryEntry[] }>();

function recordEdit(textarea: HTMLTextAreaElement, value: string) {
  const history = markdownHistory.get(textarea) ?? { past: [], future: [] };
  history.past.push({ value, start: textarea.selectionStart, end: textarea.selectionEnd });
  history.future = [];
  markdownHistory.set(textarea, history);
}

export function undoMarkdownEdit(event: React.KeyboardEvent<HTMLTextAreaElement>, textarea: HTMLTextAreaElement, onChange: (value: string) => void): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return false;
  const history = markdownHistory.get(textarea);
  if (!history?.past.length) return false;
  event.preventDefault();
  const current = { value: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd };
  const previous = history.past.pop()!;
  history.future.push(current);
  onChange(previous.value);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(previous.start, previous.end);
  });
  return true;
}

export function replaceSelection(textarea: HTMLTextAreaElement, replacement: string, onChange: (value: string) => void, fallbackValue: string) {
  recordEdit(textarea, fallbackValue);
  textarea.focus();
  const changed = document.execCommand("insertText", false, replacement);
  if (!changed) onChange(`${fallbackValue.slice(0, textarea.selectionStart)}${replacement}${fallbackValue.slice(textarea.selectionEnd)}`);
}

export function handleMarkdownShortcut(event: React.KeyboardEvent<HTMLTextAreaElement>, value: string, textarea: HTMLTextAreaElement, onChange: (value: string) => void): boolean {
  if (!event.ctrlKey && !event.metaKey) return false;
  const key = event.key.toLowerCase();
  if (key === "z" || key === "y") return false;
  if (key !== "b" && key !== "i" && key !== "l") return false;
  event.preventDefault();
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end) || (key === "l" ? "link text" : "text");
  if (key === "l") {
    const url = window.prompt("Enter URL", "https://");
    if (!url) return true;
    replaceSelection(textarea, `[${selected}](${url})`, onChange, value);
    return true;
  }
  const marker = key === "b" ? "**" : "*";
  const wrapped = value.slice(start, end).startsWith(marker) && value.slice(start, end).endsWith(marker);
  replaceSelection(textarea, wrapped ? selected.slice(marker.length, -marker.length) : `${marker}${selected}${marker}`, onChange, value);
  return true;
}
