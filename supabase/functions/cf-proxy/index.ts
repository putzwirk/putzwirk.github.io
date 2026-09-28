import { fail, json, preflight } from "../_shared/http.ts";

const CF_API = "https://api.curseforge.com/v1";
const CACHE_TTL = 10 * 60 * 1000;

interface ProjectRef {
  slug: string;
  type: string;
}

const PROJECTS: ProjectRef[] = [
  { slug: "artifacts-merging", type: "mc-mods" },
  { slug: "better-flames", type: "mc-mods" },
  { slug: "boundlessblocks", type: "mc-mods" },
  { slug: "eating-pace", type: "mc-mods" },
  { slug: "fabricated-difficulty", type: "mc-mods" },
  { slug: "feeding-indicators", type: "mc-mods" },
  { slug: "fogrule", type: "mc-mods" },
  { slug: "greedy-gold", type: "mc-mods" },
  { slug: "hoardlocator", type: "mc-mods" },
  { slug: "hostile-climbers", type: "mc-mods" },
  { slug: "inmisinvman-compat", type: "mc-mods" },
  { slug: "looping-world", type: "mc-mods" },
  { slug: "mapmakerblocks", type: "mc-mods" },
  { slug: "mapmakermusic", type: "mc-mods" },
  { slug: "per-player-random-respawn", type: "mc-mods" },
  { slug: "progressiveinventory", type: "mc-mods" },
  { slug: "rare-mending", type: "mc-mods" },
  { slug: "repair-station", type: "mc-mods" },
  { slug: "sweat-to-fit", type: "mc-mods" },
  { slug: "trashslot-blacklist-addon", type: "mc-mods" },
  { slug: "worldborder-core", type: "mc-mods" },
  { slug: "worldborder-tweaks", type: "mc-mods" },
  { slug: "impasse", type: "modpacks" },
];

const MOD_IDS: Record<string, number> = {
  "artifacts-merging": 1456308,
  "better-flames": 1623601,
  "boundlessblocks": 1434985,
  "eating-pace": 1439823,
  "fabricated-difficulty": 1455766,
  "feeding-indicators": 1464129,
  "fogrule": 1612240,
  "greedy-gold": 1438044,
  "hoardlocator": 1671791,
  "hostile-climbers": 1464588,
  "inmisinvman-compat": 1435015,
  "looping-world": 1442954,
  "mapmakerblocks": 1685755,
  "mapmakermusic": 1671693,
  "per-player-random-respawn": 1453697,
  "progressiveinventory": 1600020,
  "rare-mending": 1467390,
  "repair-station": 1453725,
  "sweat-to-fit": 1462968,
  "trashslot-blacklist-addon": 1448517,
  "worldborder-core": 1445465,
  "worldborder-tweaks": 1442723,
  "impasse": 1674582,
};

const responseCache = new Map<string, { at: number; data: unknown }>();

