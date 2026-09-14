import { useEffect, useMemo, useRef, useState } from "react";
import type { Issue, Mod } from "../types";
import { fetchIdeas, fetchAllPublicIssues, fetchModsWithVersions, createIssue, voteForIdea, updateIssueStatus, deleteIssue, updateIssueContent } from "../lib/data";
import { removePendingIssue, updatePendingIssue } from "../lib/pendingIssues";
import { uploadIssueAttachments } from "../lib/issueAttachments";
import { useAuth } from "../context/AuthContext";
import IssueForm from "../components/IssueForm";
import MarkdownText from "../components/MarkdownText";
import AttachmentGallery from "../components/AttachmentGallery";
import ConfirmDialog from "../components/ConfirmDialog";
import IssueEditForm from "../components/IssueEditForm";
import { formatDateTime } from "../lib/formatDate";
import { centerAfterRender } from "../lib/centerScroll";

function loadVotedIds(): Set<string> {
  try {
    const stored = localStorage.getItem("voted_ideas");
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed as string[] : []);
  } catch {
    return new Set();
  }
}

export default function Ideas() {
  const [ideas, setIdeas] = useState<Issue[]>([]);
  const [mentionIssues, setMentionIssues] = useState<Issue[]>([]);
  const [mentionMods, setMentionMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [expandedClosed, setExpandedClosed] = useState<Set<string>>(new Set());
  const [editingLocal, setEditingLocal] = useState<Issue | null>(null);
  const [deletingLocal, setDeletingLocal] = useState<Issue | null>(null);
  const [editingAdmin, setEditingAdmin] = useState<Issue | null>(null);
  const [deletingAdmin, setDeletingAdmin] = useState<Issue | null>(null);
  const { session } = useAuth();
  const ideaFormRef = useRef<HTMLDivElement>(null);
  const sortedIdeas = useMemo(() => [...ideas].sort((a, b) => (a.status === b.status ? 0 : a.status === "closed" ? 1 : -1)), [ideas]);

  useEffect(() => {
    setVotedIds(loadVotedIds());
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

  const handleVote = async (id: string) => {
    if (votedIds.has(id)) return;
    try {
      await voteForIdea(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vote failed.");
      return;
    }
    const newSet = new Set(votedIds);
    newSet.add(id);
    setVotedIds(newSet);
    try {
      localStorage.setItem("voted_ideas", JSON.stringify([...newSet]));
    } catch {
      return;
    }
    loadIdeas();
  };

  if (loading) return <p className="load-state">Loading ideas</p>;
  if (error) return <div className="error-state">Couldn't load ideas. {error}</div>;

  return (
    <>
      <div className="ideas-intro">
        <div>
          <h1>Ideas</h1>
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
        ) : (
          <ul className="issue-list">
            {sortedIdeas.map((idea) => (
              <li id={`issue-${idea.id}`} key={idea.id} className={`issue-row ${idea.status === "closed" ? "issue-row-closed" : ""}`}>
                <div className="issue-row-content">
                  <div className="issue-row-head">
                    <span className={`type-badge ${idea.type === "bug" ? "type-bug" : "type-feature"}`}>{idea.type === "bug" ? "Bug" : "Feature"}</span>
                    <span className="issue-row-title">{idea.title}{idea.moderation_status === "pending" && <span className="pending-label">pending moderation</span>}</span>
                  </div>
                  {idea.description && (idea.status !== "closed" || expandedClosed.has(idea.id)) && <div className="issue-row-desc"><MarkdownText text={idea.description} issues={ideas} /></div>}
                  {idea.attachment_urls?.length > 0 && (idea.status !== "closed" || expandedClosed.has(idea.id)) && <AttachmentGallery urls={idea.attachment_urls} />}
                  {idea.status === "closed" && (idea.description?.trim() || (idea.attachment_urls?.length ?? 0) > 0) && <button className="btn btn-sm issue-details-toggle" onClick={() => setExpandedClosed((current) => { const next = new Set(current); if (next.has(idea.id)) next.delete(idea.id); else next.add(idea.id); return next; })}>{expandedClosed.has(idea.id) ? "Hide details" : "Show details"}</button>}
                  <div className="issue-row-meta">
                    {idea.status === "open" && <button className={`vote-btn ${votedIds.has(idea.id) ? "voted" : ""}`} onClick={() => handleVote(idea.id)} disabled={votedIds.has(idea.id)}>↑ {idea.votes} {votedIds.has(idea.id) ? "voted" : "vote"}</button>}
                    <span>by {idea.author_name}</span>
                    <span>{formatDateTime(idea.created_at)}</span>
                    {idea.status === "closed" && <span>closed</span>}
                    {session && (
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
                    {idea.moderation_status === "pending" && <div className="issue-actions"><button className="btn btn-sm issue-action-btn" onClick={() => setEditingLocal(idea)}>Edit</button><button className="btn btn-sm issue-delete-btn" onClick={() => setDeletingLocal(idea)}>Remove</button></div>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {deletingAdmin && <ConfirmDialog title="Delete idea?" message={`Delete "${deletingAdmin.title}" permanently?`} onCancel={() => setDeletingAdmin(null)} onConfirm={async () => { await deleteIssue(deletingAdmin.id); removePendingIssue(deletingAdmin.id); setIdeas((items) => items.filter((item) => item.id !== deletingAdmin.id)); setDeletingAdmin(null); }} />}
      {editingAdmin && <IssueEditForm heading="Edit idea" issue={editingAdmin} onSubmit={async (title, description, attachmentUrls, newAttachments) => { const urls = await updateIssueContent(editingAdmin.id, title, description, attachmentUrls, newAttachments); updatePendingIssue(editingAdmin.id, { title, description, attachment_urls: urls }); setIdeas((items) => items.map((item) => item.id === editingAdmin.id ? { ...item, title, description, attachment_urls: urls } : item)); setEditingAdmin(null); }} onCancel={() => setEditingAdmin(null)} />}
      {deletingLocal && <ConfirmDialog title="Remove idea submission?" message="This pending idea will be permanently removed." onCancel={() => setDeletingLocal(null)} onConfirm={async () => { await deleteIssue(deletingLocal.id); removePendingIssue(deletingLocal.id); setIdeas((items) => items.filter((item) => item.id !== deletingLocal.id)); setDeletingLocal(null); }} />}
      {editingLocal && <IssueEditForm issue={editingLocal} onSubmit={async (title, description, attachmentUrls, newAttachments) => { const urls = [...attachmentUrls, ...(await uploadIssueAttachments(newAttachments))]; updatePendingIssue(editingLocal.id, { title, description, attachment_urls: urls }); setIdeas((items) => items.map((item) => item.id === editingLocal.id ? { ...item, title, description, attachment_urls: urls } : item)); setEditingLocal(null); }} onCancel={() => setEditingLocal(null)} />}
    </>
  );
}
