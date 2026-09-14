import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Issue } from "../types";
import AttachmentGallery from "./AttachmentGallery";
import MarkdownText from "./MarkdownText";
import IssueEditForm from "./IssueEditForm";
import IssueStateBadge from "./IssueStateBadge";
import { softDeleteIssue, updateIssueContent } from "../lib/data";
import { isPlainRowClick } from "../lib/rowClick";
import ConfirmDialog from "./ConfirmDialog";
import { formatDateTime } from "../lib/formatDate";

interface Props {
  issues: Issue[];
  isAdmin: boolean;
  onStatusChange: (id: string, status: "open" | "closed") => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onEdit?: (id: string) => Promise<void>;
  emptyMessage?: string;
  versionById?: Record<string, string>;
}

export default function IssueList({ issues, isAdmin, onStatusChange, onDelete, onEdit, emptyMessage = "No issues reported for this mod yet.", versionById }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const [editingLocal, setEditingLocal] = useState<Issue | null>(null);
  const [deletingLocal, setDeletingLocal] = useState<Issue | null>(null);
  const [editingAdmin, setEditingAdmin] = useState<Issue | null>(null);
  const [deletingAdmin, setDeletingAdmin] = useState<Issue | null>(null);
  const sortedIssues = useMemo(() => [...issues].sort((a, b) => (a.status === b.status ? 0 : a.status === "closed" ? 1 : -1)), [issues]);
  if (issues.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }
  return (
    <>
      <ul className="issue-list">
        {sortedIssues.map((issue) => {
          const isExpanded = expanded.has(issue.id);
          const isLocal = issue.moderation_status === "pending";
          const hasDetails = Boolean(issue.description?.trim()) || (issue.attachment_urls?.length ?? 0) > 0;
          return (
            <li id={`issue-${issue.id}`} key={issue.id} className={`issue-row issue-row-clickable ${issue.status === "closed" ? "issue-row-closed" : ""}`} onClick={(event) => { if (isPlainRowClick(event)) navigate(`/lucidblocks/issues/${issue.id}`); }}>
              <div className="issue-row-content">
                <div className="issue-row-head">
                  <span className={`type-badge ${issue.type === "bug" ? "type-bug" : "type-feature"}`}>{issue.type === "bug" ? "Bug" : "Feature"}</span>
                  <span className="issue-row-title"><Link to={`/lucidblocks/issues/${issue.id}`}>{issue.title}</Link>{issue.moderation_status === "pending" && <span className="pending-label">pending moderation</span>}</span>
                  {issue.status === "closed" && hasDetails && <button className="btn btn-sm issue-action-btn issue-details-toggle" onClick={() => setExpanded((items) => { const next = new Set(items); isExpanded ? next.delete(issue.id) : next.add(issue.id); return next; })}>{isExpanded ? "Hide details" : "Show details"}</button>}
                </div>
                {(issue.status === "open" || isExpanded) && issue.description && <div className="issue-row-desc"><MarkdownText text={issue.description} issues={issues} /></div>}
                {(issue.status === "open" || isExpanded) && issue.attachment_urls?.length > 0 && <AttachmentGallery urls={issue.attachment_urls} />}
                <div className="issue-row-meta">
                  <IssueStateBadge state={issue.state} type={issue.type} fixedInVersion={issue.fixed_in_version_id ? versionById?.[issue.fixed_in_version_id] : undefined} />
                  <span>by {issue.author_name}</span>
                  <span>{formatDateTime(issue.created_at)}</span>
                  <Link className="issue-comment-link" to={`/lucidblocks/issues/${issue.id}`}>{(issue.comment_count ?? 0) > 0 ? `${issue.comment_count} comment${issue.comment_count === 1 ? "" : "s"}` : "Comment"}</Link>
                  {(isAdmin || isLocal) && (
                    <div className="issue-actions">
                      {isLocal && !isAdmin && <>
                        <button className="btn btn-sm issue-action-btn" onClick={() => setEditingLocal(issue)}>Edit</button>
                        <button className="btn btn-sm issue-delete-btn" onClick={() => setDeletingLocal(issue)}>Remove</button></>}
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
          );
        })}
      </ul>
      {deletingLocal && <ConfirmDialog title="Remove submission?" message="This pending submission will be permanently removed." onCancel={() => setDeletingLocal(null)} onConfirm={async () => { const target = deletingLocal; await softDeleteIssue(target.id); setDeletingLocal(null); await onEdit?.(target.id); }} />}
      {editingLocal && <IssueEditForm issue={editingLocal} onSubmit={async (title, description, attachmentUrls, newAttachments) => { await updateIssueContent(editingLocal.id, title, description, attachmentUrls, newAttachments); setEditingLocal(null); await onEdit?.(editingLocal.id); }} onCancel={() => setEditingLocal(null)} />}
      {deletingAdmin && <ConfirmDialog title="Delete issue?" message={`Delete "${deletingAdmin.title}" permanently?`} onCancel={() => setDeletingAdmin(null)} onConfirm={async () => { const target = deletingAdmin; await onDelete?.(target.id); setDeletingAdmin(null); }} />}
      {editingAdmin && <IssueEditForm heading="Edit issue" issue={editingAdmin} onSubmit={async (title, description, attachmentUrls, newAttachments) => { await updateIssueContent(editingAdmin.id, title, description, attachmentUrls, newAttachments); setEditingAdmin(null); await onEdit?.(editingAdmin.id); }} onCancel={() => setEditingAdmin(null)} />}
    </>
  );
}
