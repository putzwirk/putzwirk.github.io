import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CURSEFORGE_MEMBER_URL, fetchMcMods, type McMod } from "../lib/minecraft";
import LoaderTag from "../components/LoaderTag";

export default function MinecraftHome() {
  const [mods, setMods] = useState<McMod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMcMods()
      .then(setMods)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load mods."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="load-state">Loading mods</p>;
  if (error) return <div className="error-state">Couldn't load mods. {error}</div>;

  return (
    <>
      <div className="hero">
        <h1>Minecraft Mods</h1>
        <p className="intro">
          Pick one to see its versions and report issues.
        </p>
        <p className="mod-meta-row">
          <a className="btn btn-sm" href="https://modrinth.com/user/Neuromuser" target="_blank" rel="noreferrer">Modrinth profile</a>
          <a className="btn btn-sm" href={CURSEFORGE_MEMBER_URL} target="_blank" rel="noreferrer">CurseForge projects</a>
        </p>
      </div>
      <div className="mod-grid">
        {mods.map((mod) => (
          <Link key={mod.slug} className="mod-slot" to={`/minecraft/mods/${mod.slug}`}>
            {mod.iconUrl ? (
              <img className="slot-glyph slot-glyph-img" src={mod.iconUrl} alt="" width={56} height={56} loading="lazy" />
            ) : (
              <div className="slot-glyph" aria-hidden="true">{mod.title.charAt(0)}</div>
            )}
            <div className="mod-slot-body">
              <div className="mod-slot-name">{mod.title}</div>
              <div className="mod-slot-author">by Neuromuser</div>
              <div className="mod-slot-tagline">{mod.description}</div>
              <div className="mod-slot-chips">
                <span className="chip">{mod.downloads.toLocaleString()} downloads</span>
                {mod.type === "modpack" && <span className="chip">modpack</span>}
                {mod.loaders.slice(0, 3).map((loader) => <LoaderTag key={loader} loader={loader} />)}
              </div>
            </div>
            <div className="mod-slot-arrow" aria-hidden="true">→</div>
          </Link>
        ))}
      </div>
    </>
  );
}
