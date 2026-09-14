import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { Issue, Mod } from "../types";
import AttachmentGallery from "./AttachmentGallery";
import ConfirmDialog from "./ConfirmDialog";
import { formatDateTime } from "../lib/formatDate";

export default function MarkdownText({ text, issues = [], mods = [] }: { text: string; issues?: Issue[]; mods?: Mod[] }) {
  const [hovered, setHovered] = useState<{ issue: Issue; left: number; top: number } | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const previewRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const issueMap = new Map(issues.map((issue) => [issue.id, issue]));
  const modMap = new Map(mods.map((mod) => [mod.id, mod]));
  const withReferences = text.replace(/\[\[([^\]]+)\]\]/g, (_match, id: string) => {
    const issue = issueMap.get(id);
    const mod = modMap.get(id);
    return issue ? `<span class="issue-reference issue-reference-${issue.type === "bug" ? "bug" : "idea"}" role="button" tabindex="0" data-issue-id="${issue.id}">${issue.title} / by ${issue.author_name}</span>` : mod ? `<a class="mod-reference" href="/lucidblocks/mods/${mod.id}">${mod.name}</a>` : _match;
  });
  const source = withReferences.split(/(```[\s\S]*?```|`[^`\n]*?`)/g).map((segment, index) => {
    if (index % 2 === 1) return segment;
    return segment.replace(/\|\|([^|\n]+?)\|\|/g, (_match, inner: string) => {
      const innerHtml = marked.parseInline(inner, { breaks: true, gfm: true, async: false }) as string;
      return `<span class="spoiler" role="button" tabindex="0" title="Spoiler — click to reveal">${innerHtml}</span>`;
    });
  }).join("");
  const html = DOMPurify.sanitize(marked.parse(source, { breaks: true, gfm: true, async: false }) as string, { ADD_ATTR: ["data-issue-id", "tabindex"] });
  const clearHoverTimer = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const scheduleIssuePreview = (target: HTMLElement) => {
    const id = target.dataset.issueId;
    const issue = id ? issueMap.get(id) : undefined;
    if (!issue) return;
    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => {
      const rect = target.getBoundingClientRect();
      const width = Math.min(672, window.innerWidth - 32);
      setHovered({ issue, left: Math.max(16, Math.min(window.innerWidth - width - 16, rect.left)), top: rect.bottom + 8 });
      setPreviewVisible(true);
    }, 500);
  };
  const hideIssuePreview = () => {
    clearHoverTimer();
    hideTimer.current = window.setTimeout(() => setPreviewVisible(false), 160);
  };
  useEffect(() => {
    if (!hovered) return;
    const onViewportChange = (event: Event) => {
      const target = event.target;
      if (previewRef.current && target instanceof Node && previewRef.current.contains(target)) return;
      clearHoverTimer();
      setPreviewVisible(false);
      setHovered(null);
    };
    window.addEventListener("scroll", onViewportChange, { capture: true, passive: true });
    window.addEventListener("resize", onViewportChange);
    return () => {
      window.removeEventListener("scroll", onViewportChange, { capture: true });
      window.removeEventListener("resize", onViewportChange);
    };
  }, [hovered]);
  const openIssue = (issue: Issue) => {
    clearHoverTimer();
    setPreviewVisible(false);
    setHovered(null);
    navigate(`/lucidblocks/issues/${issue.id}`, { state: { from: location.pathname } });
  };
  return <>
    <div className="markdown-text" onClick={(event) => {
      const spoiler = (event.target as HTMLElement).closest<HTMLElement>(".spoiler");
      if (spoiler) { spoiler.classList.toggle("revealed"); return; }
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (link) {
        if (link.href.startsWith(window.location.origin)) {
          const href = link.getAttribute("href") ?? "";
          if (href.startsWith("/lucidblocks/")) {
            event.preventDefault();
            navigate(href, { state: { from: location.pathname } });
          }
          return;
        }
        event.preventDefault();
        setExternalUrl(link.href);
        return;
      }
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-issue-id]");
      if (target) {
        const issue = issueMap.get(target.dataset.issueId ?? "");
        if (issue) openIssue(issue);
      }
    }} onMouseOver={(event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-issue-id]");
      if (target) scheduleIssuePreview(target);
    }} onMouseOut={(event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-issue-id]");
      if (target && !target.contains(event.relatedTarget as Node | null)) hideIssuePreview();
    }} onFocus={(event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-issue-id]");
      if (target) scheduleIssuePreview(target);
    }} onBlur={(event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-issue-id]");
      if (target && !target.contains(event.relatedTarget as Node | null)) hideIssuePreview();
    }} onKeyDown={(event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const spoiler = (event.target as HTMLElement).closest<HTMLElement>(".spoiler");
      if (spoiler) { event.preventDefault(); spoiler.classList.toggle("revealed"); return; }
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-issue-id]");
      if (target) {
        const issue = issueMap.get(target.dataset.issueId ?? "");
        if (issue) { event.preventDefault(); openIssue(issue); }
      }
    }} dangerouslySetInnerHTML={{ __html: html }} />
    {externalUrl && <ConfirmDialog title="Visit external website?" message={externalUrl} onCancel={() => setExternalUrl(null)} onConfirm={() => { window.open(externalUrl, "_blank", "noopener,noreferrer"); setExternalUrl(null); }} />}
    {hovered && <article ref={previewRef} className={`issue-reference-preview ${previewVisible ? "visible" : ""}`} style={{ left: hovered.left, top: hovered.top }} onMouseEnter={clearHoverTimer} onMouseLeave={hideIssuePreview}><h3>{hovered.issue.title}</h3>{hovered.issue.description && <MarkdownText text={hovered.issue.description} issues={issues} />}{hovered.issue.attachment_urls?.length > 0 && <AttachmentGallery urls={hovered.issue.attachment_urls} />}<p className="issue-reference-author">by {hovered.issue.author_name} · {formatDateTime(hovered.issue.created_at)}</p></article>}
  </>;
}
