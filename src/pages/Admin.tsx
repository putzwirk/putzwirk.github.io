import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { ModWithVersions, ModVersion } from "../types";
import { fetchModsWithVersions, createMod, updateMod, deleteMod, createVersion, updateVersion, deleteVersion, fetchPendingIssues, moderateIssue, updateIssueContent } from "../lib/data";
import type { Issue } from "../types";
import ModForm from "../components/ModForm";
import VersionForm from "../components/VersionForm";
import AttachmentGallery from "../components/AttachmentGallery";
import MarkdownText from "../components/MarkdownText";
import IssueEditForm from "../components/IssueEditForm";
import ConfirmDialog from "../components/ConfirmDialog";
import { formatDateTime } from "../lib/formatDate";
import { centerAfterRender } from "../lib/centerScroll";
import { supabase } from "../lib/supabase";

export default function Admin({ submissionsOnly = false }: { submissionsOnly?: boolean }) {
  const { isStaff, loading: authLoading } = useAuth();
  const location = useLocation();
  const submissionsPage = submissionsOnly || location.pathname.endsWith("/submissions");
  const [mods, setMods] = useState<ModWithVersions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModForm, setShowModForm] = useState(false);
  const [editingMod, setEditingMod] = useState<ModWithVersions | null>(null);
  const [versionTarget, setVersionTarget] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<ModVersion | null>(null);
  const [pendingIssues, setPendingIssues] = useState<Issue[]>([]);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [deletingMod, setDeletingMod] = useState<ModWithVersions | null>(null);
  const [deletingVersion, setDeletingVersion] = useState<ModVersion | null>(null);
  const modFormRef = useRef<HTMLDivElement>(null);
  const versionFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showModForm) centerAfterRender(modFormRef);
  }, [showModForm]);

  useEffect(() => {
    if (versionTarget || editingVersion) centerAfterRender(versionFormRef);
  }, [versionTarget, editingVersion]);

  useEffect(() => { if (isStaff) { loadMods(); fetchPendingIssues().then(setPendingIssues).catch((e) => setError(e.message)); } }, [isStaff]);

  useEffect(() => {
    if (!isStaff) return;
    const channel = supabase
      .channel("admin-issues")
      .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, () => {
        fetchPendingIssues().then(setPendingIssues).catch(() => undefined);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "issue_comments" }, () => {
        fetchPendingIssues().then(setPendingIssues).catch(() => undefined);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isStaff]);

  const loadMods = () => {
    setLoading(true);
    fetchModsWithVersions().then(setMods).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  if (authLoading) return <p className="load-state">Loading</p>;
  if (!isStaff) return <Navigate to="/lucidblocks/login" replace />;

  return (
    <>
      <div className="section-head admin-manage-head">
        <h1>{submissionsPage ? "Submissions" : "Manage Mods"}</h1>
        {!submissionsPage && <button className="btn btn-accent admin-add-mod-btn" onClick={() => { setEditingMod(null); setShowModForm(true); }}>Add Mod</button>}
      </div>
      {error && <div className="error-state">{error}</div>}
      {submissionsPage && <section className="moderation-panel">{pendingIssues.map((issue) => <article className="moderation-item" key={issue.id}><div className="issue-row-content"><div className="issue-row-title">{issue.title}</div><div className="issue-row-desc"><MarkdownText text={issue.description} issues={pendingIssues} mods={mods} /></div><div className="issue-row-meta"><span>{issue.type}</span><span>by {issue.author_name}</span><span>{formatDateTime(issue.created_at)}</span></div>{issue.attachment_urls?.length > 0 && <AttachmentGallery urls={issue.attachment_urls} />}</div><div className="admin-controls"><button className="btn btn-sm" onClick={() => setEditingIssue(issue)}>Edit</button><button className="btn btn-accent btn-sm" onClick={async () => { await moderateIssue(issue.id, "approved"); setPendingIssues((items) => items.filter((item) => item.id !== issue.id)); }}>Approve</button><button className="btn btn-sm" onClick={async () => { await moderateIssue(issue.id, "rejected"); setPendingIssues((items) => items.filter((item) => item.id !== issue.id)); }}>Reject</button></div></article>)}</section>}
      {editingIssue && <IssueEditForm issue={editingIssue} onSubmit={async (title, description, attachmentUrls, newAttachments) => { const urls = await updateIssueContent(editingIssue.id, title, description, attachmentUrls, newAttachments); setPendingIssues((items) => items.map((item) => item.id === editingIssue.id ? { ...item, title, description, attachment_urls: urls } : item)); setEditingIssue(null); }} onCancel={() => setEditingIssue(null)} />}
      {!submissionsPage && <>
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
          <VersionForm modId={editingVersion.mod_id} initial={editingVersion} onSubmit={async (versionData, file) => { await updateVersion(editingVersion.id, { version: versionData.version, game_version: versionData.game_version, release_date: versionData.release_date, changelog: versionData.changelog }, file, editingVersion.mod_id); setEditingVersion(null); loadMods(); }} onCancel={() => setEditingVersion(null)} />
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
                <button className="btn btn-accent btn-sm" onClick={() => { setEditingVersion(null); setVersionTarget(mod.id); }}>Add Version</button>
                <button className="btn btn-sm" onClick={() => setDeletingMod(mod)}>Delete</button>
              </div>
              {mod.mod_versions.length > 0 && (
                <ul className="admin-version-list">
                  {mod.mod_versions.map((v) => (
                    <li key={v.id} className="admin-version-row">
                      <span className="chip chip-version">v{v.version}</span>
                      <span className="chip">Lucid Blocks v.{v.game_version}</span>
                      <span className="admin-version-date">{v.release_date}</span>
                      <span className="admin-version-actions">
                        <button className="btn btn-ghost btn-sm admin-version-edit-btn" onClick={() => { setVersionTarget(null); setEditingVersion(v); }}>Edit</button>
                        <button className="btn btn-ghost btn-sm admin-version-delete-btn" onClick={() => setDeletingVersion(v)}>Delete</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      </>}
      {submissionsPage && pendingIssues.length === 0 && <p className="empty-state">There are no pending submissions.</p>}
      {deletingMod && <ConfirmDialog title="Delete mod?" message={`Delete "${deletingMod.name}" and all its versions?`} onCancel={() => setDeletingMod(null)} onConfirm={async () => { await deleteMod(deletingMod.id); setDeletingMod(null); loadMods(); }} />}
      {deletingVersion && <ConfirmDialog title="Delete version?" message={`Delete version ${deletingVersion.version}?`} onCancel={() => setDeletingVersion(null)} onConfirm={async () => { await deleteVersion(deletingVersion); setDeletingVersion(null); loadMods(); }} />}
    </>
  );
}
