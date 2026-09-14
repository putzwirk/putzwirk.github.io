import { useState } from "react";
import type { Label } from "../types";

interface Props {
  labels: Label[];
  selectedIds: string[];
  disabled?: boolean;
  onToggle: (labelId: string) => void;
  onCreate: (name: string, color: string) => Promise<void>;
}

export default function LabelPicker({ labels, selectedIds, disabled, onToggle, onCreate }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#f2b134");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(trimmed, color);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the label.");
    }
    setBusy(false);
  };

  return (
    <div className="label-picker">
      <div className="label-picker-list">
        {labels.length === 0 ? (
          <span className="label-picker-empty">No labels yet.</span>
        ) : (
          labels.map((label) => (
            <label key={label.id} className="label-picker-item">
              <input
                type="checkbox"
                checked={selectedIds.includes(label.id)}
                onChange={() => onToggle(label.id)}
                disabled={disabled}
              />
              <span className="label-swatch" style={{ background: label.color }} aria-hidden="true" />
              <span className="label-picker-name">{label.name}</span>
            </label>
          ))
        )}
      </div>
      <form className="label-create" onSubmit={handleCreate}>
        <input
          className="form-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New label"
          maxLength={40}
          aria-label="New label name"
          disabled={disabled}
        />
        <input
          className="label-color-input"
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          aria-label="New label color"
          disabled={disabled}
        />
        <button className="btn btn-accent btn-sm" type="submit" disabled={disabled || busy || !name.trim()}>Add</button>
      </form>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
