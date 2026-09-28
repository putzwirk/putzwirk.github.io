import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Issue, IssueComment, IssueEvent, IssueState } from "../types";
import { createComment, deleteIssue, fetchMinecraftIssues, fetchComments, fetchIssueById, fetchIssueEvents, fetchMyVotes, subscribeToIssue, toggleVote, updateIssueState } from "../lib/data";
import { MC_IDEAS_MOD_ID, mcModId } from "../lib/minecraft";
import { useAuth } from "../context/AuthContext";
import MarkdownText from "../components/MarkdownText";
import AttachmentGallery from "../components/AttachmentGallery";
import CommentThread from "../components/CommentThread";
import CommentComposer from "../components/CommentComposer";
import ConfirmDialog from "../components/ConfirmDialog";
import IssueStateBadge from "../components/IssueStateBadge";
import { formatDateTime } from "../lib/formatDate";
import { ISSUE_STATES, issueStateLabel } from "../lib/issueState";

interface Detail {
  issue: Issue;
  modName: string | null;
}

export default function MinecraftIssueDetail() {
  const { slug, issueId } = useParams<{ slug: string; issueId: string }>();
  const navigate = useNavigate();
  const { isStaff } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [events, setEvents] = useState<IssueEvent[]>([]);
  const [allIssues, setAllIssues] = useState<Issue[]>([]);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [draftState, setDraftState] = useState<IssueState | null>(null);
  const backHref = slug ? `/minecraft/mods/${slug}` : "/minecraft/ideas";
  const backLabel = slug ? null : "Ideas";

  const load = useCallback(async () => {
    if (!issueId) return;
    const fetched = await fetchIssueById(issueId);
    const expectedModId = slug ? mcModId(slug) : MC_IDEAS_MOD_ID;
    if (fetched && fetched.issue.mod_id !== expectedModId) {
      setDetail(null);
      return;
    }
    setDetail(fetched);
    if (!fetched) return;
    const [nextComments, nextEvents] = await Promise.all([fetchComments(issueId), fetchIssueEvents(issueId)]);
    setComments(nextComments);
    setEvents(nextEvents);
  }, [issueId, slug]);

  useEffect(() => {
    if (!issueId) return;
    setLoading(true);
    load().catch((e) => setError(e instanceof Error ? e.message : "Could not load this issue.")).finally(() => setLoading(false));
    const unsubscribe = subscribeToIssue(issueId, () => { load().catch(() => undefined); });
    return unsubscribe;
  }, [issueId, load]);

  useEffect(() => {
    fetchMinecraftIssues().then(setAllIssues).catch(() => undefined);
    fetchMyVotes().then(setVotedIds).catch(() => undefined);
  }, []);

  if (loading) return <p className="load-state">Loading</p>;
  if (error) return <div className="error-state">Couldn't load this issue. {error}</div>;
  if (!detail) {
    return (
      <>
        <Link className="back-link" to={backHref}>← {backLabel ?? "Mod"}</Link>
        <p className="empty-state">Issue not found, or it is still awaiting moderation.</p>
      </>
    );
  }

  const { issue, modName } = detail;
  const isIdea = issue.type === "idea";
  const voted = votedIds.has(issue.id);
  const commentCount = issue.comment_count ?? comments.filter((comment) => comment.moderation_status === "approved").length;
  const resolvedDraftState = draftState ?? issue.state ?? "open";
  const pendingStateChange = resolvedDraftState !== (issue.state ?? "open");

  const handleVote = async () => {
    try {
      const count = await toggleVote(issue.id);
      setDetail((current) => current ? { ...current, issue: { ...current.issue, votes: count } } : current);
      setVotedIds((current) => { const next = new Set(current); if (next.has(issue.id)) next.delete(issue.id); else next.add(issue.id); return next; });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vote failed.");
    }
  };

  return (
    <>
      <Link className="back-link" to={backHref}>← {backLabel ?? modName ?? "Mod"}</Link>
      <div className="issue-detail-head">
        <div className="issue-row-head">
          <span className={`type-badge ${isIdea ? "type-feature" : "type-bug"}`}>{isIdea ? "Feature" : "Bug"}</span>
          <h1 className="issue-detail-title">{issue.title}</h1>
        </div>
        <div className="issue-detail-meta">
          <IssueStateBadge state={issue.state} type={issue.type} fixedInVersion={undefined} />
          {issue.moderation_status === "pending" && <span className="pending-label">pending moderation</span>}
          <span>by {issue.author_name}</span>
          <span>{formatDateTime(issue.created_at)}</span>
          {modName && <span className="chip">{modName}</span>}
          <span>{commentCount} comment{commentCount === 1 ? "" : "s"}</span>
          {isIdea && issue.status === "open" && (
            <button className={`vote-btn ${voted ? "voted" : ""}`} type="button" onClick={handleVote}>↑ {issue.votes} {voted ? "voted" : "vote"}</button>
          )}
        </div>
        {issue.moderation_reason && (
          <p className="moderation-note">
            <span className="moderation-note-label">Moderation note</span>
            <span>{issue.moderation_reason}</span>
          </p>
        )}
        {isStaff && (
          <div className="issue-detail-staff">
            <label className="issue-detail-state">
              State
              <select className="form-input" value={resolvedDraftState} onChange={(event) => setDraftState(event.target.value as IssueState)}>
                {ISSUE_STATES.map((state) => <option key={state} value={state}>{issueStateLabel(state)}</option>)}
              </select>
            </label>
            {pendingStateChange && (
              <button className="btn btn-accent btn-sm" type="button" onClick={async () => { try { await updateIssueState(issue.id, resolvedDraftState, null); await load(); setDraftState(null); } catch (e) { setError(e instanceof Error ? e.message : "Could not update the state."); } }}>Confirm</button>
            )}
            {draftState !== null && (
              <button className="btn btn-sm" type="button" onClick={() => setDraftState(null)}>Reset</button>
            )}
            <button className="btn issue-delete-btn issue-detail-delete" type="button" onClick={() => setConfirmDelete(true)}>Delete issue</button>
          </div>
        )}
      </div>

      {issue.description && <div className="issue-detail-body"><MarkdownText text={issue.description} issues={allIssues} mods={[]} /></div>}
      {issue.attachment_urls?.length > 0 && <AttachmentGallery urls={issue.attachment_urls} />}

      {events.length > 0 && (
        <section className="issue-timeline">
          <h2>Activity</h2>
          <ul className="event-list">
            {(showAllEvents ? events : events.slice(-3)).map((event) => (
              <li key={event.id} className="event-row">
                <span className="event-dot" aria-hidden="true" />
                <span className="event-text">
                  {event.actor_name && <b className="event-actor">{event.actor_name}{" "}</b>}
                  {event.event === "state_change" && <>changed state from <b>{issueStateLabel(event.from_state as IssueState)}</b> to <b>{issueStateLabel(event.to_state as IssueState)}</b></>}
                  {event.event === "moderation" && <>moderated this issue{issue.moderation_reason && <span className="event-reason"> — {issue.moderation_reason}</span>}</>}
                  {event.event === "fixed_in" && <>marked this as fixed in a version</>}
                </span>
                <span className="event-time">{formatDateTime(event.created_at)}</span>
              </li>
            ))}
          </ul>
          {events.length > 3 && (
            <button className="btn btn-sm issue-action-btn event-toggle" type="button" onClick={() => setShowAllEvents((value) => !value)}>
              {showAllEvents ? "Show less" : `Show all ${events.length}`}
            </button>
          )}
        </section>
      )}

      <section className="issue-discussion">
        <h2>Discussion</h2>
        <CommentThread comments={comments} isStaff={isStaff} commentsClosed={issue.status === "closed"} referenceIssues={allIssues} referenceMods={[]} onChanged={load} />
        {issue.status === "closed" ? (
          <p className="comments-closed">Comments are closed on this issue.</p>
        ) : (
          <CommentComposer
            placeholder="Add a comment"
            onSubmit={async (body, authorName) => {
              await createComment(issue.id, body, authorName, null);
              await load();
            }}
          />
        )}
      </section>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete issue?"
          message={`Delete "${issue.title}" permanently?`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => { await deleteIssue(issue.id); setConfirmDelete(false); navigate(backHref); }}
        />
      )}
    </>
  );
}
