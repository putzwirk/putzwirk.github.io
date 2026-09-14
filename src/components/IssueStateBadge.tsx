import type { IssueState } from "../types";
import { issueStateLabel } from "../lib/issueState";

export default function IssueStateBadge({ state }: { state: IssueState | undefined | null }) {
  const value = state ?? "open";
  return <span className={`state-badge state-${value}`}>{issueStateLabel(value)}</span>;
}
