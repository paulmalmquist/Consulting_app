// Fetch one freely-licensed Wikimedia Commons image per Bottleneck Map node (Phase 9B).
// Reproducible + honest: queries the Commons API, accepts ONLY public-domain / CC licenses, downloads
// the thumbnail, and writes a provenance manifest (credit + license + source page). Re-run to refresh.
//
//   node scripts/telemetry/fetch_node_backdrops.mjs
//
// Output: repo-b/public/telemetry/backdrops/nodes/<id>.jpg  +  manifest.json
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../../repo-b/public/telemetry/backdrops/nodes");
const UA = "NovendorTelemetryDemo/1.0 (https://novendor.ai; info@novendor.ai) node-fetch";
const API = "https://commons.wikimedia.org/w/api.php";

// node id -> search query (targeted at a relevant, likely public-domain photo).
const NODES = [
  { id: "sputnik",      q: "Sputnik 1 satellite" },
  { id: "vostok",       q: "Yuri Gagarin Vostok 1961" },
  { id: "apollo11",     q: "Apollo 11 Saturn V launch 1969" },
  { id: "shuttle",      q: "Space Shuttle Columbia STS-1 launch" },
  { id: "iss",          q: "International Space Station orbit" },
  // falcon1: no distinct free Falcon 1 photo on Commons -> intentionally falls back to the cost era art
  // (avoids showing a Falcon 9 image mislabeled as Falcon 1).
  { id: "falcon9",      q: "Falcon 9 launch night" },
  { id: "dragon",       q: "SpaceX Dragon spacecraft ISS" },
  { id: "f9landing",    q: "Falcon 9 first stage landing zone" },
  { id: "falconheavy",  q: "Falcon Heavy launch" },
  { id: "crewdragon",   q: "Crew Dragon Demo-2 launch" },
  { id: "terran1",      q: "Terran 1 Relativity Space rocket" },
  { id: "starshipcatch", q: "Starship Super Heavy launch tower Boca Chica" },
  { id: "fleetscale",   q: "Falcon 9 rocket launch long exposure" },
  { id: "terranR",      q: "Relativity Space rocket factory" },
  { id: "artemis",      q: "Artemis I SLS rocket launch" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FREE = /(public domain|^pd|cc0|cc[ -]?by|attribution|gfdl)/i;
const NONFREE = /(non-free|fair use|copyright|all rights reserved)/i;

const stripHtml = (s = "") =>
  s.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 160);

async function pickImage(q) {
  const u = new URL(API);
  u.search = new URLSearchParams({
    action: "query", format: "json", generator: "search",
    gsrsearch: `${q} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "8",
    prop: "imageinfo", iiprop: "url|extmetadata|mime", iiurlwidth: "1600",
  }).toString();
  const res = await fetch(u, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`api ${res.status}`);
  const pages = Object.values((await res.json())?.query?.pages ?? {});
  pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/jpeg|jpg/i.test(ii.mime ?? "")) continue;
    const meta = ii.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value ?? meta.License?.value ?? "");
    if (!FREE.test(license) || NONFREE.test(license)) continue;
    return {
      title: p.title,
      license,
      artist: stripHtml(meta.Artist?.value ?? meta.Credit?.value ?? "Unknown"),
      descriptionUrl: ii.descriptionurl,
      thumbUrl: ii.thumburl ?? ii.url,
    };
  }
  return null;
}

async function download(url, dest) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429) { await sleep(4000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!/jpeg|jpg/i.test(res.headers.get("content-type") ?? "")) throw new Error("not a jpeg");
    await writeFile(dest, buf);
    return buf.length;
  }
  throw new Error("download 429 (rate limited)");
}

await mkdir(OUT_DIR, { recursive: true });
const manifest = [];
const usedTitles = new Set();
for (const node of NODES) {
  try {
    await sleep(1300); // pace Commons requests to avoid 429
    const hit = await pickImage(node.q);
    if (!hit) { console.log(`SKIP  ${node.id.padEnd(14)} no free image`); continue; }
    if (usedTitles.has(hit.title)) { console.log(`SKIP  ${node.id.padEnd(14)} duplicate of ${hit.title}`); continue; }
    usedTitles.add(hit.title);
    const bytes = await download(hit.thumbUrl, path.join(OUT_DIR, `${node.id}.jpg`));
    manifest.push({ id: node.id, file: `/telemetry/backdrops/nodes/${node.id}.jpg`,
      title: hit.title, license: hit.license, artist: hit.artist, source: hit.descriptionUrl });
    console.log(`OK    ${node.id.padEnd(14)} ${(bytes / 1024 | 0)}KB  ${hit.license}  ${hit.title}`);
  } catch (e) {
    console.log(`FAIL  ${node.id.padEnd(14)} ${e.message}`);
  }
}
await writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`\n${manifest.length}/${NODES.length} downloaded -> ${OUT_DIR}`);
