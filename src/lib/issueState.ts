import type { IssueState } from "../types";

export const ISSUE_STATES: IssueState[] = ["open", "needs_info", "confirmed", "in_progress", "fixed", "duplicate", "wontfix", "closed"];

const LABELS: Record<IssueState, string> = {
  open: "Open",
  needs_info: "Needs info",
  confirmed: "Confirmed",
  in_progress: "In progress",
  fixed: "Fixed",
  duplicate: "Duplicate",
  wontfix: "Won't fix",
  closed: "Closed",
};

const OPEN_STATES: IssueState[] = ["open", "needs_info", "confirmed", "in_progress"];

export function issueStateLabel(state: IssueState | undefined | null): string {
  if (!state) return LABELS.open;
  return LABELS[state] ?? state;
}

export function isOpenState(state: IssueState | undefined | null): boolean {
  if (!state) return true;
  return OPEN_STATES.includes(state);
}
