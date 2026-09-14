import type { IssueState } from "../types";
import { issueStateLabel } from "../lib/issueState";

export default function IssueStateBadge({ state, type, fixedInVersion }: { state: IssueState | undefined | null; type?: "bug" | "idea"; fixedInVersion?: string | null }) {
  const value = state ?? "open";
  if (value === "fixed") {
    const verb = type === "idea" ? "Added" : "Fixed";
    return <span className="state-badge state-fixed">{fixedInVersion ? `${verb} in ${fixedInVersion}` : verb}</span>;
  }
  return <span className={`state-badge state-${value}`}>{issueStateLabel(value)}</span>;
}
