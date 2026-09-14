import { useState } from "react";
import type { Issue, IssueComment, Mod } from "../types";
import MarkdownText from "./MarkdownText";
import CommentComposer from "./CommentComposer";
import ConfirmDialog from "./ConfirmDialog";
import { createComment, deleteComment, updateComment } from "../lib/data";
import { formatDateTime } from "../lib/formatDate";

interface Props {
  comments: IssueComment[];
  isStaff: boolean;
  onChanged: () => Promise<void> | void;
  referenceIssues?: Issue[];
  referenceMods?: Mod[];
}

export default function CommentThread({ comments, isStaff, onChanged, referenceIssues = [], referenceMods = [] }: Props) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<IssueComment | null>(null);
  const [deleting, setDeleting] = useState<IssueComment | null>(null);

  const topLevel = comments.filter((comment) => !comment.parent_id);
  const repliesOf = (id: string) => comments.filter((comment) => comment.parent_id === id);

  const renderComment = (comment: IssueComment, nested: boolean) => {
    const pending = comment.moderation_status === "pending";
    return (
      <li key={comment.id} className={`comment${pending ? " comment-pending" : ""}${nested ? " comment-reply" : ""}`}>
        <div className="comment-head">
          <span className="comment-author">{comment.author_name}</span>
          <span className="comment-time">{formatDateTime(comment.created_at)}</span>
          {pending && <span className="pending-label">pending moderation</span>}
        </div>
        {editing?.id === comment.id ? (
          <CommentComposer
            initialBody={comment.body}
            submitLabel="Save"
            compact
            showName={false}
            onCancel={() => setEditing(null)}
            onSubmit={async (body) => {
              await updateComment(comment.id, body);
              setEditing(null);
              await onChanged();
            }}
          />
        ) : (
          <div className="comment-body"><MarkdownText text={comment.body} issues={referenceIssues} mods={referenceMods} /></div>
        )}
        <div className="comment-actions">
          {!nested && <button className="btn btn-sm issue-action-btn" type="button" onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}>{replyTo === comment.id ? "Cancel reply" : "Reply"}</button>}
          {pending && <button className="btn btn-sm issue-action-btn" type="button" onClick={() => setEditing(comment)}>Edit</button>}
          {isStaff && <button className="btn btn-sm issue-delete-btn" type="button" onClick={() => setDeleting(comment)}>Delete</button>}
        </div>
        {replyTo === comment.id && (
          <CommentComposer
            compact
            placeholder={`Reply to ${comment.author_name}`}
            submitLabel="Reply"
            onCancel={() => setReplyTo(null)}
            onSubmit={async (body, authorName) => {
              await createComment(comment.issue_id, body, authorName, comment.id);
              setReplyTo(null);
              await onChanged();
            }}
          />
        )}
        {!nested && repliesOf(comment.id).length > 0 && <ul className="comment-replies">{repliesOf(comment.id).map((reply) => renderComment(reply, true))}</ul>}
      </li>
    );
  };

  return (
    <>
      {topLevel.length === 0 ? (
        <p className="empty-state">No comments yet.</p>
      ) : (
        <ul className="comment-list">{topLevel.map((comment) => renderComment(comment, false))}</ul>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete comment?"
          message="This comment will be permanently removed."
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            const target = deleting;
            await deleteComment(target.id);
            setDeleting(null);
            await onChanged();
          }}
        />
      )}
    </>
  );
}
