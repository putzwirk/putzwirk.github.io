import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Issue, IssueComment, IssueEvent, IssueState, Mod, ModVersion, ModWithVersions } from "../types";
import { createComment, deleteIssue, fetchAllPublicIssues, fetchComments, fetchIssueById, fetchIssueEvents, fetchModById, fetchModsWithVersions, fetchMyVotes, subscribeToIssue, toggleVote, updateIssueState } from "../lib/data";
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

export default function IssueDetail() {
  const { issueId } = useParams<{ issueId: string }>();
  const navigate = useNavigate();
  const { isStaff } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [events, setEvents] = useState<IssueEvent[]>([]);
  const [versions, setVersions] = useState<ModVersion[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [allIssues, setAllIssues] = useState<Issue[]>([]);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!issueId) return;
    const fetched = await fetchIssueById(issueId);
    setDetail(fetched);
    if (!fetched) return;
    const [nextComments, nextEvents] = await Promise.all([fetchComments(issueId), fetchIssueEvents(issueId)]);
    setComments(nextComments);
    setEvents(nextEvents);
    if (fetched.issue.mod_id) {
      const mod = await fetchModById(fetched.issue.mod_id);
      setVersions(mod?.mod_versions ?? []);
    }
  }, [issueId]);

  useEffect(() => {
    if (!issueId) return;
    setLoading(true);
    load().catch((e) => setError(e instanceof Error ? e.message : "Could not load this issue.")).finally(() => setLoading(false));
    const unsubscribe = subscribeToIssue(issueId, () => { load().catch(() => undefined); });
    return unsubscribe;
  }, [issueId, load]);

  useEffect(() => {
    fetchModsWithVersions().then((items) => setMods(items as ModWithVersions[])).catch(() => undefined);
    fetchAllPublicIssues().then(setAllIssues).catch(() => undefined);
    fetchMyVotes().then(setVotedIds).catch(() => undefined);
  }, []);

  if (loading) return <p className="load-state">Loading</p>;
  if (error) return <div className="error-state">Couldn't load this issue. {error}</div>;
  if (!detail) return <p className="empty-state">Issue not found, or it is still awaiting moderation.</p>;

  const { issue, modName } = detail;
  const isIdea = issue.type === "idea";
  const voted = votedIds.has(issue.id);
  const backHref = issue.mod_id ? `/lucidblocks/mods/${issue.mod_id}` : "/lucidblocks/ideas";
  const backLabel = issue.mod_id ? `← ${modName ?? "Mod"}` : "← Ideas";

  const handleVote = async () => {
    try {
      const count = await toggleVote(issue.id);
      setDetail((current) => current ? { ...current, issue: { ...current.issue, votes: count } } : current);
      setVotedIds((current) => { const next = new Set(current); if (next.has(issue.id)) next.delete(issue.id); else next.add(issue.id); return next; });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vote failed.");
    }
  };

  const changeState = async (state: IssueState, fixedInVersionId: string | null) => {
    try {
      await updateIssueState(issue.id, state, fixedInVersionId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the state.");
    }
  };

  return (
    <>
      <Link className="back-link" to={backHref}>{backLabel}</Link>
      <div className="issue-detail-head">
        <div className="issue-row-head">
          <span className={`type-badge ${isIdea ? "type-feature" : "type-bug"}`}>{isIdea ? "Feature" : "Bug"}</span>
          <h1 className="issue-detail-title">{issue.title}</h1>
        </div>
        <div className="issue-detail-meta">
          <IssueStateBadge state={issue.state} />
          {issue.moderation_status === "pending" && <span className="pending-label">pending moderation</span>}
          <span>by {issue.author_name}</span>
          <span>{formatDateTime(issue.created_at)}</span>
          {modName && <span className="chip">{modName}</span>}
          <span>{issue.comment_count ?? comments.filter((c) => c.moderation_status === "approved").length} comment{(issue.comment_count ?? 0) === 1 ? "" : "s"}</span>
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
              <select className="form-input" value={issue.state ?? "open"} onChange={(event) => { const next = event.target.value as IssueState; changeState(next, next === "fixed" ? (issue.fixed_in_version_id ?? versions[0]?.id ?? null) : null); }}>
                {ISSUE_STATES.map((state) => <option key={state} value={state}>{issueStateLabel(state)}</option>)}
              </select>
            </label>
            {issue.state === "fixed" && versions.length > 0 && (
              <label className="issue-detail-state">
                Fixed in
                <select className="form-input" value={issue.fixed_in_version_id ?? versions[0]?.id ?? ""} onChange={(event) => changeState("fixed", event.target.value || null)}>
                  {versions.map((version) => <option key={version.id} value={version.id}>v{version.version}</option>)}
                </select>
              </label>
            )}
            <button className="btn btn-sm issue-delete-btn" type="button" onClick={() => setConfirmDelete(true)}>Delete issue</button>
          </div>
        )}
      </div>

      {issue.description && <div className="issue-detail-body"><MarkdownText text={issue.description} issues={allIssues} mods={mods} /></div>}
      {issue.attachment_urls?.length > 0 && <AttachmentGallery urls={issue.attachment_urls} />}

      {events.length > 0 && (
        <section className="issue-timeline">
          <h2>Activity</h2>
          <ul className="event-list">
            {events.map((event) => (
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
        </section>
      )}

      <section className="issue-discussion">
        <h2>Discussion</h2>
        <CommentThread comments={comments} isStaff={isStaff} commentsClosed={issue.status === "closed"} referenceIssues={allIssues} referenceMods={mods} onChanged={load} />
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
