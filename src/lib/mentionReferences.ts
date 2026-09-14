import type { Issue, Mod } from "../types";

export interface MentionReference {
  id: string;
  title: string;
  detail: string;
  kind: "mod" | "bug" | "idea";
  kindLabel: string;
}

export function buildMentionReferences(mods: Mod[], issues: Issue[]): MentionReference[] {
  const modMap = new Map(mods.map((mod) => [mod.id, mod.name]));
  return [
    ...issues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      detail: issue.mod_id ? (modMap.get(issue.mod_id) ?? "Unknown mod") : "Ideas",
      kind: issue.type,
      kindLabel: issue.type === "bug" ? "Bug" : "Idea",
    })),
    ...mods.map((mod) => ({ id: mod.id, title: mod.name, detail: mod.name, kind: "mod" as const, kindLabel: "Mod" })),
  ];
}
