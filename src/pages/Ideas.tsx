import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Issue, IssueComment, Mod } from "../types";
import { fetchIdeas, fetchAllPublicIssues, fetchModsWithVersions, createIssue, toggleVote, fetchMyVotes, updateIssueStatus, deleteIssue, softDeleteIssue, updateIssueContent, fetchComments, createComment, subscribeToIssue } from "../lib/data";
import { useAuth } from "../context/AuthContext";
import IssueForm from "../components/IssueForm";
import MarkdownText from "../components/MarkdownText";
import AttachmentGallery from "../components/AttachmentGallery";
import CommentComposer from "../components/CommentComposer";
import CommentThread from "../components/CommentThread";
import ConfirmDialog from "../components/ConfirmDialog";
import IssueEditForm from "../components/IssueEditForm";
import IssueStateBadge from "../components/IssueStateBadge";
import { formatDateTime } from "../lib/formatDate";
import { isPlainRowClick } from "../lib/rowClick";
import { centerAfterRender } from "../lib/centerScroll";

function commentLabel(idea: Issue) {
  const count = idea.comment_count ?? 0;
  return count > 0 ? `${count} comment${count === 1 ? "" : "s"}` : "Comment";
}

export default function Ideas() {
  const [ideas, setIdeas] = useState<Issue[]>([]);
  const [mentionIssues, setMentionIssues] = useState<Issue[]>([]);
  const [mentionMods, setMentionMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [statusTab, setStatusTab] = useState<"open" | "closed">("open");
  const [expandedClosed, setExpandedClosed] = useState<Set<string>>(new Set());
  const [editingLocal, setEditingLocal] = useState<Issue | null>(null);
  const [deletingLocal, setDeletingLocal] = useState<Issue | null>(null);
  const [editingAdmin, setEditingAdmin] = useState<Issue | null>(null);
  const [deletingAdmin, setDeletingAdmin] = useState<Issue | null>(null);
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [commentsByIssue, setCommentsByIssue] = useState<Record<string, IssueComment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState<Set<string>>(new Set());
  const [commentsError, setCommentsError] = useState<Record<string, string>>({});
  const commentSubsRef = useRef(new Map<string, () => void>());
  const commentReqRef = useRef<Record<string, number>>({});
  const { isStaff } = useAuth();
  const navigate = useNavigate();
  const ideaFormRef = useRef<HTMLDivElement>(null);
  const openIdeas = useMemo(() => ideas.filter((idea) => idea.status === "open"), [ideas]);
  const closedIdeas = useMemo(() => ideas.filter((idea) => idea.status === "closed"), [ideas]);
  const visibleIdeas = statusTab === "open" ? openIdeas : closedIdeas;

  useEffect(() => {
    fetchMyVotes().then(setVotedIds).catch(() => setVotedIds(new Set()));
    loadIdeas();
  }, []);

  useEffect(() => {
    if (showForm) centerAfterRender(ideaFormRef);
  }, [showForm]);

  const loadIdeas = () => {
    setLoading(true);
    Promise.all([fetchIdeas(), fetchAllPublicIssues().catch(() => [] as Issue[]), fetchModsWithVersions().catch(() => [] as Mod[])])
      .then(([fetchedIdeas, allIssues, allMods]) => {
        setIdeas(fetchedIdeas);
        setMentionIssues(allIssues);
        setMentionMods(allMods);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const loadComments = useCallback(async (issueId: string, reportError = false) => {
    const token = (commentReqRef.current[issueId] ?? 0) + 1;
    commentReqRef.current[issueId] = token;
    setCommentsLoading((current) => new Set(current).add(issueId));
    try {
      const items = await fetchComments(issueId);
      if (commentReqRef.current[issueId] !== token) return;
      setCommentsByIssue((current) => ({ ...current, [issueId]: items }));
      setCommentsError((current) => { const next = { ...current }; delete next[issueId]; return next; });
      const approved = items.filter((comment) => comment.moderation_status === "approved").length;
      setIdeas((current) => current.map((item) => (item.id === issueId ? { ...item, comment_count: approved } : item)));
    } catch (e) {
      if (!reportError || commentReqRef.current[issueId] !== token) return;
      setCommentsError((current) => ({ ...current, [issueId]: e instanceof Error ? e.message : "Could not load comments." }));
    } finally {
      if (commentReqRef.current[issueId] === token) {
        setCommentsLoading((current) => { const next = new Set(current); next.delete(issueId); return next; });
      }
    }
  }, []);

  const closeCommentChannel = useCallback((id: string) => {
    commentSubsRef.current.get(id)?.();
    commentSubsRef.current.delete(id);
  }, []);

  const toggleComments = (idea: Issue) => {
    const id = idea.id;
    const willOpen = !openComments.has(id);
    setOpenComments((current) => {
      const next = new Set(current);
      if (willOpen) next.add(id);
      else next.delete(id);
      return next;
    });
    if (willOpen) {
      if (!commentSubsRef.current.has(id)) {
        commentSubsRef.current.set(id, subscribeToIssue(id, () => { loadComments(id); }));
      }
      if (!commentsByIssue[id]) loadComments(id, true);
    } else {
      closeCommentChannel(id);
    }
  };

  useEffect(() => () => {
    commentSubsRef.current.forEach((unsubscribe) => unsubscribe());
    commentSubsRef.current.clear();
  }, []);

  const handleVote = async (id: string) => {
    try {
      const count = await toggleVote(id);
      setVotedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setIdeas((items) => items.map((item) => (item.id === id ? { ...item, votes: count } : item)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vote failed.");
    }
  };

  if (loading) return <p className="load-state">Loading ideas</p>;
  if (error) return <div className="error-state">Couldn't load ideas. {error}</div>;

  return (
    <>
      <div className="ideas-intro">
        <div>
          <div className="section-title-row">
            <h1>Ideas</h1>
            <div className="list-tabs" role="tablist" aria-label="Idea status">
              <button type="button" role="tab" aria-selected={statusTab === "open"} className={statusTab === "open" ? "active" : ""} onClick={() => setStatusTab("open")}>Open<span className="chip tab-count">{openIdeas.length}</span></button>
              <button type="button" role="tab" aria-selected={statusTab === "closed"} className={statusTab === "closed" ? "active" : ""} onClick={() => setStatusTab("closed")}>Solved<span className="chip tab-count">{closedIdeas.length}</span></button>
            </div>
          </div>
          <p className="intro intro-tight">Suggest a mod idea or vote on what you'd like to see next.</p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "Suggest an idea"}</button>
      </div>
      {showForm && (
        <div ref={ideaFormRef}>
          <IssueForm initialType="idea" referenceIssues={mentionIssues} referenceMods={mentionMods} onSubmit={async (title, desc, author, type, attachments) => { const pendingIssue = await createIssue({ mod_id: null, type, title, description: desc, author_name: author, attachments }); setIdeas((items) => [pendingIssue, ...items]); setShowForm(false); }} />
        </div>
      )}
      <section>
        {ideas.length === 0 ? (
          <p className="empty-state">No ideas yet — be the first to suggest one.</p>
        ) : visibleIdeas.length === 0 ? (
          <p className="empty-state">{statusTab === "open" ? "No open ideas right now." : "Nothing marked solved yet."}</p>
        ) : (
          <ul className="issue-list">
            {visibleIdeas.map((idea) => (
              <li id={`issue-${idea.id}`} key={idea.id} className={`issue-row issue-row-clickable ${idea.status === "closed" ? "issue-row-closed" : ""}`} onClick={(event) => { if (isPlainRowClick(event)) navigate(`/lucidblocks/issues/${idea.id}`); }}>
                <div className="issue-row-content">
                  <div className="issue-row-head">
                    <span className={`type-badge ${idea.type === "bug" ? "type-bug" : "type-feature"}`}>{idea.type === "bug" ? "Bug" : "Feature"}</span>
                    <span className="issue-row-title"><Link to={`/lucidblocks/issues/${idea.id}`}>{idea.title}</Link>{idea.moderation_status === "pending" && <span className="pending-label">pending moderation</span>}</span>
                  </div>
                  {idea.description && (idea.status !== "closed" || expandedClosed.has(idea.id)) && <div className="issue-row-desc"><MarkdownText text={idea.description} issues={ideas} /></div>}
                  {idea.attachment_urls?.length > 0 && (idea.status !== "closed" || expandedClosed.has(idea.id)) && <AttachmentGallery urls={idea.attachment_urls} />}
                  {idea.status === "closed" && (idea.description?.trim() || (idea.attachment_urls?.length ?? 0) > 0) && <button className="btn btn-sm issue-details-toggle" onClick={() => setExpandedClosed((current) => { const next = new Set(current); if (next.has(idea.id)) next.delete(idea.id); else next.add(idea.id); return next; })}>{expandedClosed.has(idea.id) ? "Hide details" : "Show details"}</button>}
                  <div className="issue-row-meta">
                    <IssueStateBadge state={idea.state} />
                    {idea.status === "open" && <button className={`vote-btn ${votedIds.has(idea.id) ? "voted" : ""}`} onClick={() => handleVote(idea.id)}>↑ {idea.votes} {votedIds.has(idea.id) ? "voted" : "vote"}</button>}
                    <span>by {idea.author_name}</span>
                    <span>{formatDateTime(idea.created_at)}</span>
                    <button type="button" className={`issue-comment-link comment-toggle${openComments.has(idea.id) ? " open" : ""}`} onClick={() => toggleComments(idea)} aria-expanded={openComments.has(idea.id)} aria-controls={`issue-comments-${idea.id}`} aria-label={`${commentLabel(idea)} on "${idea.title}"`}>{commentLabel(idea)}</button>
                    {isStaff && (
                      <div className="issue-actions">
                        <button className="btn btn-sm issue-action-btn" onClick={() => setEditingAdmin(idea)}>Edit</button>
                        {idea.status === "open" && (
                          <button className="btn btn-sm issue-action-btn" onClick={async () => { await updateIssueStatus(idea.id, "closed"); setIdeas((items) => items.map((item) => item.id === idea.id ? { ...item, status: "closed" } : item)); }}>Close</button>
                        )}
                        {idea.status === "closed" && (
                          <button className="btn btn-sm issue-action-btn" onClick={async () => { await updateIssueStatus(idea.id, "open"); setIdeas((items) => items.map((item) => item.id === idea.id ? { ...item, status: "open" } : item)); }}>Reopen</button>
                        )}
                        <button className="btn btn-sm issue-delete-btn" onClick={() => setDeletingAdmin(idea)}>Delete</button>
                      </div>
                    )}
                    {!isStaff && idea.moderation_status === "pending" && <div className="issue-actions"><button className="btn btn-sm issue-action-btn" onClick={() => setEditingLocal(idea)}>Edit</button><button className="btn btn-sm issue-delete-btn" onClick={() => setDeletingLocal(idea)}>Remove</button></div>}
                  </div>
                  {openComments.has(idea.id) && (
                    <div className="issue-comments" id={`issue-comments-${idea.id}`} role="region" aria-label={`Comments on "${idea.title}"`}>
                      {commentsLoading.has(idea.id) && !commentsByIssue[idea.id] ? (
                        <p className="load-state">Loading comments</p>
                      ) : commentsError[idea.id] ? (
                        <div className="comments-error">
                          <p className="form-error">{commentsError[idea.id]}</p>
                          <button className="btn btn-sm" type="button" onClick={() => loadComments(idea.id, true)}>Retry</button>
                        </div>
                      ) : (
                        <CommentThread comments={commentsByIssue[idea.id] ?? []} isStaff={isStaff} commentsClosed={idea.status === "closed"} referenceIssues={mentionIssues} referenceMods={mentionMods} onChanged={() => loadComments(idea.id, true)} />
                      )}
                      {idea.status === "closed" ? (
                        <p className="comments-closed">Comments are closed on this idea.</p>
                      ) : (
                        <CommentComposer
                          placeholder={`Comment on "${idea.title}"`}
                          onSubmit={async (body, authorName) => {
                            await createComment(idea.id, body, authorName, null);
                            loadComments(idea.id);
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {deletingAdmin && <ConfirmDialog title="Delete idea?" message={`Delete "${deletingAdmin.title}" permanently?`} onCancel={() => setDeletingAdmin(null)} onConfirm={async () => { const target = deletingAdmin; await deleteIssue(target.id); setIdeas((items) => items.filter((item) => item.id !== target.id)); setDeletingAdmin(null); }} />}
      {editingAdmin && <IssueEditForm heading="Edit idea" issue={editingAdmin} onSubmit={async (title, description, attachmentUrls, newAttachments) => { const urls = await updateIssueContent(editingAdmin.id, title, description, attachmentUrls, newAttachments); setIdeas((items) => items.map((item) => item.id === editingAdmin.id ? { ...item, title, description, attachment_urls: urls } : item)); setEditingAdmin(null); }} onCancel={() => setEditingAdmin(null)} />}
      {deletingLocal && <ConfirmDialog title="Remove submission?" message="This pending idea will be permanently removed." onCancel={() => setDeletingLocal(null)} onConfirm={async () => { const target = deletingLocal; await softDeleteIssue(target.id); setIdeas((items) => items.filter((item) => item.id !== target.id)); setDeletingLocal(null); }} />}
      {editingLocal && <IssueEditForm issue={editingLocal} onSubmit={async (title, description, attachmentUrls, newAttachments) => { const urls = await updateIssueContent(editingLocal.id, title, description, attachmentUrls, newAttachments); setIdeas((items) => items.map((item) => item.id === editingLocal.id ? { ...item, title, description, attachment_urls: urls } : item)); setEditingLocal(null); }} onCancel={() => setEditingLocal(null)} />}
    </>
  );
}
