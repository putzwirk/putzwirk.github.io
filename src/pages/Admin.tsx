import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { Issue, Label, ModVersion, ModWithVersions } from "../types";
import { createLabel, createMod, createVersion, deleteComment, deleteIssue, deleteMod, deleteVersion, fetchIssueLabelsForIssues, fetchLabels, fetchModsWithVersions, fetchPendingComments, fetchPendingIssues, fetchRejectedIssues, moderateComment, moderateIssue, setIssueLabels, updateIssueContent, updateMod, updateVersion } from "../lib/data";
import type { PendingComment, VersionMeta } from "../lib/data";
import ModForm from "../components/ModForm";
import VersionForm from "../components/VersionForm";
import AttachmentGallery from "../components/AttachmentGallery";
import MarkdownText from "../components/MarkdownText";
import IssueEditForm from "../components/IssueEditForm";
import ConfirmDialog from "../components/ConfirmDialog";
import QueueToolbar from "../components/QueueToolbar";
import LabelPicker from "../components/LabelPicker";
import IssueStateBadge from "../components/IssueStateBadge";
import { formatDateTime } from "../lib/formatDate";
import { centerAfterRender } from "../lib/centerScroll";
import { supabase } from "../lib/supabase";

type TypeFilter = "all" | "bug" | "idea";
type SortOrder = "newest" | "oldest";

function RejectReasonDialog({ title = "Reject submission?", label, onCancel, onConfirm }: { title?: string; label: string; onCancel: () => void; onConfirm: (reason: string) => void | Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    await onConfirm(reason);
    setBusy(false);
  };

  return (
    <div className="confirm-dialog-backdrop" onClick={onCancel}>
      <div className="confirm-dialog reject-dialog" onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p>{label}</p>
        <label className="reject-dialog-field">
          Reason (optional)
          <textarea className="form-textarea" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} />
        </label>
        <div className="form-actions reject-dialog-actions">
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn btn-danger" type="button" onClick={handleConfirm} disabled={busy}>{busy ? "Rejecting…" : "Reject"}</button>
        </div>
      </div>
    </div>
  );
}

