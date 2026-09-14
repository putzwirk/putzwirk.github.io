import { useRef, useState } from "react";
import type { Mod, ModWithVersions } from "../types";
import { handleMarkdownShortcut, indentTextarea, undoMarkdownEdit } from "../lib/markdownEditing";
import MarkdownToolbar from "./MarkdownToolbar";

interface Props {
  mod: ModWithVersions | null;
  availableMods: Mod[];
  onSubmit: (data: { id: string; name: string; tagline: string; description: string; author: string; issue_label: string; sort_order: number; required_mods: string[] }) => Promise<void>;
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const options = availableMods.filter((candidate) => candidate.id !== mod?.id);
  const toggleDependency = (slug: string) => {
    setRequiredMods((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ id, name, tagline, description, author, issue_label: issueLabel, sort_order: sortOrder, required_mods: requiredMods });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>{mod ? "Edit Mod" : "New Mod"}</h2>
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
          <label>Issue Label</label>
          <input className="form-input" value={issueLabel} onChange={(e) => setIssueLabel(e.target.value)} placeholder="legacy label slug" />
        </div>
        <div className="form-group">
          <label>Sort Order</label>
          <input className="form-input" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
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
