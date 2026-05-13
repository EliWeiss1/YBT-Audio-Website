/**
 * fix-duplicate-ids.js
 *
 * Removes unpadded duplicate IDs (e.g. D-6) where a zero-padded version (D-006)
 * already exists in the same JSON — keeping whichever version has the audioUrl.
 *
 * Usage: node scripts/fix-duplicate-ids.js
 */

const fs = require("fs");
const path = require("path");

const LECTURES_JSON_PATH = path.join(__dirname, "../data/lectures.json");
const json = JSON.parse(fs.readFileSync(LECTURES_JSON_PATH, "utf8"));

// ─── Step 1: Build a global map of normalizedKey → best audioUrl ──────────────
// "Best" = whichever version has a non-empty audioUrl
// normalizedKey = "PREFIX:NUMBER" e.g. "D:6", "KC:1"

function normalizeKey(id) {
  const m = id.match(/^([A-Z]+)-0*(\d+)$/i);
  if (!m) return null;
  return `${m[1].toUpperCase()}:${parseInt(m[2])}`;
}

const bestUrl = {}; // normalizedKey -> best audioUrl found
const bestId  = {}; // normalizedKey -> the ID that has the best url (zero-padded wins)

function collectBest(node) {
  if (node.lectures) {
    node.lectures.forEach(l => {
      const key = normalizeKey(l.id);
      if (!key) return;
      if (l.audioUrl && l.audioUrl.trim() !== "") {
        bestUrl[key] = l.audioUrl;
        bestId[key]  = l.id;
      } else if (!bestId[key]) {
        bestId[key] = l.id; // fallback if no url found yet
      }
    });
  }
  (node.children || []).forEach(collectBest);
}
json.categories.forEach(collectBest);

// ─── Step 2: For each node, deduplicate by normalizedKey ─────────────────────
// Keep the version that has the audioUrl; if both have it, keep zero-padded.
// Also make sure the kept version gets the correct audioUrl applied.

let removedCount = 0;
let urlsApplied  = 0;

function dedupeAndFix(node) {
  if (node.lectures) {
    const seenKeys = new Set();
    const before = node.lectures.length;

    node.lectures = node.lectures.filter(l => {
      const key = normalizeKey(l.id);

      // Non-standard ID (no key) — always keep
      if (!key) return true;

      // First time we see this key in this node — decide which version to keep
      if (!seenKeys.has(key)) {
        seenKeys.add(key);

        // Apply the best audioUrl to this entry
        if (bestUrl[key] && (!l.audioUrl || l.audioUrl.trim() === "")) {
          l.audioUrl = bestUrl[key];
          urlsApplied++;
        }

        // Standardize the ID to the zero-padded version (the one that has the url)
        if (bestId[key] && l.id !== bestId[key]) {
          l.id = bestId[key];
        }

        return true; // keep this entry
      }

      // Duplicate — remove it
      return false;
    });

    removedCount += before - node.lectures.length;
  }
  (node.children || []).forEach(dedupeAndFix);
}
json.categories.forEach(dedupeAndFix);

// ─── Step 3: Write output ─────────────────────────────────────────────────────
fs.writeFileSync(LECTURES_JSON_PATH, JSON.stringify(json, null, 2), "utf8");

console.log(`✓ Removed ${removedCount} duplicate ID entries.`);
console.log(`✓ Applied ${urlsApplied} missing audioUrls from their padded counterparts.`);
console.log(`\nDone. lectures.json updated in place.`);
