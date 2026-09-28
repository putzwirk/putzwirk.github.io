import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const PROJECTS = [
  ["mc-mods", "artifacts-merging"],
  ["mc-mods", "better-flames"],
  ["mc-mods", "boundlessblocks"],
  ["mc-mods", "eating-pace"],
  ["mc-mods", "fabricated-difficulty"],
  ["mc-mods", "feeding-indicators"],
  ["mc-mods", "fogrule"],
  ["mc-mods", "greedy-gold"],
  ["mc-mods", "hoardlocator"],
  ["mc-mods", "hostile-climbers"],
  ["mc-mods", "inmisinvman-compat"],
  ["mc-mods", "looping-world"],
  ["mc-mods", "mapmakerblocks"],
  ["mc-mods", "mapmakermusic"],
  ["mc-mods", "per-player-random-respawn"],
  ["mc-mods", "progressiveinventory"],
  ["mc-mods", "rare-mending"],
  ["mc-mods", "repair-station"],
  ["mc-mods", "sweat-to-fit"],
  ["mc-mods", "trashslot-blacklist-addon"],
  ["mc-mods", "worldborder-core"],
  ["mc-mods", "worldborder-tweaks"],
  ["modpacks", "impasse"],
];

const supabase = createClient(url, serviceKey);
const rows = [];
for (const [type, slug] of PROJECTS) {
  let name = slug;
  try {
    const res = await fetch(`https://api.cfwidget.com/minecraft/${type}/${slug}`, {
      headers: { "User-Agent": "putzwirk.github.io seed script" },
    });
    if (res.ok) name = (await res.json()).title ?? slug;
  } catch {
    /* keep slug */
  }
  rows.push({
    id: `mc-${slug}`,
    name,
    tagline: "",
    description: "",
    author: "Neuromuser",
    issue_label: "",
    sort_order: 100,
    required_mods: [],
  });
}

const { error } = await supabase.from("mods").upsert(rows, { onConflict: "id" });
if (error) throw error;

const stale = ["mc-greedygold", "mc-random-player-respawn"];
const { error: delError } = await supabase.from("mods").delete().in("id", stale);
if (delError) throw delError;
console.log(`Upserted ${rows.length} minecraft mod rows, removed ${stale.length} stale rows.`);