export default function Admin({ submissionsOnly = false, commentsOnly = false }: { submissionsOnly?: boolean; commentsOnly?: boolean }) {
  const { isStaff, loading: authLoading } = useAuth();
  const location = useLocation();
  const commentsPage = commentsOnly || location.pathname.endsWith("/comments");
  const submissionsPage = submissionsOnly || location.pathname.endsWith("/submissions");
  const managementPage = !submissionsPage && !commentsPage;
  const [mods, setMods] = useState<ModWithVersions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModForm, setShowModForm] = useState(false);
  const [editingMod, setEditingMod] = useState<ModWithVersions | null>(null);
  const [versionTarget, setVersionTarget] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<ModVersion | null>(null);
  const [pendingIssues, setPendingIssues] = useState<Issue[]>([]);
  const [rejectedIssues, setRejectedIssues] = useState<Issue[]>([]);
  const [submissionTab, setSubmissionTab] = useState<"pending" | "blocked">("pending");
  const [deletingBlocked, setDeletingBlocked] = useState<Issue | null>(null);
  const [deletingSubmission, setDeletingSubmission] = useState<Issue | null>(null);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [deletingMod, setDeletingMod] = useState<ModWithVersions | null>(null);
  const [deletingVersion, setDeletingVersion] = useState<ModVersion | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [labelsByIssue, setLabelsByIssue] = useState<Record<string, Label[]>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [labelEditorId, setLabelEditorId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [modFilter, setModFilter] = useState("all");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [rejectTarget, setRejectTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);
  const [selectedCommentIds, setSelectedCommentIds] = useState<Set<string>>(new Set());
  const [deletingComment, setDeletingComment] = useState<PendingComment | null>(null);
  const [commentRejectTarget, setCommentRejectTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [confirmCommentBulkDelete, setConfirmCommentBulkDelete] = useState(false);
  const modFormRef = useRef<HTMLDivElement>(null);
  const versionFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showModForm) centerAfterRender(modFormRef);
  }, [showModForm]);

  useEffect(() => {
    if (versionTarget || editingVersion) centerAfterRender(versionFormRef);
  }, [versionTarget, editingVersion]);

  const loadMods = () => {
    setLoading(true);
    fetchModsWithVersions().then(setMods).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  const loadQueue = useCallback(async () => {
    const issues = await fetchPendingIssues();
    setPendingIssues(issues);
    setLabelsByIssue(await fetchIssueLabelsForIssues(issues.map((issue) => issue.id)));
  }, []);

  const loadBlocked = useCallback(async () => {
    setRejectedIssues(await fetchRejectedIssues());
  }, []);

  const loadComments = useCallback(async () => {
    setPendingComments(await fetchPendingComments());
  }, []);

  useEffect(() => {
    if (!isStaff) return;
    loadMods();
    fetchLabels().then(setLabels).catch((e) => setError(e.message));
    loadQueue().catch((e) => setError(e.message));
    loadComments().catch((e) => setError(e.message));
    loadBlocked().catch((e) => setError(e.message));
  }, [isStaff, loadQueue, loadComments, loadBlocked]);

  useEffect(() => {
    if (!isStaff) return;
    const channel = supabase
      .channel("admin-issues")
      .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, () => {
        loadQueue().catch(() => undefined);
        loadBlocked().catch(() => undefined);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "issue_comments" }, () => {
        loadQueue().catch(() => undefined);
        loadComments().catch(() => undefined);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isStaff, loadQueue, loadComments, loadBlocked]);

  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase();
    return pendingIssues
      .filter((issue) => {
        const matchesSearch = query === "" || issue.title.toLowerCase().includes(query) || issue.author_name.toLowerCase().includes(query);
        const matchesType = typeFilter === "all" || issue.type === typeFilter;
        const matchesMod = modFilter === "all" || (modFilter === "global" ? issue.mod_id === null : issue.mod_id === modFilter);
        return matchesSearch && matchesType && matchesMod;
      })
      .sort((a, b) => {
        const delta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return sort === "newest" ? -delta : delta;
      });
  }, [pendingIssues, search, typeFilter, modFilter, sort]);

  const selectedIssues = filteredIssues.filter((issue) => selectedIds.has(issue.id));
  const allSelected = filteredIssues.length > 0 && selectedIssues.length === filteredIssues.length;

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allSelected) filteredIssues.forEach((issue) => next.delete(issue.id));
      else filteredIssues.forEach((issue) => next.add(issue.id));
      return next;
    });
  };

  const removeIssues = (ids: string[]) => {
    setPendingIssues((items) => items.filter((item) => !ids.includes(item.id)));
    setSelectedIds(new Set());
    setLabelsByIssue((previous) => {
      const next = { ...previous };
      for (const id of ids) delete next[id];
      return next;
    });
  };

  const applyModeration = async (ids: string[], status: "approved" | "rejected", reason?: string) => {
    await Promise.all(ids.map((id) => moderateIssue(id, status, reason)));
    removeIssues(ids);
    await loadBlocked();
  };

  const handleApprove = async (ids: string[]) => {
    try {
      await applyModeration(ids, "approved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed.");
    }
  };

  const handleBulkReject = () => {
    if (selectedIssues.length === 0) return;
    setRejectTarget({ ids: selectedIssues.map((issue) => issue.id), label: `${selectedIssues.length} selected submission${selectedIssues.length === 1 ? "" : "s"}` });
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectTarget) return;
    try {
      await applyModeration(rejectTarget.ids, "rejected", reason);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed.");
    }
    setRejectTarget(null);
  };

  const handleBulkDelete = async () => {
    const ids = selectedIssues.map((issue) => issue.id);
    try {
      await Promise.all(ids.map((id) => deleteIssue(id)));
      removeIssues(ids);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk delete failed.");
    }
    setConfirmBulkDelete(false);
  };

  const handleUnblock = async (id: string) => {
    try {
      await moderateIssue(id, "approved");
      setRejectedIssues((items) => items.filter((item) => item.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve the blocked submission.");
    }
  };

  const handleDeleteBlocked = async (id: string) => {
    try {
      await deleteIssue(id);
      setRejectedIssues((items) => items.filter((item) => item.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the blocked submission.");
    }
    setDeletingBlocked(null);
  };

  const handleDeleteSubmission = async (id: string) => {
    try {
      await deleteIssue(id);
      removeIssues([id]);
      setRejectedIssues((items) => items.filter((item) => item.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the submission.");
    }
    setDeletingSubmission(null);
  };

  const removeComments = (ids: string[]) => {
    setPendingComments((items) => items.filter((item) => !ids.includes(item.id)));
    setSelectedCommentIds(new Set());
  };

  const removeComment = (id: string) => {
    setPendingComments((items) => items.filter((item) => item.id !== id));
    setSelectedCommentIds((current) => { const next = new Set(current); next.delete(id); return next; });
  };

  const applyCommentModeration = async (ids: string[], status: "approved" | "rejected", reason?: string) => {
    await Promise.all(ids.map((id) => moderateComment(id, status, reason)));
    removeComments(ids);
  };

  const handleApproveComments = async (ids: string[]) => {
    try {
      await applyCommentModeration(ids, "approved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed.");
    }
  };

  const handleCommentBulkReject = () => {
    if (selectedCommentIds.size === 0) return;
    setCommentRejectTarget({ ids: [...selectedCommentIds], label: `${selectedCommentIds.size} selected comment${selectedCommentIds.size === 1 ? "" : "s"}` });
  };

  const handleCommentRejectConfirm = async (reason: string) => {
    if (!commentRejectTarget) return;
    try {
      await applyCommentModeration(commentRejectTarget.ids, "rejected", reason);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed.");
    }
    setCommentRejectTarget(null);
  };

  const handleCommentBulkDelete = async () => {
    const ids = [...selectedCommentIds];
    try {
      await Promise.all(ids.map((id) => deleteComment(id)));
      removeComments(ids);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk delete failed.");
    }
    setConfirmCommentBulkDelete(false);
  };

  const toggleCommentSelect = (id: string) => {
    setSelectedCommentIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allCommentsSelected = pendingComments.length > 0 && selectedCommentIds.size === pendingComments.length;

  const toggleSelectAllComments = () => {
    if (allCommentsSelected) setSelectedCommentIds(new Set());
    else setSelectedCommentIds(new Set(pendingComments.map((item) => item.id)));
  };

  const toggleIssueLabel = async (issueId: string, label: Label) => {
    const current = labelsByIssue[issueId] ?? [];
    const nextIds = current.some((item) => item.id === label.id)
      ? current.filter((item) => item.id !== label.id).map((item) => item.id)
      : [...current.map((item) => item.id), label.id];
    try {
      await setIssueLabels(issueId, nextIds);
      setLabelsByIssue((previous) => ({ ...previous, [issueId]: labels.filter((item) => nextIds.includes(item.id)) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update labels.");
    }
  };

  const createAndAssignLabel = async (issueId: string, name: string, color: string) => {
    const label = await createLabel(name, color);
    const nextLabels = [...labels.filter((item) => item.id !== label.id), label].sort((a, b) => a.name.localeCompare(b.name));
    setLabels(nextLabels);
    const current = labelsByIssue[issueId] ?? [];
    const nextIds = [...current.map((item) => item.id), label.id];
    await setIssueLabels(issueId, nextIds);
    setLabelsByIssue((previous) => ({ ...previous, [issueId]: nextLabels.filter((item) => nextIds.includes(item.id)) }));
  };

  if (authLoading) return <p className="load-state">Loading</p>;
  if (!isStaff) return <Navigate to="/lucidblocks/login" replace />;

  return (
    <>
      <div className="section-head admin-manage-head">
        <h1>{submissionsPage ? "Submissions" : commentsPage ? "Comments" : "Manage mods"}</h1>
        {managementPage && <button className="btn btn-accent admin-add-mod-btn" onClick={() => { setEditingMod(null); setShowModForm(true); }}>Add mod</button>}
      </div>
      <nav className="staff-view-nav" aria-label="Moderation views">
        <Link to="/lucidblocks/admin" className={managementPage ? "active" : ""}>Manage mods</Link>
        <Link to="/lucidblocks/admin/submissions" className={submissionsPage ? "active" : ""}>
          <span className="submissions-tab-label">
            Submissions
            {pendingIssues.length > 0 && <span className="pending-count-dot" aria-label={`${pendingIssues.length} pending submissions`} />}
          </span>
        </Link>
        <Link to="/lucidblocks/admin/comments" className={commentsPage ? "active" : ""}>
          <span className="submissions-tab-label">
            Comments
            {pendingComments.length > 0 && <span className="pending-count-dot" aria-label={`${pendingComments.length} pending comments`} />}
          </span>
          {pendingComments.length > 0 && <span className="chip tab-count">{pendingComments.length}</span>}
        </Link>
      </nav>
      {error && <div className="error-state">{error}</div>}
      {submissionsPage && (
        <>
          <div className="staff-view-nav" role="tablist" aria-label="Submission filters">
            <button type="button" role="tab" aria-selected={submissionTab === "pending"} className={submissionTab === "pending" ? "active" : ""} onClick={() => setSubmissionTab("pending")}>Pending{pendingIssues.length > 0 && <span className="chip tab-count">{pendingIssues.length}</span>}</button>
            <button type="button" role="tab" aria-selected={submissionTab === "blocked"} className={submissionTab === "blocked" ? "active" : ""} onClick={() => setSubmissionTab("blocked")}>Blocked{rejectedIssues.length > 0 && <span className="chip tab-count">{rejectedIssues.length}</span>}</button>
          </div>
          {submissionTab === "pending" && (
            <>
          <QueueToolbar
            search={search}
            onSearchChange={(value) => { setSearch(value); setSelectedIds(new Set()); }}
            typeFilter={typeFilter}
            onTypeFilterChange={(value) => { setTypeFilter(value); setSelectedIds(new Set()); }}
            modFilter={modFilter}
            onModFilterChange={(value) => { setModFilter(value); setSelectedIds(new Set()); }}
            mods={mods}
            sort={sort}
            onSortChange={setSort}
            resultCount={filteredIssues.length}
            selectedCount={selectedIssues.length}
            allSelected={allSelected}
            onToggleSelectAll={toggleSelectAll}
            onBulkApprove={() => handleApprove(selectedIssues.map((issue) => issue.id))}
            onBulkReject={handleBulkReject}
            onBulkDelete={() => setConfirmBulkDelete(true)}
          />
          {filteredIssues.length === 0 ? (
            <p className="empty-state">{pendingIssues.length === 0 ? "There are no pending submissions." : "No submissions match these filters."}</p>
          ) : (
            <section className="moderation-panel">
              {filteredIssues.map((issue) => (
                <article className={`moderation-item${selectedIds.has(issue.id) ? " moderation-item-selected" : ""}`} key={issue.id}>
                  <div className="issue-row-content">
                    <div className="issue-row-head">
                      <label className="queue-row-select">
                        <input type="checkbox" checked={selectedIds.has(issue.id)} onChange={() => toggleSelect(issue.id)} aria-label={`Select ${issue.title}`} />
                      </label>
                      <span className={`type-badge ${issue.type === "bug" ? "type-bug" : "type-feature"}`}>{issue.type === "bug" ? "Bug" : "Feature"}</span>
                      <span className="issue-row-title">{issue.title}</span>
                    </div>
                    <div className="issue-row-desc"><MarkdownText text={issue.description} issues={pendingIssues} mods={mods} /></div>
                    <div className="issue-row-meta">
                      <IssueStateBadge state={issue.state} />
                      <span>by {issue.author_name}</span>
                      <span>{formatDateTime(issue.created_at)}</span>
                      {issue.mod_id && <span className="chip">{mods.find((mod) => mod.id === issue.mod_id)?.name ?? issue.mod_id}</span>}
                    </div>
                    {(labelsByIssue[issue.id] ?? []).length > 0 && (
                      <div className="label-chip-row">
                        {(labelsByIssue[issue.id] ?? []).map((label) => (
                          <span className="chip label-chip" key={label.id}>
                            <span className="label-swatch" style={{ background: label.color }} aria-hidden="true" />
                            {label.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {issue.attachment_urls?.length > 0 && <AttachmentGallery urls={issue.attachment_urls} />}
                  </div>
                  <div className="admin-controls">
                    <button className="btn btn-sm" onClick={() => setEditingIssue(issue)}>Edit</button>
                    <button className="btn btn-sm" onClick={() => setLabelEditorId((current) => current === issue.id ? null : issue.id)}>{labelEditorId === issue.id ? "Close labels" : "Labels"}</button>
                    <button className="btn btn-accent btn-sm" onClick={() => handleApprove([issue.id])}>Approve</button>
                    <button className="btn btn-sm" onClick={() => setRejectTarget({ ids: [issue.id], label: issue.title })}>Reject</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeletingSubmission(issue)}>Delete</button>
                  </div>
                  {labelEditorId === issue.id && (
                    <LabelPicker
                      labels={labels}
                      selectedIds={(labelsByIssue[issue.id] ?? []).map((label) => label.id)}
                      onToggle={(labelId) => { const label = labels.find((item) => item.id === labelId); if (label) toggleIssueLabel(issue.id, label); }}
                      onCreate={(name, color) => createAndAssignLabel(issue.id, name, color)}
                    />
                  )}
                </article>
              ))}
            </section>
          )}
            </>
          )}
          {submissionTab === "blocked" && (
            rejectedIssues.length === 0 ? (
              <p className="empty-state">There are no blocked submissions.</p>
            ) : (
              <section className="moderation-panel">
                {rejectedIssues.map((issue) => (
                  <article className="moderation-item" key={issue.id}>
                    <div className="issue-row-content">
                      <div className="issue-row-head">
                        <span className={`type-badge ${issue.type === "bug" ? "type-bug" : "type-feature"}`}>{issue.type === "bug" ? "Bug" : "Feature"}</span>
                        <span className="issue-row-title">{issue.title}</span>
                        <span className="comment-rejected-label">blocked</span>
                      </div>
                      <div className="issue-row-desc"><MarkdownText text={issue.description} issues={rejectedIssues} mods={mods} /></div>
                      {issue.attachment_urls?.length > 0 && <AttachmentGallery urls={issue.attachment_urls} />}
                      <div className="issue-row-meta">
                        <IssueStateBadge state={issue.state} />
                        <span>by {issue.author_name}</span>
                        <span>{formatDateTime(issue.created_at)}</span>
                        {issue.mod_id && <span className="chip">{mods.find((mod) => mod.id === issue.mod_id)?.name ?? issue.mod_id}</span>}
                      </div>
                      {issue.moderation_reason && (
                        <div className="moderation-note">
                          <span className="moderation-note-label">Blocked</span>
                          <span>{issue.moderation_reason}</span>
                        </div>
                      )}
                    </div>
                    <div className="admin-controls">
                      <button className="btn btn-accent btn-sm" onClick={() => handleUnblock(issue.id)}>Approve</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeletingBlocked(issue)}>Delete</button>
                    </div>
                  </article>
                ))}
              </section>
            )
          )}
        </>
      )}
      {commentsPage && (
        <>
          <div className="panel comment-queue-toolbar">
            <div className="queue-toolbar-actions">
              <span className="queue-count">{pendingComments.length} pending comment{pendingComments.length === 1 ? "" : "s"}{selectedCommentIds.size > 0 ? ` · ${selectedCommentIds.size} selected` : ""}</span>
              <label className="queue-select-all">
                <input type="checkbox" checked={allCommentsSelected} onChange={toggleSelectAllComments} disabled={pendingComments.length === 0} aria-label="Select all pending comments" />
                Select all
              </label>
              <div className="queue-bulk">
                <button className="btn btn-accent btn-sm" type="button" onClick={() => handleApproveComments([...selectedCommentIds])} disabled={selectedCommentIds.size === 0}>Bulk approve</button>
                <button className="btn btn-sm" type="button" onClick={handleCommentBulkReject} disabled={selectedCommentIds.size === 0}>Bulk reject</button>
                <button className="btn btn-danger btn-sm" type="button" onClick={() => setConfirmCommentBulkDelete(true)} disabled={selectedCommentIds.size === 0}>Bulk delete</button>
              </div>
            </div>
          </div>
          {pendingComments.length === 0 ? (
            <p className="empty-state">There are no pending comments.</p>
          ) : (
            <section className="moderation-panel">
              {pendingComments.map((comment) => (
                <article className={`moderation-item${selectedCommentIds.has(comment.id) ? " moderation-item-selected" : ""}`} key={comment.id}>
                  <div className="issue-row-content">
                    <div className="issue-row-head">
                      <label className="queue-row-select">
                        <input type="checkbox" checked={selectedCommentIds.has(comment.id)} onChange={() => toggleCommentSelect(comment.id)} aria-label={`Select comment by ${comment.author_name}`} />
                      </label>
                      <span className="chip">Comment</span>
                      <span className="issue-row-title">
                        {comment.author_name} on <Link className="issue-comment-link" to={`/lucidblocks/issues/${comment.issue_id}`}>{comment.issues?.title ?? "issue"}</Link>
                      </span>
                    </div>
                    <div className="issue-row-desc"><MarkdownText text={comment.body} issues={pendingIssues} mods={mods} /></div>
                    <div className="issue-row-meta">
                      <span>by {comment.author_name}</span>
                      <span>{formatDateTime(comment.created_at)}</span>
                      <span className="pending-label">pending moderation</span>
                    </div>
                  </div>
                  <div className="admin-controls">
                    <button className="btn btn-accent btn-sm" onClick={() => handleApproveComments([comment.id])}>Approve</button>
                    <button className="btn btn-sm" onClick={() => setCommentRejectTarget({ ids: [comment.id], label: comment.author_name })}>Reject</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeletingComment(comment)}>Delete</button>
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {editingIssue && <IssueEditForm issue={editingIssue} onSubmit={async (title, description, attachmentUrls, newAttachments) => { const urls = await updateIssueContent(editingIssue.id, title, description, attachmentUrls, newAttachments); setPendingIssues((items) => items.map((item) => item.id === editingIssue.id ? { ...item, title, description, attachment_urls: urls } : item)); setEditingIssue(null); }} onCancel={() => setEditingIssue(null)} />}
      {managementPage && <>
      {showModForm && (
        <div ref={modFormRef}>
          <ModForm mod={editingMod} availableMods={mods} onSubmit={async (data) => { if (editingMod) { await updateMod(editingMod.id, data); } else { await createMod(data); } setShowModForm(false); setEditingMod(null); loadMods(); }} onCancel={() => { setShowModForm(false); setEditingMod(null); }} />
        </div>
      )}
      {versionTarget && !editingVersion && (
        <div ref={versionFormRef}>
          <VersionForm modId={versionTarget} onSubmit={async (versionData, file) => { await createVersion(versionData, file!); setVersionTarget(null); loadMods(); }} onCancel={() => setVersionTarget(null)} />
        </div>
      )}
      {editingVersion && (
        <div ref={versionFormRef}>
          <VersionForm modId={editingVersion.mod_id} initial={editingVersion} onSubmit={async (versionData, file) => { await updateVersion(editingVersion.id, { version: versionData.version, game_version: versionData.game_version, release_date: versionData.release_date, changelog: versionData.changelog, published: versionData.published, channel: versionData.channel }, file, editingVersion.mod_id); setEditingVersion(null); loadMods(); }} onCancel={() => setEditingVersion(null)} />
        </div>
      )}
      {loading ? (
        <p className="load-state">Loading</p>
      ) : (
        <div className="mod-grid">
          {mods.map((mod) => (
            <div key={mod.id} className="mod-slot mod-slot-admin">
              <div className="mod-slot-head">
                <span className="slot-glyph">{mod.name.charAt(0)}</span>
                <div className="mod-slot-body">
                  <span className="mod-slot-name">{mod.name}</span>
                  <span className="mod-slot-tagline">{mod.tagline}</span>
                  <span className="tag">{mod.mod_versions.length} version(s)</span>
                </div>
              </div>
              <div className="admin-controls">
                <button className="btn btn-sm" onClick={() => { setEditingMod(mod); setShowModForm(true); }}>Edit</button>
                <button className="btn btn-accent btn-sm" onClick={() => { setEditingVersion(null); setVersionTarget(mod.id); }}>Add version</button>
                <button className="btn btn-sm" onClick={() => setDeletingMod(mod)}>Delete</button>
              </div>
              {mod.mod_versions.length > 0 && (
                <ul className="admin-version-list">
                  {mod.mod_versions.map((v) => {
                    const meta = v as ModVersion & VersionMeta;
                    return (
                    <li key={v.id} className="admin-version-row">
                      <span className="chip chip-version">v{v.version}</span>
                      <span className="chip">Lucid Blocks v.{v.game_version}</span>
                      {meta.published === false && <span className="chip chip-draft">Draft</span>}
                      {meta.channel === "beta" && <span className="chip chip-beta">Beta</span>}
                      <span className="admin-version-date">{v.release_date}</span>
                      <span className="admin-version-actions">
                        <button className="btn btn-ghost btn-sm admin-version-edit-btn" onClick={() => { setVersionTarget(null); setEditingVersion(v); }}>Edit</button>
                        <button className="btn btn-ghost btn-sm admin-version-delete-btn" onClick={() => setDeletingVersion(v)}>Delete</button>
                      </span>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      </>}
      {deletingMod && <ConfirmDialog title="Delete mod?" message={`Delete "${deletingMod.name}" and all its versions?`} onCancel={() => setDeletingMod(null)} onConfirm={async () => { await deleteMod(deletingMod.id); setDeletingMod(null); loadMods(); }} />}
      {deletingVersion && <ConfirmDialog title="Delete version?" message={`Delete version ${deletingVersion.version}?`} onCancel={() => setDeletingVersion(null)} onConfirm={async () => { await deleteVersion(deletingVersion); setDeletingVersion(null); loadMods(); }} />}
      {rejectTarget && <RejectReasonDialog label={rejectTarget.label} onCancel={() => setRejectTarget(null)} onConfirm={handleRejectConfirm} />}
      {confirmBulkDelete && <ConfirmDialog title="Delete selected submissions?" message={`Delete ${selectedIssues.length} submission${selectedIssues.length === 1 ? "" : "s"} permanently?`} onCancel={() => setConfirmBulkDelete(false)} onConfirm={handleBulkDelete} />}
      {deletingBlocked && <ConfirmDialog title="Delete blocked submission?" message={`Delete "${deletingBlocked.title}" permanently?`} onCancel={() => setDeletingBlocked(null)} onConfirm={() => handleDeleteBlocked(deletingBlocked.id)} />}
      {deletingSubmission && <ConfirmDialog title="Delete submission?" message={`Delete "${deletingSubmission.title}" permanently? Its comments, votes and attachments go with it.`} onCancel={() => setDeletingSubmission(null)} onConfirm={() => handleDeleteSubmission(deletingSubmission.id)} />}
      {commentRejectTarget && <RejectReasonDialog title="Reject comment?" label={commentRejectTarget.label} onCancel={() => setCommentRejectTarget(null)} onConfirm={handleCommentRejectConfirm} />}
      {deletingComment && <ConfirmDialog title="Delete comment?" message="This comment will be permanently removed." onCancel={() => setDeletingComment(null)} onConfirm={async () => { const target = deletingComment; await deleteComment(target.id); removeComment(target.id); setDeletingComment(null); }} />}
      {confirmCommentBulkDelete && <ConfirmDialog title="Delete selected comments?" message={`Delete ${selectedCommentIds.size} comment${selectedCommentIds.size === 1 ? "" : "s"} permanently?`} onCancel={() => setConfirmCommentBulkDelete(false)} onConfirm={handleCommentBulkDelete} />}
    </>
  );
}
