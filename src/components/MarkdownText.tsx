import { useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { Issue, Mod } from "../types";
import AttachmentGallery from "./AttachmentGallery";
import ConfirmDialog from "./ConfirmDialog";
import { formatDateTime } from "../lib/formatDate";

export default function MarkdownText({ text, issues = [], mods = [] }: { text: string; issues?: Issue[]; mods?: Mod[] }) {
  const [selected, setSelected] = useState<Issue | null>(null);
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const issueMap = new Map(issues.map((issue) => [issue.id, issue]));
  const modMap = new Map(mods.map((mod) => [mod.id, mod]));
  const withReferences = text.replace(/\[\[([^\]]+)\]\]/g, (_match, id: string) => {
    const issue = issueMap.get(id);
    const mod = modMap.get(id);
    return issue ? `<span class="issue-reference issue-reference-${issue.type === "bug" ? "bug" : "idea"}" data-issue-id="${issue.id}">${issue.title} / by ${issue.author_name}</span>` : mod ? `<a class="mod-reference" href="/lucidblocks/mods/${mod.id}">${mod.name}</a>` : _match;
  });
  const source = withReferences.split(/(```[\s\S]*?```|`[^`\n]*?`)/g).map((segment, index) => {
    if (index % 2 === 1) return segment;
    return segment.replace(/\|\|([^|\n]+?)\|\|/g, (_match, inner: string) => {
      const innerHtml = marked.parseInline(inner, { breaks: true, gfm: true, async: false }) as string;
      return `<span class="spoiler" role="button" tabindex="0" title="Spoiler — click to reveal">${innerHtml}</span>`;
    });
  }).join("");
  const html = DOMPurify.sanitize(marked.parse(source, { breaks: true, gfm: true, async: false }) as string, { ADD_ATTR: ["data-issue-id", "tabindex"] });
  return <>
    <div className="markdown-text" onClick={(event) => {
      const spoiler = (event.target as HTMLElement).closest<HTMLElement>(".spoiler");
      if (spoiler) { spoiler.classList.toggle("revealed"); return; }
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (link) { if (link.href.startsWith(window.location.origin)) return; event.preventDefault(); setExternalUrl(link.href); return; }
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-issue-id]");
      if (target) setSelected(issueMap.get(target.dataset.issueId ?? "") ?? null);
    }} onKeyDown={(event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const spoiler = (event.target as HTMLElement).closest<HTMLElement>(".spoiler");
      if (spoiler) { event.preventDefault(); spoiler.classList.toggle("revealed"); }
    }} dangerouslySetInnerHTML={{ __html: html }} />
    {externalUrl && <ConfirmDialog title="Visit external website?" message={externalUrl} onCancel={() => setExternalUrl(null)} onConfirm={() => { window.open(externalUrl, "_blank", "noopener,noreferrer"); setExternalUrl(null); }} />}
    {selected && <div className="issue-reference-popup" onClick={() => setSelected(null)}><article onClick={(event) => event.stopPropagation()}><button type="button" className="issue-reference-popup-close" onClick={() => setSelected(null)}>×</button><h3>{selected.title}</h3><p className="issue-reference-author">by {selected.author_name} · {formatDateTime(selected.created_at)}</p><MarkdownText text={selected.description} issues={issues} />{selected.attachment_urls?.length > 0 && <AttachmentGallery urls={selected.attachment_urls} />}</article></div>}
  </>;
}
