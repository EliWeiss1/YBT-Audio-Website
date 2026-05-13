/**
 * find-and-add-missing.js
 *
 * Scans every MP3 file under TTL Organized and finds ones whose ID
 * doesn't appear anywhere in lectures.json. For each missing file:
 *  1. Determines the correct JSON tree node from the file's folder path
 *  2. Adds a new lecture entry (with a generated title from the filename)
 *  3. Checks R2 — skips upload if already there
 *  4. Uploads to R2 if absent
 *  5. Sets the audioUrl in the new entry
 *
 * Flags:
 *   --dry-run   Print what would change without touching R2 or lectures.json
 *
 * Usage: node scripts/find-and-add-missing.js [--dry-run]
 */

require("dotenv").config({ path: ".env.local" });
const { S3Client, HeadObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs   = require("fs");
const path = require("path");

const DRY_RUN       = process.argv.includes("--dry-run");
const AUDIO_ROOT    = "C:\\Users\\eliis\\My Drive\\TTL Organized";
const JSON_PATH     = path.join(__dirname, "../data/lectures.json");
const R2_BUCKET     = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL.replace(/\/$/, "");

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// ── helpers ───────────────────────────────────────────────────────────────────

function toR2Key(absPath) {
  return path.relative(AUDIO_ROOT, absPath).replace(/\\/g, "/");
}

function toPublicUrl(key) {
  return `${R2_PUBLIC_URL}/${key.split("/").map(s => encodeURIComponent(s)).join("/")}`;
}

async function existsInR2(key) {
  try { await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; }
  catch { return false; }
}

async function uploadToR2(key, absPath) {
  const buf = fs.readFileSync(absPath);
  await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: "audio/mpeg" }));
  return buf.length;
}

/** Collect every MP3 under dir, returning absolute paths. */
function collectMp3s(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectMp3s(full, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".mp3")) out.push(full);
  }
  return out;
}

/** Extract a standard ID from a filename, e.g. "HL-195 Kavod..." → "HL-195". */
function extractId(filename) {
  const m = filename.match(/^([A-Za-z_]+-\d+)/);
  return m ? m[1] : null;
}

/**
 * Turn a filename (without .mp3) into a human-readable title.
 * Strips the leading ID, trims, replaces underscores with spaces.
 */
function filenameToTitle(filename) {
  const base = path.basename(filename, ".mp3");
  const id   = extractId(base);
  let title  = id ? base.slice(id.length).trim() : base;
  // Remove leading dash/space
  title = title.replace(/^[-\s]+/, "").replace(/_/g, " ").trim();
  return title || base;
}

/**
 * Build a map: folderPath (relative, forward slashes, lower) → tree node object.
 * We walk every leaf node and look at its existing audioUrls to infer its folder.
 * Falls back to label-matching against folder segments.
 */
function buildFolderToNodeMap(categories) {
  const map = new Map(); // normalised folder → node

  function walk(node) {
    if (node.lectures && node.lectures.length > 0) {
      // Try to infer folder from existing R2 or Supabase URLs
      for (const l of node.lectures) {
        const url = l.audioUrl || "";
        let folder = null;

        if (url.includes(R2_PUBLIC_URL)) {
          const key      = decodeURIComponent(url.slice(R2_PUBLIC_URL.length + 1));
          const parts    = key.split("/");
          if (parts.length > 1) folder = parts.slice(0, -1).join("/");
        } else if (url.includes("/storage/v1/object/public/audio/")) {
          const after    = decodeURIComponent(url.split("/storage/v1/object/public/audio/")[1]);
          const parts    = after.split("/");
          if (parts.length > 1) folder = parts.slice(0, -1).join("/");
        }

        if (folder) {
          const norm = folder.toLowerCase();
          if (!map.has(norm)) map.set(norm, node);
        }
      }
    }
    for (const c of node.children ?? []) walk(c);
  }

  categories.forEach(walk);
  return map;
}

/**
 * Given a relative file path like "Holidays/Shavuos/HL-195 ....mp3",
 * find the best matching node. First tries exact folder match,
 * then progressively broader matches.
 */
function findNode(relPath, folderMap, categories) {
  const parts  = relPath.replace(/\\/g, "/").split("/");
  const folder = parts.slice(0, -1).join("/");

  // Exact match first
  if (folderMap.has(folder.toLowerCase())) return folderMap.get(folder.toLowerCase());

  // Try matching on the last folder segment label
  function searchByLabel(node, segments) {
    if (!segments.length) return node;
    const target = segments[0].toLowerCase();
    for (const c of node.children ?? []) {
      if (c.label.toLowerCase() === target || c.id.toLowerCase() === target) {
        const found = searchByLabel(c, segments.slice(1));
        if (found) return found;
      }
    }
    // Fuzzy: label contains the segment or segment contains label
    for (const c of node.children ?? []) {
      const cl = c.label.toLowerCase();
      if (cl.includes(target) || target.includes(cl)) {
        const found = searchByLabel(c, segments.slice(1));
        if (found) return found;
      }
    }
    return null;
  }

  const root = { children: categories };
  return searchByLabel(root, parts.slice(0, -1)) ?? null;
}

/** Collect all IDs currently in the JSON, plus a set of ID prefixes for fuzzy matching. */
function collectAllIds(node, ids = new Set(), prefixes = new Set()) {
  for (const l of node.lectures ?? []) {
    ids.add(l.id);
    // Also index by the leading prefix+number so compound IDs like
    // "BN-9517-Afterlife (#1)" are found when we extract just "BN-9517"
    const m = l.id.match(/^([A-Za-z_]+-\d+)/);
    if (m) prefixes.add(m[1]);
  }
  for (const c of node.children ?? []) collectAllIds(c, ids, prefixes);
  return { ids, prefixes };
}

