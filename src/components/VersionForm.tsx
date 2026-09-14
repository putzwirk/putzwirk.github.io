import { useEffect, useMemo, useRef, useState } from "react";
import type { Issue, ModVersion } from "../types";
import { fetchAllPublicIssues, fetchModsWithVersions } from "../lib/data";
import { handleMarkdownShortcut, indentTextarea, undoMarkdownEdit } from "../lib/markdownEditing";
import MarkdownToolbar from "./MarkdownToolbar";

interface VersionData {
  mod_id: string;
  version: string;
  game_version: string;
  release_date: string;
  changelog: string[];
  pck_filename: string;
}

interface Props {
  modId: string;
  initial?: ModVersion | null;
  onSubmit: (versionData: VersionData, file: File | null) => Promise<void>;
  onCancel: () => void;
}

export default function VersionForm({ modId, initial, onSubmit, onCancel }: Props) {
  const [version, setVersion] = useState(initial?.version ?? "");
  const [gameVersion, setGameVersion] = useState(initial?.game_version ?? "");
  const [releaseDate, setReleaseDate] = useState(initial?.release_date ?? new Date().toISOString().slice(0, 10));
  const [changelog, setChangelog] = useState((initial?.changelog ?? []).join("\n"));
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [references, setReferences] = useState<Array<{ id: string; title: string; detail: string; kind: string; kindLabel: string }>>([]);
  const [referenceQuery, setReferenceQuery] = useState<string | null>(null);
  const [referencePosition, setReferencePosition] = useState({ left: 0, top: 0 });
  const updateReferencePosition = (textarea: HTMLTextAreaElement) => { const before = textarea.value.slice(0, textarea.selectionStart); const lines = before.split("\n"); const rect = textarea.getBoundingClientRect(); const cursorX = rect.left + lines[lines.length - 1].length * 8; const pickerWidth = Math.min(window.innerWidth <= 640 ? 288 : 672, window.innerWidth - 16); const left = window.innerWidth <= 640 ? (window.innerWidth - pickerWidth) / 2 : cursorX - pickerWidth / 2; setReferencePosition({ left: Math.max(8, Math.min(window.innerWidth - pickerWidth - 8, left)), top: Math.min(window.innerHeight - 170, rect.top + Math.min(240, (lines.length - 1) * 22 + (window.innerWidth <= 640 ? 56 : 24))) }); }; 
  const referenceOptions = useMemo(() => {
    const query = (referenceQuery ?? "").toLowerCase();
    return references.filter((reference) => reference.title.toLowerCase().includes(query) || reference.detail.toLowerCase().includes(query)).slice(0, 8);
  }, [references, referenceQuery]);
  const [submitting, setSubmitting] = useState(false);
  const changelogRef = useRef<HTMLTextAreaElement>(null);
  const changelogWrapRef = useRef<HTMLDivElement>(null);
  const pickerVisible = referenceQuery !== null && referenceOptions.length > 0;
  useEffect(() => {
    if (!pickerVisible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onPointerDown = (event: PointerEvent) => {
      if (changelogWrapRef.current && !changelogWrapRef.current.contains(event.target as Node)) setReferenceQuery(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReferenceQuery(null);
        changelogRef.current?.blur();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerVisible]);
  useEffect(() => {
    const textarea = changelogRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [changelog]);
  const isEdit = !!initial;
  useEffect(() => { Promise.all([fetchModsWithVersions().catch(() => []), fetchAllPublicIssues().catch(() => [])]).then(([mods, issues]) => { const modMap = new Map(mods.map((mod) => [mod.id, mod.name])); setReferences([...mods.map((mod) => ({ id: mod.id, title: mod.name, detail: mod.name, kind: "mod", kindLabel: "Mod" })), ...(issues as Issue[]).map((issue) => ({ id: issue.id, title: issue.title, detail: issue.mod_id ? (modMap.get(issue.mod_id) ?? "Unknown mod") : "Ideas", kind: issue.type, kindLabel: issue.type === "bug" ? "Bug" : "Idea" }))]); }); }, []);

  const insertTab = () => {
    const textarea = changelogRef.current;
    if (!textarea) return;
    const edit = indentTextarea(textarea, changelog, setChangelog);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(edit.start, edit.end);
    });
  };

  const insertReferenceTrigger = () => {
    const textarea = changelogRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = `${changelog.slice(0, start)}[[${changelog.slice(end)}`;
    setChangelog(nextValue);
    setReferenceQuery("");
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 2, start + 2);
    });
  };

  const handleChangelogKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (undoMarkdownEdit(event, event.currentTarget, setChangelog)) return;
    if (event.key === "Tab") {
      event.preventDefault();
      insertTab();
      return;
    }
    handleMarkdownShortcut(event, changelog, event.currentTarget, setChangelog);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && !file) {
      setError("Please select a .pck file to upload.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const changelogLines = changelog.split("\n").map((line) => line.replace(/\s+$/, ""));
      while (changelogLines[0]?.trim() === "") changelogLines.shift();
      while (changelogLines[changelogLines.length - 1]?.trim() === "") changelogLines.pop();
      await onSubmit({ mod_id: modId, version, game_version: gameVersion, release_date: releaseDate, changelog: changelogLines, pck_filename: file ? file.name : initial?.pck_filename ?? "" }, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>{isEdit ? `Edit v${initial?.version}` : "New Version"}</h2>
      <div className="form-row">
        <div className="form-group">
          <label>Mod Version</label>
          <input className="form-input" value={version} onChange={(e) => setVersion(e.target.value)} required placeholder="e.g. 4.1.0" />
        </div>
        <div className="form-group">
          <label>Game Version</label>
          <input className="form-input" value={gameVersion} onChange={(e) => setGameVersion(e.target.value)} required placeholder="e.g. 4.0.1" />
        </div>
        <div className="form-group">
          <label>Release Date</label>
          <input className="form-input" type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} required />
        </div>
      </div>
      <div className="form-group">
        <div className="description-head">
          <label>Changelog</label>
          <MarkdownToolbar value={changelog} onChange={setChangelog} textareaRef={changelogRef} onMention={insertReferenceTrigger} />
        </div>
        <div className="reference-input-wrap" ref={changelogWrapRef}><textarea ref={changelogRef} className="form-textarea changelog-textarea" value={changelog} onKeyDown={handleChangelogKeyDown} onSelect={(e) => { updateReferencePosition(e.currentTarget); setReferenceQuery(e.currentTarget.value.slice(0, e.currentTarget.selectionStart).match(/\[\[([^\]]*)$/)?.[1] ?? null); }} onChange={(e) => { setChangelog(e.target.value); setReferenceQuery(e.target.value.slice(0, e.target.selectionStart).match(/\[\[([^\]]*)$/)?.[1] ?? null); updateReferencePosition(e.target); }} placeholder={"Added new feature\nFixed bug with X\nImproved performance"}>
        </textarea>{pickerVisible && <div className="reference-picker" style={{ left: referencePosition.left, top: referencePosition.top }}>{referenceOptions.map((reference) => <button type="button" className="reference-picker-item" key={reference.id} onClick={() => { const textarea = changelogRef.current; if (!textarea) return; const cursor = textarea.selectionStart; const before = changelog.slice(0, cursor); const marker = before.lastIndexOf("[["); const nextValue = `${changelog.slice(0, marker)}[[${reference.id}]]${changelog.slice(cursor)}`; setChangelog(nextValue); setReferenceQuery(null); requestAnimationFrame(() => { const nextCursor = marker + reference.id.length + 4; textarea.focus(); textarea.setSelectionRange(nextCursor, nextCursor); }); }}>{reference.kind !== "mod" && <span className="reference-picker-mod">{reference.detail}</span>}<span className={`reference-picker-kind reference-picker-kind-kind-${reference.kind}`}>{reference.kindLabel}</span><span className="reference-picker-title">{reference.title}</span></button>)}</div>}</div>
      </div>
      <div className="form-group">
        <label>{isEdit ? `.pck File (current: ${initial?.pck_filename} — leave empty to keep)` : ".pck File"}</label>
        <input className="form-input" type="file" accept=".pck" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required={!isEdit} />
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-accent" type="submit" disabled={submitting}>{submitting ? (isEdit ? "Saving…" : "Uploading…") : (isEdit ? "Save Changes" : "Upload Version")}</button>
        <button className="btn" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
