import type { Issue } from "../types";

const STORAGE_KEY = "lucidblocks-pending-issues";
const MAX_PENDING = 50;

export function loadPendingIssues(): Issue[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Issue[]) : [];
  } catch {
    return [];
  }
}

export function savePendingIssues(issues: Issue[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(issues.slice(0, MAX_PENDING)));
  } catch {
    return;
  }
}

export function addPendingIssue(issue: Issue): void {
  const cached = loadPendingIssues();
  savePendingIssues([issue, ...cached.filter((item) => item.id !== issue.id)]);
}

export function removePendingIssue(id: string): void {
  savePendingIssues(loadPendingIssues().filter((item) => item.id !== id));
}

export function updatePendingIssue(id: string, patch: Partial<Issue>): void {
  savePendingIssues(loadPendingIssues().map((item) => (item.id === id ? { ...item, ...patch } : item)));
}

export function getPendingIds(): Set<string> {
  return new Set(loadPendingIssues().map((item) => item.id));
}

export function mergeWithPending(serverIssues: Issue[]): Issue[] {
  const cached = loadPendingIssues();
  const serverIds = new Set(serverIssues.map((item) => item.id));
  return [...cached.filter((item) => !serverIds.has(item.id)), ...serverIssues];
}
