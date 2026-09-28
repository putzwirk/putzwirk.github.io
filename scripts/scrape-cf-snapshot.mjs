import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "fs";

const OUT = new URL("../public/cf-snapshot.json", import.meta.url);
const IDS = JSON.parse(readFileSync(new URL("./cf-file-ids.json", import.meta.url), "utf8"));
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

const [startArg, endArg] = process.argv.slice(2).map(Number);
const START = Number.isFinite(startArg) ? startArg : 0;
const END = Number.isFinite(endArg) ? endArg : PROJECTS.length;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseDownloads(text) {
  let best = null;
  for (const line of String(text).split("\n")) {
    const m = line.replace(/,/g, "").match(/([\d.]+)\s*([KM]?)\s*downloads/i);
    if (!m) continue;
    const mult = m[2] === "M" ? 1e6 : m[2] === "K" ? 1e3 : 1;
    const value = Math.round(parseFloat(m[1]) * mult);
    if (best === null || value > best) best = value;
  }
  return best;
}

function cleanSummary(text) {
  const first = String(text).split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return first.slice(0, 220);
}

function cleanChangelog(html) {
  if (!html) return null;
  if (/no changelog/i.test(html.replace(/<[^>]*>/g, ""))) return null;
  return html;
}

async function scrapeFilePage(page, entry, base, id) {
  const stored = entry.files[id] ?? {};
  try {
    await page.goto(`${base}/files/${id}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2200);
    stored.changelog = cleanChangelog(await page.locator(".changelog").first().innerHTML().catch(() => null));
    const details = await page.locator("main").first().innerText().catch(() => "");
    const dls = parseDownloads(details);
    if (dls !== null) stored.downloads = dls;
  } catch {
    /* keep what we have */
  }
  entry.files[id] = stored;
  await sleep(1000);
}

async function enumerateIndex(page, base) {
  const fileIndex = new Map();
  const collectLinks = async () => {
    let lastCount = -1;
    for (let s = 0; s < 12; s += 1) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
      const count = await page.locator("a[href*='/files/']").count();
      if (count === lastCount) break;
      lastCount = count;
    }
    const items = await page.locator("a[href*='/files/']").evaluateAll((els) => {
      const out = [];
      for (const e of els) {
        const h = e.getAttribute("href");
        if (h && /\/files\/\d+/.test(h)) out.push([h, (e.innerText || "").replace(/\s+/g, " ").trim()]);
      }
      return out;
    });
    for (const [href, text] of items) {
      const id = href.match(/\/files\/(\d+)/)[1];
      if (!fileIndex.has(id)) fileIndex.set(id, text);
    }
  };
  const indexUrls = [`${base}/files/all?page=1`];
  try {
    await page.goto(`${base}/files/all`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
    const versions = await page.locator("a[href*='version=']").evaluateAll((els) => {
      const out = new Set();
      for (const e of els) {
        const m = (e.getAttribute("href") || "").match(/[?&]version=([^&]+)/);
        if (m) out.add(decodeURIComponent(m[1]));
      }
      return [...out];
    });
    for (const v of versions) indexUrls.push(`${base}/files/all?version=${encodeURIComponent(v)}`);
  } catch {
    /* fall through */
  }
  for (const url of indexUrls) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(1800);
      await collectLinks();
    } catch {
      continue;
    }
    await sleep(1000);
  }
  return fileIndex;
}

function parseIndexText(entry, id, text) {
  const parts = text.split(" ");
  const stored = entry.files[id] ?? {};
  stored.name = parts[0] || stored.name;
  const middle = parts.slice(1, -3);
  if (middle[0]) stored.releaseType = middle[0];
  if (middle[1]) stored.gameHint = middle[1];
  if (middle.length > 2) stored.loaderHint = middle.slice(2).join(" ");
  if (parts.length >= 3) stored.dateHint = parts.slice(-3).join(" ");
  entry.files[id] = stored;
}

async function main() {
  const snapshot = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { scrapedAt: null, projects: {} };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    locale: "en-US",
  });
  const page = await ctx.newPage();

  for (let i = START; i < Math.min(END, PROJECTS.length); i += 1) {
    const [type, slug] = PROJECTS[i];
    const base = `https://www.curseforge.com/minecraft/${type}/${slug}`;
    console.log(`[${i}] ${slug}`);
    const entry = snapshot.projects[slug] ?? { files: {} };

    try {
      await page.goto(base, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(3000);
      const ogTitle = await page.locator("meta[property='og:title']").getAttribute("content").catch(() => null);
      const ogDesc = await page.locator("meta[property='og:description']").getAttribute("content").catch(() => null);
      const ogImage = await page.locator("meta[property='og:image']").getAttribute("content").catch(() => null);
      entry.title = (ogTitle ?? slug).replace(/\s*-\s*Minecraft.*$/i, "").trim();
      entry.summary = cleanSummary(ogDesc ?? "");
      entry.avatar = ogImage ?? entry.avatar ?? null;
      const dlText = await page.locator("main").first().innerText().catch(() => "");
      entry.downloadsTotal = parseDownloads(dlText) ?? entry.downloadsTotal ?? null;
    } catch {
      console.log("  project page failed");
    }

    if (IDS[slug]) {
      console.log(`  ${IDS[slug].length} known files`);
      for (const id of IDS[slug]) {
        await scrapeFilePage(page, entry, base, String(id));
      }
    } else {
      const index = await enumerateIndex(page, base);
      console.log(`  ${index.size} indexed files`);
      for (const [id, text] of index) {
        parseIndexText(entry, id, text);
        await scrapeFilePage(page, entry, base, id);
      }
    }

    snapshot.projects[slug] = entry;
    snapshot.scrapedAt = new Date().toISOString();
    writeFileSync(OUT, JSON.stringify(snapshot, null, 1));
    console.log(`  saved (${Object.keys(entry.files).length} files)`);
  }

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