/** Guess speaker from folder/file name. */
function guessSpeaker(relPath) {
  const lower = relPath.toLowerCase();
  if (lower.includes("rav aaron") || lower.includes("rav_aaron")) return "Rav Aaron Soloveitchik";
  if (lower.includes("soloveitchick") || lower.includes("rav y.d")) return "Rav Y.D. Soloveitchick";
  return "Rabbi Chait";
}

/** Guess date from filename (looks for a 4-digit year). */
function guessDate(filename) {
  const m = filename.match(/\b(19|20)\d{2}\b/);
  return m ? `${m[0]}-01-01` : "";
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log("*** DRY RUN — nothing will be changed ***\n");

  const json     = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const { ids: allIds, prefixes: allPrefixes } = collectAllIds({ children: json.categories });
  const folderMap = buildFolderToNodeMap(json.categories);

  console.log(`JSON currently has ${allIds.size} unique IDs.\n`);
  console.log("Scanning local MP3 files...");
  const mp3s = collectMp3s(AUDIO_ROOT);
  console.log(`Found ${mp3s.length} local MP3 files.\n`);

  const missing    = [];
  const noId       = [];
  const noNode     = [];

  for (const absPath of mp3s) {
    const relPath  = path.relative(AUDIO_ROOT, absPath).replace(/\\/g, "/");
    const filename = path.basename(absPath);
    const id       = extractId(filename);

    if (!id) { noId.push(relPath); continue; }
    if (allIds.has(id) || allPrefixes.has(id)) continue; // already in JSON (exact or compound ID)

    // Skip duplicate local files — if we've already queued this ID, take the
    // shorter/cleaner filename (no underscore prefix) and skip the other
    if (missing.some(m => m.id === id)) {
      // Keep whichever filename doesn't start with the ID + underscore
      const existing = missing.find(m => m.id === id);
      if (path.basename(absPath).includes(id + "_") && !path.basename(existing.absPath).includes(id + "_")) {
        continue; // skip this underscore duplicate
      } else {
        missing.splice(missing.indexOf(existing), 1); // replace with the cleaner one
      }
    }

    const node = findNode(relPath, folderMap, json.categories);
    if (!node) { noNode.push({ id, relPath }); continue; }

    missing.push({ id, absPath, relPath, filename, node });
  }

  console.log(`Files with no standard ID:             ${noId.length}`);
  console.log(`Missing from JSON, no matching node:   ${noNode.length}`);
  console.log(`Missing from JSON, can add:            ${missing.length}\n`);

  if (noNode.length) {
    console.log("=== Could not find node for these files ===");
    noNode.forEach(e => console.log(`  ${e.id}: ${e.relPath}`));
    console.log();
  }

  if (missing.length === 0) {
    console.log("Nothing to add. lectures.json is up to date.");
    return;
  }

  console.log("=== Adding missing lectures ===\n");
  let added = 0, uploaded = 0, alreadyInR2 = 0, failed = 0;

  for (const { id, absPath, relPath, filename, node } of missing) {
    const r2Key  = toR2Key(absPath);
    const title  = filenameToTitle(filename);

    process.stdout.write(`  [${id}] ${title.slice(0, 50)} ... `);

    if (DRY_RUN) {
      console.log(`would add to "${node.label}" node, key: ${r2Key}`);
      continue;
    }

    // Check / upload R2
    let audioUrl = "";
    if (await existsInR2(r2Key)) {
      audioUrl = toPublicUrl(r2Key);
      console.log(`R2 already has file`);
      alreadyInR2++;
    } else {
      try {
        const bytes = await uploadToR2(r2Key, absPath);
        audioUrl    = toPublicUrl(r2Key);
        console.log(`uploaded ${(bytes / 1024 / 1024).toFixed(1)} MB`);
        uploaded++;
      } catch (err) {
        console.log(`UPLOAD FAILED: ${err.message}`);
        failed++;
        audioUrl = ""; // add entry anyway, audio will be blank
      }
    }

    // Add lecture entry to the node
    const newLecture = {
      id,
      title,
      audioUrl,
      duration:    0,
      description: "",
      speaker:     guessSpeaker(relPath),
      date:        guessDate(filename),
      tags:        [],
    };

    if (!node.lectures) node.lectures = [];
    // Insert in sorted order by ID number
    const idNum = parseInt(id.replace(/[^0-9]/g, ""));
    const insertAt = node.lectures.findIndex(l => {
      const n = parseInt(l.id.replace(/[^0-9]/g, ""));
      return n > idNum;
    });
    if (insertAt === -1) node.lectures.push(newLecture);
    else node.lectures.splice(insertAt, 0, newLecture);

    allIds.add(id); // prevent double-add if same id somehow appears twice locally
    added++;
  }

  if (!DRY_RUN) {
    fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2), "utf8");
    console.log(`\n✓ Added ${added} lectures to lectures.json.`);
    console.log(`  R2: ${alreadyInR2} already there, ${uploaded} newly uploaded, ${failed} failed.`);
    if (failed) console.log("  Re-run to retry failed uploads.");
    console.log("\nDone. Commit lectures.json.");
  } else {
    console.log(`\n[dry-run] Would add ${missing.length} lectures.`);
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
