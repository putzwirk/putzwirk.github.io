export interface Mod {
  id: string;
  name: string;
  tagline: string;
  description: string;
  author: string;
  issue_label: string;
  sort_order: number;
  required_mods: string[];
  created_at: string;
}

export interface ModVersion {
  id: string;
  mod_id: string;
  version: string;
  game_version: string;
  release_date: string;
  changelog: string[];
  pck_filename: string;
  storage_path: string;
  download_count: number;
  created_at: string;
}

export type IssueState = "open" | "needs_info" | "confirmed" | "in_progress" | "fixed" | "duplicate" | "wontfix" | "closed";

export interface Issue {
  id: string;
  mod_id: string | null;
  type: "bug" | "idea";
  title: string;
  description: string;
  author_name: string;
  author_id?: string | null;
  status: "open" | "closed";
  state?: IssueState;
  fixed_in_version_id?: string | null;
  comment_count?: number;
  votes: number;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  attachment_urls: string[];
  moderation_status?: "pending" | "approved" | "rejected";
  moderation_reason?: string | null;
}

export interface IssueComment {
  id: string;
  issue_id: string;
  author_id: string | null;
  parent_id: string | null;
  author_name: string;
  body: string;
  moderation_status: "pending" | "approved" | "rejected";
  moderation_reason?: string | null;
  state: "visible" | "hidden" | "deleted";
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface IssueEvent {
  id: string;
  issue_id: string;
  actor_id: string | null;
  actor_name: string | null;
  event: string;
  from_state: string | null;
  to_state: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  scope: "global" | "mod";
}

export type ModWithVersions = Mod & {
  mod_versions: ModVersion[];
};
