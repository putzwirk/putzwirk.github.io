export const CURSEFORGE_MEMBER_URL = "https://www.curseforge.com/members/neuromuser/projects";

const CFWIDGET_BASE = "https://api.cfwidget.com/minecraft";
const USER_AGENT = "putzwirk.github.io/1.0 (contact via github.com/putzwirk)";

const cfwidgetUrl = (type: string, slug: string) => `${CFWIDGET_BASE}/${type}/${slug}`;

export const CF_PROJECTS: Array<{ slug: string; type: string }> = [
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

export const mcModId = (slug: string) => `mc-${slug}`;
export const MC_IDEAS_MOD_ID = "mc-ideas";

export interface McMod {
  slug: string;
  title: string;
  description: string;
  longDescription: string;
  iconUrl: string | null;
  downloads: number;
  loaders: string[];
  gameVersions: string[];
  categories: string[];
  curseforgeUrl: string;
  cfSlug: string;
  cfType: string;
  type: "mod" | "modpack";
}

import { invokeOrThrow } from "./functions";

export interface McVersion {
  id: string;
  name: string;
  versionNumber: string | null;
  changelog: string;
  gameVersions: string[];
  loaders: string[];
  downloads: number;
  date: string;
  source: "curseforge";
  url: string;
  filename: string;
  release: "release" | "beta" | "alpha";
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Request failed (${res.status}) for ${url}`);
  return res.json() as Promise<T>;
}

interface CfFile {
  id: number;
  url: string;
  display: string;
  name: string;
  type: string;
  version: string;
  filesize: number;
  versions: string[];
  downloads: number;
  uploaded_at: string;
}

interface CfProject {
  title: string;
  summary: string;
  description: string;
  thumbnail: string | null;
  categories: string[];
  created_at: string;
  downloads: { total: number };
  files: CfFile[];
}

interface SnapshotFile {
  name?: string;
  releaseType?: string;
  gameHint?: string;
  loaderHint?: string;
  dateHint?: string;
  changelog?: string | null;
  downloads?: number;
}

interface SnapshotProject {
  title?: string;
  summary?: string;
  avatar?: string | null;
  downloadsTotal?: number | null;
  files: Record<string, SnapshotFile>;
}

interface Snapshot {
  scrapedAt: string | null;
  projects: Record<string, SnapshotProject>;
}

const modCache = new Map<string, { at: number; value: McMod[] }>();
const detailCache = new Map<string, { at: number; value: { mod: McMod; versions: McVersion[] } }>();
const cfCache = new Map<string, CfProject>();
let snapshotPromise: Promise<Snapshot | null> | null = null;
const CACHE_TTL = 10 * 60 * 1000;

export function curseforgeProjectUrl(cfType: string, cfSlug: string): string {
  return `https://www.curseforge.com/minecraft/${cfType}/${cfSlug}`;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitCfTags(versions: string[]): { loaders: string[]; gameVersions: string[] } {
  const loaders = versions.filter((v) => !/^\d/.test(v) && v !== "Client" && v !== "Server");
  const gameVersions = versions.filter((v) => /^\d/.test(v));
  return { loaders, gameVersions };
}

function cfFileDirectUrl(fileUrl: string): string {
  return fileUrl.replace("/files/", "/download/");
}

function loadSnapshot(): Promise<Snapshot | null> {
  if (!snapshotPromise) {
    snapshotPromise = fetch(`${import.meta.env.BASE_URL}cf-snapshot.json`)
      .then((res) => (res.ok ? (res.json() as Promise<Snapshot>) : null))
      .catch(() => null);
  }
  return snapshotPromise;
}

function cfFileToVersion(file: CfFile, changelog: string): McVersion {
  const { loaders, gameVersions } = splitCfTags(file.versions);
  const type = file.type?.toLowerCase();
  return {
    id: `cf-${file.id}`,
    name: file.display || file.name,
    versionNumber: null,
    changelog,
    gameVersions,
    loaders,
    downloads: file.downloads ?? 0,
    date: file.uploaded_at,
    source: "curseforge",
    url: cfFileDirectUrl(file.url),
    filename: file.name || file.display,
    release: type === "alpha" ? "alpha" : type === "beta" ? "beta" : "release",
  };
}

function snapshotFileToVersion(slug: string, cfType: string, id: string, file: SnapshotFile): McVersion {
  const gameVersions = file.gameHint ? [file.gameHint] : [];
  const loaders = file.loaderHint ? [file.loaderHint] : [];
  const parsed = file.dateHint ? Date.parse(file.dateHint) : NaN;
  return {
    id: `cf-${id}`,
    name: file.name || `File ${id}`,
    versionNumber: null,
    changelog: file.changelog ? htmlToText(file.changelog) : "",
    gameVersions,
    loaders,
    downloads: file.downloads ?? 0,
    date: Number.isFinite(parsed) ? new Date(parsed).toISOString() : "",
    source: "curseforge",
    url: `${curseforgeProjectUrl(cfType, slug)}/download/${id}`,
    filename: file.name || `File ${id}`,
    release: file.releaseType === "A" ? "alpha" : file.releaseType === "B" ? "beta" : "release",
  };
}

function buildModFromCf(slug: string, type: string, cf: CfProject): McMod {
  const loaders = new Set<string>();
  const games = new Set<string>();
  for (const file of cf.files ?? []) {
    const { loaders: fl, gameVersions: fg } = splitCfTags(file.versions);
    fl.forEach((l) => loaders.add(l));
    fg.forEach((g) => games.add(g));
  }
  return {
    slug,
    title: cf.title,
    description: cf.summary ?? "",
    longDescription: cf.description ?? "",
    iconUrl: cf.thumbnail,
    downloads: cf.downloads?.total ?? 0,
    loaders: [...loaders],
    gameVersions: [...games],
    categories: cf.categories ?? [],
    curseforgeUrl: curseforgeProjectUrl(type, slug),
    cfSlug: slug,
    cfType: type,
    type: type === "modpacks" ? "modpack" : "mod",
  };
}

function buildModFromSnapshot(slug: string, type: string, snap: SnapshotProject): McMod {
  const loaders = new Set<string>();
  const games = new Set<string>();
  for (const file of Object.values(snap.files ?? {})) {
    if (file.loaderHint) loaders.add(file.loaderHint);
    if (file.gameHint) games.add(file.gameHint);
  }
  return {
    slug,
    title: snap.title ?? slug,
    description: snap.summary ?? "",
    longDescription: "",
    iconUrl: snap.avatar ?? null,
    downloads: snap.downloadsTotal ?? 0,
    loaders: [...loaders],
    gameVersions: [...games],
    categories: [],
    curseforgeUrl: curseforgeProjectUrl(type, slug),
    cfSlug: slug,
    cfType: type,
    type: type === "modpacks" ? "modpack" : "mod",
  };
}

interface CfApiMod {
  id: number;
  slug: string;
  name: string;
  summary: string;
  description: string;
  logoUrl: string | null;
  downloadCount: number;
  dateCreated: string;
  authors: string[];
  categories: string[];
  websiteUrl: string | null;
  type: string;
  loaders: string[];
  gameVersions: string[];
  fileCount: number;
}

interface CfApiFile {
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

function releaseLabel(releaseType: number): "release" | "beta" | "alpha" {
  return releaseType === 3 ? "alpha" : releaseType === 2 ? "beta" : "release";
}

function buildModFromApi(p: { slug: string; type: string }, m: CfApiMod): McMod {
  return {
    slug: p.slug,
    title: m.name,
    description: m.summary ?? "",
    longDescription: m.description ?? "",
    iconUrl: m.logoUrl,
    downloads: m.downloadCount ?? 0,
    loaders: m.loaders ?? [],
    gameVersions: m.gameVersions ?? [],
    categories: m.categories ?? [],
    curseforgeUrl: curseforgeProjectUrl(p.type, p.slug),
    cfSlug: p.slug,
    cfType: p.type,
    type: p.type === "modpacks" ? "modpack" : "mod",
  };
}

function apiFileToVersion(file: CfApiFile, snapshotChangelog: string): McVersion {
  const { loaders, gameVersions } = splitCfTags(file.gameVersions);
  const changelog = file.changelog ? htmlToText(file.changelog) : snapshotChangelog;
  return {
    id: `cf-${file.id}`,
    name: file.displayName || file.fileName,
    versionNumber: null,
    changelog,
    gameVersions,
    loaders,
    downloads: file.downloadCount ?? 0,
    date: file.fileDate,
    source: "curseforge",
    url: file.downloadUrl || cfFileDirectUrl(`https://www.curseforge.com/files/${file.id}`),
    filename: file.fileName,
    release: releaseLabel(file.releaseType),
  };
}

export async function fetchMcMods(): Promise<McMod[]> {
  const cached = modCache.get("list");
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.value;
  try {
    const { mods } = await invokeOrThrow<{ mods: CfApiMod[] }>("cf-proxy", { action: "mods" });
    const bySlug = new Map(mods.map((m) => [m.slug, m]));
    const mapped = CF_PROJECTS.map((p) => {
      const m = bySlug.get(p.slug);
      return m ? buildModFromApi(p, m) : null;
    }).filter((m): m is McMod => m !== null);
    if (mapped.length === 0) throw new Error("Empty mod list");
    mapped.sort((a, b) => b.downloads - a.downloads);
    modCache.set("list", { at: Date.now(), value: mapped });
    return mapped;
  } catch {
    return fetchMcModsLegacy();
  }
}

async function fetchMcModsLegacy(): Promise<McMod[]> {
  const cached = modCache.get("list");
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.value;
  const [snapshot, ...cfResults] = await Promise.all([
    loadSnapshot(),
    ...CF_PROJECTS.map((p) =>
      fetchJson<CfProject>(cfwidgetUrl(p.type, p.slug))
        .then((cf) => {
          cfCache.set(p.slug, cf);
          return cf;
        })
        .catch(() => null),
    ),
  ]);
  const mods = CF_PROJECTS.map((p, i) => {
    const cf = cfResults[i];
    if (cf) return buildModFromCf(p.slug, p.type, cf);
    const snap = snapshot?.projects[p.slug];
    if (snap) return buildModFromSnapshot(p.slug, p.type, snap);
    return null;
  }).filter((m): m is McMod => m !== null);
  mods.sort((a, b) => b.downloads - a.downloads);
  modCache.set("list", { at: Date.now(), value: mods });
  return mods;
}

export function compareGameVersions(a: string, b: string): number {
  const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number);
  const pb = b.split(/[^0-9]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function maxGameVersion(versions: string[]): string | null {
  let best: string | null = null;
  for (const v of versions) {
    if (/^\d/.test(v) && (best === null || compareGameVersions(v, best) > 0)) best = v;
  }
  return best;
}

export async function fetchMcModDetail(slug: string): Promise<{ mod: McMod; versions: McVersion[] }> {
  const cached = detailCache.get(slug);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.value;
  try {
    const mods = await fetchMcMods();
    const mod = mods.find((m) => m.slug === slug);
    if (!mod) throw new Error("Mod not found.");
    const { files } = await invokeOrThrow<{ files: CfApiFile[] }>("cf-proxy", { action: "files", slug });
    const snapshot = await loadSnapshot();
    const snapFiles = snapshot?.projects[slug]?.files ?? {};
    const versions = files
      .map((file) => {
        const raw = snapFiles[String(file.id)]?.changelog ?? null;
        return apiFileToVersion(file, raw ? htmlToText(raw) : "");
      })
      .sort((a, b) => +new Date(b.date || 0) - +new Date(a.date || 0));
    if (versions.length === 0) throw new Error("Empty version list");
    const result = { mod, versions };
    detailCache.set(slug, { at: Date.now(), value: result });
    return result;
  } catch {
    return fetchMcModDetailLegacy(slug);
  }
}

async function fetchMcModDetailLegacy(slug: string): Promise<{ mod: McMod; versions: McVersion[] }> {
  const cached = detailCache.get(slug);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.value;
  const mods = await fetchMcMods();
  const mod = mods.find((m) => m.slug === slug);
  if (!mod) throw new Error("Mod not found.");
  const snapshot = await loadSnapshot();
  const snapFiles = snapshot?.projects[slug]?.files ?? {};
  let cf = cfCache.get(slug) ?? null;
  if (!cf) {
    try {
      cf = await fetchJson<CfProject>(cfwidgetUrl(mod.cfType, mod.cfSlug));
      cfCache.set(slug, cf);
    } catch {
      cf = null;
    }
  }
  let versions: McVersion[];
  if (cf && (cf.files ?? []).length > 0) {
    versions = cf.files.map((file) => {
      const raw = snapFiles[String(file.id)]?.changelog ?? null;
      return cfFileToVersion(file, raw ? htmlToText(raw) : "");
    });
  } else {
    versions = Object.entries(snapFiles).map(([id, file]) => snapshotFileToVersion(slug, mod.cfType, id, file));
  }
  versions.sort((a, b) => +new Date(b.date || 0) - +new Date(a.date || 0));
  const result = { mod, versions };
  detailCache.set(slug, { at: Date.now(), value: result });
  return result;
}
