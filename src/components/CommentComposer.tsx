import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { friendlyAuthError, signInWithDiscord } from "./AuthMenu";

interface Props {
  onSubmit: (body: string, authorName: string) => Promise<void>;
  placeholder?: string;
  submitLabel?: string;
  onCancel?: () => void;
  compact?: boolean;
  initialBody?: string;
  showName?: boolean;
}

const NAME_KEY = "lucidblocks-author-name";

export default function CommentComposer({ onSubmit, placeholder = "Add a comment", submitLabel = "Comment", onCancel, compact, initialBody = "", showName = true }: Props) {
  const { session } = useAuth();
  const [body, setBody] = useState(initialBody);
  const [authorName, setAuthorName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleDiscord = async () => {
    setSigningIn(true);
    setAuthError(null);
    const { error: discordError } = await signInWithDiscord();
    if (discordError) setAuthError(friendlyAuthError(discordError));
    setSigningIn(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const name = authorName.trim();
      if (name) {
        try {
          localStorage.setItem(NAME_KEY, name);
        } catch {
          undefined;
        }
      }
      await onSubmit(trimmed, name || "Anonymous");
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post the comment.");
    }
    setBusy(false);
  };

  return (
    <form className={`comment-composer${compact ? " comment-composer-compact" : ""}`} onSubmit={handleSubmit}>
      {!session && (
        <div className="comment-signin-prompt">
          <button className="btn btn-accent btn-sm" type="button" onClick={handleDiscord} disabled={signingIn}>{signingIn ? "Opening…" : "Sign in with Discord to post instantly"}</button>
          <span className="comment-signin-hint">or post anonymously</span>
        </div>
      )}
      {authError && <p className="form-error">{authError}</p>}
      <textarea className="form-textarea comment-composer-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder={placeholder} rows={compact ? 2 : 3} required />
      <div className="comment-composer-actions">
        {showName && <input className="form-input comment-composer-name" value={authorName} onChange={(event) => setAuthorName(event.target.value)} maxLength={40} placeholder="Your name (optional)" />}
        <button className="btn btn-accent btn-sm" type="submit" disabled={busy || !body.trim()}>{busy ? "Posting…" : submitLabel}</button>
        {onCancel && <button className="btn btn-sm" type="button" onClick={onCancel}>Cancel</button>}
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
