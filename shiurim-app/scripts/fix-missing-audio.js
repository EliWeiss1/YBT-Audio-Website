/**
 * fix-missing-audio.js
 *
 * Fixes lectures with missing audioUrl by:
 * 1. Scanning all local MP3 files to build a prefix+number → Supabase URL map
 * 2. Matching unmatched lectures by normalizing their ID (stripping zero-padding)
 * 3. Writing the updated lectures.json
 *
 * Usage: node scripts/fix-missing-audio.js
 */

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const AUDIO_ROOT = "C:\\Users\\eliis\\My Drive\\TTL Organized";
const LECTURES_JSON_PATH = path.join(__dirname, "../data/lectures.json");
const BUCKET_NAME = "audio";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

// ─── Build URL map from local files ─────────────────────────────────────────
// Key: "PREFIX:NUMBER" (e.g. "KC:1", "C:6", "BN:9517")
// Value: Supabase public URL

function collectMp3s(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectMp3s(fullPath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".mp3"))
      results.push(fullPath);
  }
  return results;
}

function fileToUrl(absolutePath) {
  const relative = path.relative(AUDIO_ROOT, absolutePath).replace(/\\/g, "/");
  // URL-encode each path segment but preserve slashes
  const encoded = relative.split("/").map(seg => encodeURIComponent(seg)).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${encoded}`;
}

// Normalize an ID to a lookup key: "PREFIX:NUMBER"
// Handles: KC-001 → KC:1, C-006 → C:6, BN-9517 → BN:9517
// Also handles compound IDs like BN-9517-Afterlife (#1) → BN:9517
function idToKey(id) {
  const m = id.match(/^([A-Z]+)-0*(\d+)/i);
  if (!m) return null;
  return `${m[1].toUpperCase()}:${parseInt(m[2])}`;
}

// Build the map
console.log("Scanning local files...");
const mp3Files = collectMp3s(AUDIO_ROOT);
console.log(`Found ${mp3Files.length} MP3 files.\n`);

const keyToUrl = {};
for (const file of mp3Files) {
  const filename = path.basename(file);
  const m = filename.match(/^([A-Z]+)-0*(\d+)/i);
  if (m) {
    const key = `${m[1].toUpperCase()}:${parseInt(m[2])}`;
    keyToUrl[key] = fileToUrl(file);
  }
}
console.log(`Built URL map with ${Object.keys(keyToUrl).length} entries.\n`);

// ─── Also handle non-standard IDs ────────────────────────────────────────────
// For filenames that don't start with a standard ID, map by normalized filename
const filenameToUrl = {};
for (const file of mp3Files) {
  const base = path.basename(file, ".mp3").toLowerCase().replace(/\s+/g, " ").trim();
  filenameToUrl[base] = fileToUrl(file);
}

// ─── Patch the JSON ───────────────────────────────────────────────────────────
const json = JSON.parse(fs.readFileSync(LECTURES_JSON_PATH, "utf8"));

let fixed = 0;
let stillMissing = 0;
const stillMissingList = [];
const seenMissing = new Set();

function fix(node) {
  if (node.lectures) {
    node.lectures.forEach(l => {
      if (l.audioUrl && l.audioUrl.trim() !== "") return; // already has URL

      // Try standard prefix:number lookup
      const key = idToKey(l.id);
      if (key && keyToUrl[key]) {
        l.audioUrl = keyToUrl[key];
        fixed++;
        return;
      }

      // Try matching by title as filename (for non-standard IDs like "Adam's Sin - Paradise Lost")
      const titleKey = l.title.toLowerCase().replace(/\s+/g, " ").trim();
      if (filenameToUrl[titleKey]) {
        l.audioUrl = filenameToUrl[titleKey];
        fixed++;
        return;
      }

      // Still missing
      if (!seenMissing.has(l.id)) {
        seenMissing.add(l.id);
        stillMissingList.push({ id: l.id, title: l.title });
        stillMissing++;
      }
    });
  }
  (node.children || []).forEach(fix);
}

json.categories.forEach(fix);

fs.writeFileSync(LECTURES_JSON_PATH, JSON.stringify(json, null, 2), "utf8");

console.log(`✓ Fixed: ${fixed} lectures now have audioUrl.`);
console.log(`⚠ Still missing: ${stillMissing} unique lecture IDs.\n`);

if (stillMissingList.length) {
  // Group by prefix
  const byPrefix = {};
  stillMissingList.forEach(m => {
    const prefix = m.id.match(/^([A-Za-z\-]+)/)?.[1]?.replace(/-$/, "") || "OTHER";
    if (!byPrefix[prefix]) byPrefix[prefix] = [];
    byPrefix[prefix].push(m);
  });

  console.log("Still missing by category:");
  Object.entries(byPrefix).sort((a, b) => b[1].length - a[1].length).forEach(([p, items]) => {
    console.log(`  ${p}: ${items.length}`);
  });

  // Write a report
  const reportPath = path.join(__dirname, "../data/missing-audio-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(stillMissingList, null, 2), "utf8");
  console.log(`\nFull report written to data/missing-audio-report.json`);
}

console.log("\nDone. Commit lectures.json and push to GitHub.");