async function cf<T>(path: string): Promise<T> {
  const key = Deno.env.get("CURSEFORGE_API_KEY");
  if (!key) throw new Error("CurseForge API key is not configured");
  const res = await fetch(`${CF_API}${path}`, {
    headers: { "x-api-key": key, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CurseForge request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function resolveId(slug: string): number | null {
  return MOD_IDS[slug] ?? null;
}

interface CfMod {
  id: number;
  name: string;
  slug: string;
  summary: string;
  description: string;
  downloadCount: number;
  dateCreated: string;
  logo?: { url?: string } | null;
  authors?: Array<{ name?: string }> | null;
  categories?: Array<{ name?: string }> | null;
  links?: { websiteUrl?: string } | null;
}

interface CfFile {
  id: number;
  fileName: string;
  displayName: string;
  fileDate: string;
  releaseType: number;
  gameVersions: string[];
  downloadCount: number;
  downloadUrl: string;
  changelog: string;
}

// deno-lint-ignore no-explicit-any
function slimMod(m: CfMod, fallbackSlug: string): Record<string, unknown> {
  return {
    id: m.id,
    slug: m.slug || fallbackSlug,
    name: m.name,
    summary: m.summary || "",
    description: m.description || "",
    logoUrl: m.logo?.url || null,
    downloadCount: m.downloadCount || 0,
    dateCreated: m.dateCreated || "",
    authors: (m.authors || []).map((a) => a.name).filter(Boolean),
    categories: (m.categories || []).map((c) => c.name).filter(Boolean),
    websiteUrl: m.links?.websiteUrl || null,
  };
}

function slimFile(f: CfFile): Record<string, unknown> {
  return {
    id: f.id,
    fileName: f.fileName,
    displayName: f.displayName || "",
    fileDate: f.fileDate,
    releaseType: f.releaseType,
    gameVersions: f.gameVersions || [],
    downloadCount: f.downloadCount || 0,
    downloadUrl: f.downloadUrl || "",
    changelog: f.changelog || "",
  };
}

function unionTags(files: CfFile[]): { loaders: string[]; gameVersions: string[] } {
  const loaders = new Set<string>();
  const games = new Set<string>();
  for (const f of files) {
    for (const v of f.gameVersions || []) {
      if (/^\d/.test(v)) games.add(v);
      else if (v !== "Client" && v !== "Server") loaders.add(v);
    }
  }
  return { loaders: [...loaders], gameVersions: [...games] };
}

async function fetchAllFiles(id: number): Promise<CfFile[]> {
  const files: CfFile[] = [];
  const pageSize = 50;
  let index = 0;
  for (let page = 0; page < 10; page += 1) {
    const result = await cf<CfFileList>(`/v1/mods/${id}/files?pageSize=${pageSize}&index=${index}`);
    files.push(...result.data);
    index += result.data.length;
    if (index >= result.pagination.totalCount || result.data.length === 0) break;
  }
  return files;
}

async function listMods(): Promise<unknown[]> {
  const results = await Promise.all(
    PROJECTS.map(async (p) => {
      const id = resolveId(p.slug);
      if (id === null) return null;
      try {
        const [mod, files] = await Promise.all([
          cf<{ data: CfMod }>(`/v1/mods/${id}`),
          fetchAllFiles(id),
        ]);
        const tags = unionTags(files);
        return { ...slimMod(mod.data, p.slug), type: p.type, loaders: tags.loaders, gameVersions: tags.gameVersions, fileCount: files.length };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((m) => m !== null) as Record<string, unknown>[];
}

interface CfFileList {
  data: CfFile[];
  pagination: { totalCount: number };
}

async function listFiles(slug: string): Promise<unknown[] | null> {
  const id = await resolveId(slug);
  if (id === null) return null;
  const files = await fetchAllFiles(id);
  return files.map(slimFile);
}

function cached(key: string): unknown | null {
  const entry = responseCache.get(key);
  if (entry && Date.now() - entry.at < CACHE_TTL) return entry.data;
  return null;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("Method not allowed", 405);
  if (!Deno.env.get("CURSEFORGE_API_KEY")) return fail("CurseForge API key is not configured", 500);

  let body: { action?: unknown; slug?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }

  try {
    if (body.action === "mods") {
      const key = "mods";
      const hit = cached(key);
      if (hit) return json({ mods: hit });
      const mods = await listMods();
      responseCache.set(key, { at: Date.now(), data: mods });
      return json({ mods });
    }
    if (body.action === "files" && typeof body.slug === "string") {
      const slug = body.slug;
      if (!PROJECTS.some((p) => p.slug === slug)) return fail("Unknown project", 404);
      const key = `files:${slug}`;
      const hit = cached(key);
      if (hit) return json({ files: hit });
      const files = await listFiles(slug);
      if (!files) return fail("Project not found", 404);
      responseCache.set(key, { at: Date.now(), data: files });
      return json({ files });
    }
    return fail("Unknown action");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Upstream request failed", 502);
  }
});
