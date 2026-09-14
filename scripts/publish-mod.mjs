import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const result = { changelog: [] };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      if (key === "changelog") result.changelog.push(value);
      else result[key] = value;
    } else {
      positional.push(token);
    }
  }
  if (positional.length > 0 && !result.pck) result.pck = positional[0];
  return result;
}

function parseFilename(filename) {
  const base = path.basename(filename);
  const match = base.match(/^(.+)-v([^+]+)\+(.+)\.pck$/);
  if (!match) return {};
  return { modId: match[1], version: match[2], gameVersion: match[3].replace(/\.pck$/, "") };
}

function toSlug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const args = parseArgs(process.argv.slice(2));
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!args.pck) {
  console.error("Usage: npm run publish -- <file.pck> --version <x> --game-version <y> [--mod-id X] [--name N] [--tagline T] [--changelog line] [--release-date YYYY-MM-DD] [--requires QualiaMods,OtherMod]");
  process.exit(1);
}
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const guessed = parseFilename(args.pck);
const modId = args["mod-id"] || args.modId || guessed.modId;
const version = args.version || guessed.version;
const gameVersion = args["game-version"] || args.gameVersion || guessed.gameVersion;

if (!modId || !version || !gameVersion) {
  console.error("Could not determine mod-id, version, or game-version. Pass --mod-id, --version, --game-version explicitly.");
  process.exit(1);
}

const name = args.name || modId;
const tagline = args.tagline || "";
const releaseDate = args["release-date"] || args.releaseDate || new Date().toISOString().slice(0, 10);
const changelog = args.changelog.length > 0 ? args.changelog : ["Published build."];
const pckFilename = path.basename(args.pck);
const storagePath = `${modId}/${pckFilename}`;
const supabase = createClient(supabaseUrl, serviceRoleKey);
const fileBuffer = await readFile(args.pck);

const requiresFlag = args.requires ?? args["required-mods"] ?? args.requiredMods;
let requiredMods;
if (typeof requiresFlag === "string") {
  requiredMods = requiresFlag.split(",").map((slug) => slug.trim()).filter(Boolean);
} else {
  const { data: existing } = await supabase.from("mods").select("required_mods").eq("id", modId).maybeSingle();
  requiredMods = existing?.required_mods ?? (modId === "QualiaMods" ? [] : ["QualiaMods"]);
}

const { error: modError } = await supabase.from("mods").upsert({
  id: modId,
  name,
  tagline,
  issue_label: toSlug(modId),
  required_mods: requiredMods,
}, { onConflict: "id" });

if (modError) {
  console.error(`Failed to upsert mod ${modId}:`, modError.message);
  process.exit(1);
}

const { error: uploadError } = await supabase.storage.from("mod-files").upload(storagePath, fileBuffer, { upsert: true, contentType: "application/octet-stream" });

if (uploadError) {
  console.error(`Failed to upload ${pckFilename}:`, uploadError.message);
  process.exit(1);
}

const { error: versionError } = await supabase.from("mod_versions").insert({
  mod_id: modId,
  version,
  game_version: gameVersion,
  release_date: releaseDate,
  changelog,
  pck_filename: pckFilename,
  storage_path: storagePath,
});

if (versionError) {
  console.error(`Failed to insert version:`, versionError.message);
  process.exit(1);
}

console.log(`Published ${modId} v${version} (game ${gameVersion}) -> ${storagePath}`);
