import { useMemo, useState } from "react";
import type { Issue } from "../types";
import AttachmentGallery from "./AttachmentGallery";
import MarkdownText from "./MarkdownText";
import IssueEditForm from "./IssueEditForm";
import { deleteIssue, updateIssueContent } from "../lib/data";
import { loadPendingIssues, removePendingIssue, updatePendingIssue } from "../lib/pendingIssues";
import { uploadIssueAttachments } from "../lib/issueAttachments";
import ConfirmDialog from "./ConfirmDialog";
import { formatDateTime } from "../lib/formatDate";

interface Props {
  issues: Issue[];
  isAdmin: boolean;
  onStatusChange: (id: string, status: "open" | "closed") => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onEdit?: (id: string) => Promise<void>;
}

export default function IssueList({ issues, isAdmin, onStatusChange, onDelete, onEdit }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingLocal, setEditingLocal] = useState<Issue | null>(null);
  const [deletingLocal, setDeletingLocal] = useState<Issue | null>(null);
  const [editingAdmin, setEditingAdmin] = useState<Issue | null>(null);
  const [deletingAdmin, setDeletingAdmin] = useState<Issue | null>(null);
  const pendingIds = useMemo(() => new Set(loadPendingIssues().map((item) => item.id)), [issues, editingLocal, deletingLocal]);
  const sortedIssues = useMemo(() => [...issues].sort((a, b) => (a.status === b.status ? 0 : a.status === "closed" ? 1 : -1)), [issues]);
  if (issues.length === 0) {
    return <p className="empty-state">No issues reported for this mod yet.</p>;
  }
  return (
    <><ul className="issue-list">
      {sortedIssues.map((issue) => {
        const isExpanded = expanded.has(issue.id);
        const isLocal = pendingIds.has(issue.id);
        const hasDetails = Boolean(issue.description?.trim()) || (issue.attachment_urls?.length ?? 0) > 0;
        return (
        <li id={`issue-${issue.id}`} key={issue.id} className={`issue-row ${issue.status === "closed" ? "issue-row-closed" : ""}`}>
          <div className="issue-row-content">
            <div className="issue-row-head">
              <span className={`type-badge ${issue.type === "bug" ? "type-bug" : "type-feature"}`}>{issue.type === "bug" ? "Bug" : "Feature"}</span>
              <span className="issue-row-title">{issue.title}{issue.moderation_status === "pending" && <span className="pending-label">pending moderation</span>}</span>{issue.status === "closed" && hasDetails && <button className="btn btn-sm issue-action-btn issue-details-toggle" onClick={() => setExpanded((items) => { const next = new Set(items); isExpanded ? next.delete(issue.id) : next.add(issue.id); return next; })}>{isExpanded ? "Hide details" : "Show details"}</button>}
            </div>
            {(issue.status === "open" || isExpanded) && issue.description && <div className="issue-row-desc"><MarkdownText text={issue.description} issues={issues} /></div>}
            {(issue.status === "open" || isExpanded) && issue.attachment_urls?.length > 0 && <AttachmentGallery urls={issue.attachment_urls} />}
            <div className="issue-row-meta">
              <span>by {issue.author_name}</span>
              <span>{formatDateTime(issue.created_at)}</span>
              {issue.status === "closed" && <span>closed</span>}
              {(isAdmin || isLocal) && (
                <div className="issue-actions">
                  {isLocal && <>
                    <button className="btn btn-sm issue-action-btn" onClick={() => setEditingLocal(issue)}>Edit</button>
                    <button className="btn btn-sm issue-delete-btn" onClick={() => setDeletingLocal(issue)}>Delete</button></>}
                  {isAdmin && !isLocal && <button className="btn btn-sm issue-action-btn" onClick={() => setEditingAdmin(issue)}>Edit</button>}
                  {isAdmin && issue.status === "open" && (
                    <button className="btn btn-sm issue-action-btn" onClick={() => onStatusChange(issue.id, "closed")}>Close</button>
                  )}
                  {isAdmin && issue.status === "closed" && (
                    <button className="btn btn-sm issue-action-btn" onClick={() => onStatusChange(issue.id, "open")}>Reopen</button>
                  )}
                  {isAdmin && onDelete && (
                    <button className="btn btn-sm issue-delete-btn" onClick={() => setDeletingAdmin(issue)}>Delete</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </li>
      )})}
    </ul>
    {deletingLocal && <ConfirmDialog title="Delete submission?" message="This pending submission will be permanently removed." onCancel={() => setDeletingLocal(null)} onConfirm={async () => { await deleteIssue(deletingLocal.id); removePendingIssue(deletingLocal.id); window.location.reload(); }} />}
    {editingLocal && <IssueEditForm issue={editingLocal} onSubmit={async (title, description, attachmentUrls, newAttachments) => { const urls = [...attachmentUrls, ...(await uploadIssueAttachments(newAttachments))]; updatePendingIssue(editingLocal.id, { title, description, attachment_urls: urls }); setEditingLocal(null); window.location.reload(); }} onCancel={() => setEditingLocal(null)} />}
    {deletingAdmin && <ConfirmDialog title="Delete issue?" message={`Delete "${deletingAdmin.title}" permanently?`} onCancel={() => setDeletingAdmin(null)} onConfirm={async () => { await onDelete?.(deletingAdmin.id); setDeletingAdmin(null); }} />}
    {editingAdmin && <IssueEditForm heading="Edit issue" issue={editingAdmin} onSubmit={async (title, description, attachmentUrls, newAttachments) => { await updateIssueContent(editingAdmin.id, title, description, attachmentUrls, newAttachments); setEditingAdmin(null); await onEdit?.(editingAdmin.id); }} onCancel={() => setEditingAdmin(null)} />}
    </>);
}
