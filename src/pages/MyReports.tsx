import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Issue } from "../types";
import { fetchMyIssues } from "../lib/data";
import { useAuth } from "../context/AuthContext";
import IssueStateBadge from "../components/IssueStateBadge";
import { formatDateTime } from "../lib/formatDate";
import { isPlainRowClick } from "../lib/rowClick";

export default function MyReports() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) { setIssues([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetchMyIssues()
      .then(setIssues)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your reports."))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="load-state">Loading your reports</p>;
  if (error) return <div className="error-state">Couldn't load your reports. {error}</div>;

  return (
    <>
      <div className="hero">
        <h1>My reports</h1>
      </div>
      {!session ? (
        <p className="empty-state">Sign in to see the issues and ideas you have submitted.</p>
      ) : issues.length === 0 ? (
        <p className="empty-state">You have not submitted anything yet.</p>
      ) : (
        <ul className="issue-list">
          {issues.map((issue) => (
            <li key={issue.id} className={`issue-row issue-row-clickable${issue.status === "closed" ? " issue-row-closed" : ""}`} onClick={(event) => { if (isPlainRowClick(event)) navigate(`/lucidblocks/issues/${issue.id}`); }}>
              <div className="issue-row-content">
                <div className="issue-row-head">
                  <span className={`type-badge ${issue.type === "bug" ? "type-bug" : "type-feature"}`}>{issue.type === "bug" ? "Bug" : "Feature"}</span>
                  <span className="issue-row-title">
                    <Link to={`/lucidblocks/issues/${issue.id}`}>{issue.title}</Link>
                    {issue.moderation_status === "pending" && <span className="pending-label">pending moderation</span>}
                    {issue.moderation_status === "rejected" && <span className="chip">rejected</span>}
                  </span>
                </div>
                <div className="issue-row-meta">
                  <IssueStateBadge state={issue.state} />
                  <span>{formatDateTime(issue.created_at)}</span>
                  <span>{issue.comment_count ?? 0} comment{(issue.comment_count ?? 0) === 1 ? "" : "s"}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
