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
          <a className="btn btn-sm qualia-btn" href="https://github.com/MarcyMarbles/Qualia-Mods/releases" target="_blank" rel="noopener"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>Requires QualiaMods</a>
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
