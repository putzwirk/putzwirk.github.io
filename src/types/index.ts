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

export interface Issue {
  id: string;
  mod_id: string | null;
  type: "bug" | "idea";
  title: string;
  description: string;
  author_name: string;
  author_id?: string | null;
  status: "open" | "closed";
  votes: number;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  attachment_urls: string[];
  moderation_status?: "pending" | "approved" | "rejected";
}

export type ModWithVersions = Mod & {
  mod_versions: ModVersion[];
};
