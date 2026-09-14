import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { Mod, ModWithVersions, Issue } from "../types";
import { fetchModById, fetchIssuesByMod, fetchModsWithVersions, getDownloadUrl, createIssue, updateIssueStatus, deleteIssue } from "../lib/data";
import { useAuth } from "../context/AuthContext";
import IssueForm from "../components/IssueForm";
import IssueList from "../components/IssueList";
import MarkdownText from "../components/MarkdownText";

export default function ModDetail() {
  const { modId } = useParams<{ modId: string }>();
  const [mod, setMod] = useState<ModWithVersions | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const { session } = useAuth();

  const refresh = async () => {
    if (!modId) return;
    const [m, i, allMods] = await Promise.all([fetchModById(modId), fetchIssuesByMod(modId), fetchModsWithVersions()]);
    setMod(m);
    setIssues(i);
    setMods(allMods);
  };

  useEffect(() => {
    if (!modId) return;
    setLoading(true);
    refresh().catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [modId]);

  if (loading) return <p className="load-state">Loading…</p>;
  if (error) return <div className="error-state">Couldn't load this mod. {error}</div>;
  if (!mod) return <p className="empty-state">Mod not found.</p>;

  const latest = mod.mod_versions[0];

  return (
    <>
      <Link className="back-link" to="/lucidblocks/mods">← Mods</Link>
      <div className="mod-head">
        <span className="slot-glyph">{mod.name.charAt(0)}</span>
        <div>
          <h1>{mod.name} <span className="mod-author">by {mod.author || "Putzwirk"}</span></h1>
          <p className="intro intro-tight">{mod.tagline}</p>
        </div>
      </div>
      {latest && (
        <div className="mod-meta-row">
          <span>latest v{latest.version}</span>
          <span>Lucid Blocks v.{latest.game_version}</span>
          <a className="btn btn-accent btn-sm" href={getDownloadUrl(latest.storage_path)} download>Download latest</a>
          {(mod.required_mods ?? []).length > 0 && (
            <span className="requires-box">
              <span className="dependency-label">Requires</span>
              {(mod.required_mods ?? []).map((slug) => {
                const target = mods.find((candidate) => candidate.id === slug);
                return (
                  <Link key={slug} className="btn btn-sm dependency-btn" to={`/lucidblocks/mods/${slug}`}>
                    {target?.name ?? slug}
                  </Link>
                );
              })}
            </span>
          )}
        </div>
      )}
      {mod.description && (
        <div className="mod-description"><MarkdownText text={mod.description} issues={issues} mods={mods} /></div>
      )}
      <section>
        <h2>Versions</h2>
        {mod.mod_versions.length === 0 ? (
          <p className="empty-state">No versions published yet.</p>
        ) : (
          mod.mod_versions.map((v, i) => (
            <details key={v.id} className="version-entry" open={i === 0}>
              <summary className="version-summary">
                <span className="version-summary-left">
                  <span className="chip chip-version">v{v.version}</span>
                  <span className="chip">Lucid Blocks v.{v.game_version}</span>
                  <span className="chip version-date">{v.release_date}</span>
                </span>
                <svg className="chevron" width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <div className="version-body">
                <div className="changelog">
                  <MarkdownText text={v.changelog.join("\n")} issues={issues} mods={mods} />
                </div>
                <a className="btn btn-accent btn-sm download-btn" href={getDownloadUrl(v.storage_path)} download><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2v8" /><path d="M4.5 7 8 10.5 11.5 7" /><path d="M3 13h10" /></svg>Download {v.pck_filename}</a>
              </div>
            </details>
          ))
        )}
      </section>
      <section>
        <div className="section-head">
          <h2>Issues ({issues.filter((i) => i.status === "open").length} open)</h2>
          <button className="btn btn-sm report-btn" onClick={() => setShowIssueForm(!showIssueForm)}>{showIssueForm ? "Cancel" : "Report an issue"}</button>
        </div>
        {showIssueForm && (
          <IssueForm initialType="bug" allowTypeChoice referenceIssues={issues} referenceMods={mods} onSubmit={async (title, desc, author, type, attachments) => { const pendingIssue = await createIssue({ mod_id: mod.id, type, title, description: desc, author_name: author, attachments }); setIssues((items) => [pendingIssue, ...items]); setShowIssueForm(false); }} />
        )}
        <IssueList issues={issues} isAdmin={!!session} onStatusChange={async (id, status) => { await updateIssueStatus(id, status); const refreshed = await fetchIssuesByMod(mod.id); setIssues(refreshed); }} onDelete={async (id) => { await deleteIssue(id); const refreshed = await fetchIssuesByMod(mod.id); setIssues(refreshed); }} onEdit={async () => { const refreshed = await fetchIssuesByMod(mod.id); setIssues(refreshed); }} />
      </section>
    </>
  );
}
