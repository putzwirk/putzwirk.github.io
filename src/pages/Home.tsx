import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ModWithVersions } from "../types";
import { fetchModsWithVersions, fetchOpenIssueCounts } from "../lib/data";

export default function Home() {
  const [mods, setMods] = useState<ModWithVersions[]>([]);
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchModsWithVersions(), fetchOpenIssueCounts()])
      .then(([m, counts]) => {
        setMods(m);
        setIssueCounts(counts);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="load-state">Loading mods</p>;
  if (error) return <div className="error-state">Couldn't load mods. {error}</div>;

  return (
    <>
      <div className="hero">
        <h1>Mods</h1>
        <p className="intro">
          Mods for Lucid Blocks, built on QualiaMods. Pick one to see its versions,
          changelogs, and report issues.
        </p>
      </div>
      <div className="mod-grid">
        {mods.map((mod) => {
          const latest = mod.mod_versions[0];
          const openIssues = issueCounts[mod.id] ?? 0;
          return (
            <Link key={mod.id} className="mod-slot" to={`/lucidblocks/mods/${mod.id}`}>
              <div className="slot-glyph" aria-hidden="true">{mod.name.charAt(0)}</div>
              <div className="mod-slot-body">
                <div className="mod-slot-name">{mod.name}</div>
                <div className="mod-slot-author">by {mod.author || "Putzwirk"}</div>
                <div className="mod-slot-tagline">{mod.tagline}</div>
                <div className="mod-slot-chips">
                  {mod.ai_generated && <span className="chip chip-ai" title="Contains AI-generated content">AI</span>}
                  {latest && <span className="chip chip-version">v{latest.version}</span>}
                  {latest && <span className="chip">Lucid Blocks v.{latest.game_version}</span>}
                  {openIssues > 0 && (
                    <span className="chip chip-issues">{openIssues} open issue{openIssues === 1 ? "" : "s"}</span>
                  )}
                </div>
              </div>
              <div className="mod-slot-arrow" aria-hidden="true">→</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
