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
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 1, start + 1 + selected.length);
    });
    return true;
  }
  const marker = key === "b" ? "**" : "*";
  const inner = value.slice(start, end);
  const innerWrapped = inner.length >= marker.length * 2 && inner.startsWith(marker) && inner.endsWith(marker);
  const outerWrapped = value.slice(start - marker.length, start) === marker && value.slice(end, end + marker.length) === marker;
  if (innerWrapped) {
    const replacement = inner.slice(marker.length, -marker.length);
    replaceSelection(textarea, replacement, onChange, value);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + replacement.length);
    });
    return true;
  }
  if (outerWrapped) {
    const removalStart = start - marker.length;
    const nextValue = `${value.slice(0, removalStart)}${inner}${value.slice(end + marker.length)}`;
    onChange(nextValue);
    recordEdit(textarea, value);
    textarea.focus();
    requestAnimationFrame(() => {
      textarea.setSelectionRange(removalStart, removalStart + inner.length);
    });
    return true;
  }
  const replacement = `${marker}${selected}${marker}`;
  replaceSelection(textarea, replacement, onChange, value);
  const selectStart = start + marker.length;
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(selectStart, selectStart + selected.length);
  });
  return true;
}
