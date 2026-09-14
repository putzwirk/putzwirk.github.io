import { useRef, useState } from "react";
import type { Mod, ModWithVersions } from "../types";
import { getModAssetUrl, uploadModAsset, validateModAsset } from "../lib/data";
import type { ModMedia } from "../lib/data";
import { handleMarkdownShortcut, indentTextarea, undoMarkdownEdit } from "../lib/markdownEditing";
import MarkdownToolbar from "./MarkdownToolbar";

function parseTags(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value.split(",")) {
    const tag = raw.trim();
    if (tag.length === 0 || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
    if (tags.length === 12) break;
  }
  return tags;
}

interface Props {
  mod: (ModWithVersions & ModMedia) | null;
  availableMods: Mod[];
  onSubmit: (data: { id: string; name: string; tagline: string; description: string; author: string; issue_label: string; sort_order: number; required_mods: string[]; tags: string[]; banner_path: string | null; screenshots: string[]; ai_generated: boolean }) => Promise<void>;
  onCancel: () => void;
}

export default function ModForm({ mod, availableMods, onSubmit, onCancel }: Props) {
  const [id, setId] = useState(mod?.id ?? "");
  const [name, setName] = useState(mod?.name ?? "");
  const [tagline, setTagline] = useState(mod?.tagline ?? "");
  const [description, setDescription] = useState(mod?.description ?? "");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [author, setAuthor] = useState(mod?.author ?? "Putzwirk");
  const [issueLabel, setIssueLabel] = useState(mod?.issue_label ?? "");
  const [sortOrder, setSortOrder] = useState(mod?.sort_order ?? 0);
  const [requiredMods, setRequiredMods] = useState<string[]>(() => {
    if (mod) return mod.required_mods ?? [];
    return ["QualiaMods"];
  });
  const [tags, setTags] = useState(() => (mod?.tags ?? []).join(", "));
  const [aiGenerated, setAiGenerated] = useState(mod?.ai_generated ?? false);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPath] = useState<string | null>(mod?.banner_path ?? null);
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
  const [screenshotPaths] = useState<string[]>(mod?.screenshots ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const options = availableMods.filter((candidate) => candidate.id !== mod?.id);
  const toggleDependency = (slug: string) => {
    setRequiredMods((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]);
  };
  const handleBannerChange = (selected: File | null) => {
    if (!selected) {
      setBannerFile(null);
      return;
    }
    const invalid = validateModAsset(selected);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBannerFile(selected);
  };

  const handleScreenshotsChange = (selected: FileList | null) => {
    const list = Array.from(selected ?? []);
    const invalid = list.map(validateModAsset).find((message): message is string => message !== null);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setScreenshotFiles(list);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const modId = (mod?.id ?? id).trim();
    const pending = [...(bannerFile ? [bannerFile] : []), ...screenshotFiles];
    const assetError = pending.map(validateModAsset).find((message): message is string => message !== null);
    if (assetError) {
      setError(assetError);
      return;
    }
    if (!modId) {
      setError("A mod id is required before uploading assets.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let nextBannerPath = bannerPath;
      if (bannerFile) nextBannerPath = await uploadModAsset(modId, bannerFile, "banner");
      const nextScreenshots = [...screenshotPaths];
      for (const screenshot of screenshotFiles) nextScreenshots.push(await uploadModAsset(modId, screenshot, "screenshot"));
      await onSubmit({ id, name, tagline, description, author, issue_label: issueLabel, sort_order: sortOrder, required_mods: requiredMods, tags: parseTags(tags), banner_path: nextBannerPath, screenshots: nextScreenshots, ai_generated: aiGenerated });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>{mod ? "Edit mod" : "New mod"}</h2>
      <div className="form-row">
        <div className="form-group">
          <label>Mod ID (slug)</label>
          <input className="form-input" value={id} onChange={(e) => setId(e.target.value)} disabled={!!mod} required placeholder="e.g. AbyssInventory" />
        </div>
        <div className="form-group">
          <label>Name</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Display name" />
        </div>
      </div>
      <div className="form-group">
        <label>Tagline</label>
        <input className="form-input" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Short description" />
      </div>
      <div className="form-group">
        <label>Author</label>
        <input className="form-input" value={author} onChange={(e) => setAuthor(e.target.value)} required placeholder="Putzwirk" maxLength={80} />
      </div>
      <div className="form-group">
        <label>Required dependencies</label>
        <div className="dependency-listbox" role="group" aria-label="Required dependencies">
          {options.length === 0 && <span className="empty-state">No other mods available.</span>}
          {options.map((candidate) => {
            const checked = requiredMods.includes(candidate.id);
            return (
              <label key={candidate.id} className={checked ? "dependency-option selected" : "dependency-option"}>
                <input type="checkbox" checked={checked} onChange={() => toggleDependency(candidate.id)} />
                <span className="dependency-name">{candidate.name}</span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="form-group">
        <div className="description-head">
          <label>Description (shown on the mod page, supports Markdown)</label>
          <MarkdownToolbar value={description} onChange={setDescription} textareaRef={descriptionRef} />
        </div>
        <textarea ref={descriptionRef} className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => { if (undoMarkdownEdit(e, e.currentTarget, setDescription)) return; if (e.key === "Tab") { e.preventDefault(); const edit = indentTextarea(e.currentTarget, description, setDescription); requestAnimationFrame(() => { descriptionRef.current?.focus(); descriptionRef.current?.setSelectionRange(edit.start, edit.end); }); return; } handleMarkdownShortcut(e, description, e.currentTarget, setDescription); }} maxLength={5000} rows={6} placeholder="Explain what this mod does" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Issue label</label>
          <input className="form-input" value={issueLabel} onChange={(e) => setIssueLabel(e.target.value)} placeholder="legacy label slug" />
        </div>
        <div className="form-group">
          <label>Sort order</label>
          <input className="form-input" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
        </div>
      </div>
      <div className="form-group">
        <label>Tags (comma separated)</label>
        <input className="form-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Gameplay, Quality of Life, Client-side" />
      </div>
      <div className="form-group">
        <label className="ai-generated-option">
          <input type="checkbox" checked={aiGenerated} onChange={(e) => setAiGenerated(e.target.checked)} />
          <span>This mod contains AI-generated content</span>
        </label>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Banner image</label>
          <input className="form-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={(e) => handleBannerChange(e.target.files?.[0] ?? null)} />
          {bannerPath && <div className="mod-media-preview mod-banner-preview"><img src={getModAssetUrl(bannerPath)} alt="Current banner" /></div>}
        </div>
        <div className="form-group">
          <label>Screenshots</label>
          <input className="form-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple onChange={(e) => handleScreenshotsChange(e.target.files)} />
          {(screenshotPaths.length > 0 || screenshotFiles.length > 0) && (
            <div className="mod-media-preview">
              {screenshotPaths.map((path) => <img key={path} src={getModAssetUrl(path)} alt="Current screenshot" />)}
              {screenshotFiles.map((screenshot) => <span className="chip" key={screenshot.name}>{screenshot.name}</span>)}
            </div>
          )}
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-accent" type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </button>
        <button className="btn" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
