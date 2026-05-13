/**
 * cleanup-after-fix.js
 *
 * Run this AFTER confirming the new 'no.' uploads are working correctly.
 * 
 * This script:
 * 1. Deletes the old '#' versions from Supabase Storage (they're broken anyway)
 * 2. Deduplicates lectures.json — removes any leftover padded/unpadded duplicates
 *    while always keeping the entry that has a working audioUrl
 *
 * Usage: node scripts/cleanup-after-fix.js
 */

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const AUDIO_ROOT = "C:\\Users\\eliis\\My Drive\\TTL Organized";
const LECTURES_JSON_PATH = path.join(__dirname, "../data/lectures.json");
const BUCKET_NAME = "audio";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Step 1: Delete old # files from Supabase Storage ────────────────────────

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

async function deleteOldHashFiles() {
  console.log("=== Step 1: Deleting old '#' files from Supabase ===\n");

  const allFiles = collectMp3s(AUDIO_ROOT);
  const hashFiles = allFiles.filter(f => path.basename(f).includes("#"));
  console.log(`Found ${hashFiles.length} files that had '#' in their name.\n`);

  // Build the old storage paths (with # as-is — this is what the original
  // upload script tried to store them as)
  const oldPaths = hashFiles.map(f =>
    path.relative(AUDIO_ROOT, f).replace(/\\/g, "/")
  );

  // Delete in batches of 100 (Supabase limit)
  let deleted = 0, notFound = 0, failed = 0;
  const batchSize = 100;

  for (let i = 0; i < oldPaths.length; i += batchSize) {
    const batch = oldPaths.slice(i, i + batchSize);
    const { error } = await supabase.storage.from(BUCKET_NAME).remove(batch);

    if (error) {
      console.error(`Batch ${Math.floor(i/batchSize)+1} error:`, error.message);
      failed += batch.length;
    } else {
      deleted += batch.length;
      process.stdout.write(`Deleted batch ${Math.floor(i/batchSize)+1}/${Math.ceil(oldPaths.length/batchSize)}\r`);
    }
  }

  console.log(`\n✓ Deletion complete: ${deleted} paths removed, ${failed} errors.`);
  console.log("(Files that were never successfully uploaded will show no error — that's fine.)\n");
}

// ─── Step 2: Deduplicate lectures.json ───────────────────────────────────────

function deduplicateJson() {
  console.log("=== Step 2: Deduplicating lectures.json ===\n");

  const json = JSON.parse(fs.readFileSync(LECTURES_JSON_PATH, "utf8"));

  // Normalize an ID to prefix:number key
  function normalizeKey(id) {
    const m = id.match(/^([A-Z]+)-0*(\d+)$/i);
    if (!m) return null;
    return `${m[1].toUpperCase()}:${parseInt(m[2])}`;
  }

  let removedDupes = 0;

  function processNode(node) {
    if (node.lectures && node.lectures.length > 0) {
      // For each normalized key, find the entry with the best URL
      const bestForKey = {};
      node.lectures.forEach(l => {
        const key = normalizeKey(l.id);
        if (!key) return;
        const hasUrl = l.audioUrl && l.audioUrl.trim() !== "";
        if (!bestForKey[key]) {
          bestForKey[key] = { entry: l, hasUrl };
        } else if (hasUrl && !bestForKey[key].hasUrl) {
          // This one has a URL and the existing best doesn't — replace
          bestForKey[key] = { entry: l, hasUrl };
        } else if (hasUrl && bestForKey[key].hasUrl) {
          // Both have URLs — prefer the one whose URL contains 'no.' (the fixed version)
          if (l.audioUrl.includes("no.") && !bestForKey[key].entry.audioUrl.includes("no.")) {
            bestForKey[key] = { entry: l, hasUrl };
          }
        }
      });

      // Now filter: keep only the first occurrence of each key,
      // making sure it uses the best URL
      const seenKeys = new Set();
      const before = node.lectures.length;

      node.lectures = node.lectures.filter(l => {
        const key = normalizeKey(l.id);

        // Non-standard ID — always keep
        if (!key) return true;

        if (seenKeys.has(key)) return false; // duplicate, drop it
        seenKeys.add(key);

        // Apply the best URL to this kept entry
        const best = bestForKey[key];
        if (best && best.entry.audioUrl && best.entry.audioUrl !== l.audioUrl) {
          l.audioUrl = best.entry.audioUrl;
          l.id = best.entry.id; // use the canonical (padded) ID
        }

        return true;
      });

      removedDupes += before - node.lectures.length;
    }

    (node.children || []).forEach(processNode);
  }

  json.categories.forEach(processNode);

  fs.writeFileSync(LECTURES_JSON_PATH, JSON.stringify(json, null, 2), "utf8");

  console.log(`✓ Removed ${removedDupes} duplicate lecture entries from lectures.json.`);

  // Final count
  let withUrl = 0, withoutUrl = 0;
  function count(node) {
    if (node.lectures) node.lectures.forEach(l => {
      if (l.audioUrl && l.audioUrl.trim()) withUrl++; else withoutUrl++;
    });
    (node.children || []).forEach(count);
  }
  json.categories.forEach(count);
  console.log(`✓ Final state: ${withUrl} lectures with audio, ${withoutUrl} without.\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await deleteOldHashFiles();
  deduplicateJson();
  console.log("All done. Commit lectures.json and push to GitHub.");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
