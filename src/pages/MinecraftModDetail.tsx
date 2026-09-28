import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Issue } from "../types";
import { createIssue, deleteIssue, fetchAllPublicIssues, fetchIssuesByMod, updateIssueStatus } from "../lib/data";
import { compareGameVersions, fetchMcModDetail, htmlToText, mcModId, type McMod, type McVersion } from "../lib/minecraft";
import { centerAfterRender } from "../lib/centerScroll";
import { formatDateTime } from "../lib/formatDate";
import { useAuth } from "../context/AuthContext";
import IssueForm from "../components/IssueForm";
import IssueList from "../components/IssueList";
import LoaderTag from "../components/LoaderTag";
import MarkdownText from "../components/MarkdownText";

export default function MinecraftModDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [mod, setMod] = useState<McMod | null>(null);
  const [versions, setVersions] = useState<McVersion[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [referenceIssues, setReferenceIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueTab, setIssueTab] = useState<"open" | "closed">("open");
  const [loaderFilter, setLoaderFilter] = useState<string>("all");
  const [gameFilter, setGameFilter] = useState<string>("all");
  const issueFormRef = useRef<HTMLDivElement>(null);
  const { isStaff } = useAuth();
  const modId = slug ? mcModId(slug) : "";

  useEffect(() => {
    if (showIssueForm) centerAfterRender(issueFormRef);
  }, [showIssueForm]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    Promise.all([fetchMcModDetail(slug), fetchIssuesByMod(mcModId(slug)).catch(() => [] as Issue[]), fetchAllPublicIssues().catch(() => [] as Issue[])])
      .then(([detail, modIssues, allIssues]) => {
        setMod(detail.mod);
        setVersions(detail.versions);
        setIssues(modIssues);
        setReferenceIssues(allIssues.length > 0 ? allIssues : modIssues);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load this mod."))
      .finally(() => setLoading(false));
  }, [slug]);

  const loaders = useMemo(() => {
    const seen = new Set<string>();
    for (const v of versions) for (const loader of v.loaders) seen.add(loader.toLowerCase());
    return [...seen].sort();
  }, [versions]);

  const visibleVersions = useMemo(() => {
    return versions
      .filter((v) => loaderFilter === "all" || v.loaders.some((loader) => loader.toLowerCase() === loaderFilter))
      .filter((v) => gameFilter === "all" || v.gameVersions.includes(gameFilter))
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [versions, loaderFilter, gameFilter]);

  if (loading) return <p className="load-state">Loading</p>;
  if (error) return <div className="error-state">Couldn't load this mod. {error}</div>;
  if (!mod) {
    return (
      <>
        <Link className="back-link" to="/minecraft/mods">← Mods</Link>
        <p className="empty-state">Mod not found.</p>
      </>
    );
  }

  const openIssues = issues.filter((item) => item.status === "open");
  const closedIssues = issues.filter((item) => item.status === "closed");
  const visibleIssues = issueTab === "open" ? openIssues : closedIssues;
  const allGames = [...new Set(versions.flatMap((v) => v.gameVersions))].sort(compareGameVersions);

  return (
    <>
      <Link className="back-link" to="/minecraft/mods">← Mods</Link>
      <div className="mod-head">
        {mod.iconUrl ? (
          <img className="slot-glyph slot-glyph-img slot-glyph-lg" src={mod.iconUrl} alt="" width={64} height={64} />
        ) : (
          <span className="slot-glyph">{mod.title.charAt(0)}</span>
        )}
        <div>
          <h1>{mod.title} <span className="mod-author">by Neuromuser</span></h1>
          <p className="intro intro-tight">{mod.description}</p>
        </div>
      </div>
      <div className="mod-meta-row">
        <span className="chip">{mod.downloads.toLocaleString()} downloads</span>
        {mod.type === "modpack" && <span className="chip">modpack</span>}
        {mod.loaders.map((loader) => <LoaderTag key={loader} loader={loader} />)}
      </div>
      {allGames.length > 0 && (
        <p className="mc-version-list">MC {allGames.join(", ")}</p>
      )}
      {mod.longDescription.trim() && (
        <div className="mod-description"><MarkdownText text={htmlToText(mod.longDescription)} issues={referenceIssues} mods={[]} /></div>
      )}

      <section>
        <h2>Versions</h2>
        <div className="version-filter-row">
          <button type="button" className={`loader-filter${loaderFilter === "all" ? " active" : ""}`} onClick={() => setLoaderFilter("all")}>All loaders</button>
          {loaders.map((loader) => (
            <button key={loader} type="button" className={`loader-filter${loaderFilter === loader ? " active" : ""}`} onClick={() => setLoaderFilter(loaderFilter === loader ? "all" : loader)}>{loader}</button>
          ))}
          <select className="form-select form-input" value={gameFilter} onChange={(event) => setGameFilter(event.target.value)} aria-label="Filter by Minecraft version">
            <option value="all">All Minecraft versions</option>
            {allGames.map((game) => <option key={game} value={game}>MC {game}</option>)}
          </select>
        </div>
        {visibleVersions.length === 0 ? (
          <p className="empty-state">No versions found.</p>
        ) : (
          visibleVersions.map((v, i) => (
            <details key={v.id} className="version-entry" open={i === 0}>
              <summary className="version-summary">
                <span className="version-summary-left">
                  {v.versionNumber && <span className="chip chip-version">v{v.versionNumber}</span>}
                  {v.gameVersions.slice(-2).reverse().map((game) => <span className="chip" key={game}>MC {game}</span>)}
                  {v.loaders.slice(0, 2).map((loader) => <LoaderTag key={loader} loader={loader} />)}
                  <span className="chip version-date">{formatDateTime(v.date)}</span>
                  <span className="chip">{v.downloads.toLocaleString()} downloads</span>
                </span>
                <svg className="chevron" width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <div className="version-body">
                <div className="changelog">
                  {v.changelog ? (
                    <MarkdownText text={v.changelog} issues={referenceIssues} mods={[]} />
                  ) : (
                    <MarkdownText text={v.name} issues={referenceIssues} mods={[]} />
                  )}
                </div>
                <a className="btn btn-accent btn-sm download-btn" href={v.url} target="_blank" rel="noreferrer">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2v8" /><path d="M4.5 7 8 10.5 11.5 7" /><path d="M3 13h10" /></svg>
                  Get on CurseForge · {v.filename}
                </a>
              </div>
            </details>
          ))
        )}
      </section>

      <section>
        <div className="section-head">
          <div className="section-title-row">
            <h2>Issues</h2>
            <div className="list-tabs" role="tablist" aria-label="Issue status">
              <button type="button" role="tab" aria-selected={issueTab === "open"} className={issueTab === "open" ? "active" : ""} onClick={() => setIssueTab("open")}>Open<span className="chip tab-count">{openIssues.length}</span></button>
              <button type="button" role="tab" aria-selected={issueTab === "closed"} className={issueTab === "closed" ? "active" : ""} onClick={() => setIssueTab("closed")}>Solved<span className="chip tab-count">{closedIssues.length}</span></button>
            </div>
          </div>
          <button className="btn btn-sm report-btn" onClick={() => setShowIssueForm(!showIssueForm)}>{showIssueForm ? "Cancel" : "Report an issue"}</button>
        </div>
        {showIssueForm && (
          <div ref={issueFormRef}>
            <IssueForm initialType="bug" allowTypeChoice referenceIssues={referenceIssues} referenceMods={[]} onSubmit={async (title, desc, author, type, attachments) => { const pendingIssue = await createIssue({ mod_id: modId, type, title, description: desc, author_name: author, attachments }); setIssues((items) => [pendingIssue, ...items]); setShowIssueForm(false); }} />
          </div>
        )}
        <IssueList issues={visibleIssues} issueBasePath={`/minecraft/mods/${slug}/issues`} emptyMessage={issueTab === "open" ? "No open issues for this mod." : "No solved issues yet."} isAdmin={isStaff} onStatusChange={async (id, status) => { await updateIssueStatus(id, status); const refreshed = await fetchIssuesByMod(modId); setIssues(refreshed); }} onDelete={async (id) => { await deleteIssue(id); const refreshed = await fetchIssuesByMod(modId); setIssues(refreshed); }} onEdit={async () => { const refreshed = await fetchIssuesByMod(modId); setIssues(refreshed); }} />
      </section>
    </>
  );
}
