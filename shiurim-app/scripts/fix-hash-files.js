/**
 * fix-hash-files.js
 *
 * Supabase Storage rejects filenames containing '#'.
 * This script:
 * 1. Finds all local MP3 files whose names contain '#'
 * 2. Re-uploads them with '#' replaced by 'no.' in the storage path
 * 3. Updates lectures.json so all audioUrls point to the new paths
 *
 * Usage: node scripts/fix-hash-files.js
 */

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const AUDIO_ROOT = "C:\\Users\\eliis\\My Drive\\TTL Organized";
const LECTURES_JSON_PATH = path.join(__dirname, "../data/lectures.json");
const BUCKET_NAME = "audio";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabase = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Convert an absolute local path to the Supabase storage path,
// replacing '#' with 'no.' in the filename only (not the folder names)
function toStoragePath(absolutePath) {
  const relative = path.relative(AUDIO_ROOT, absolutePath).replace(/\\/g, "/");
  const parts = relative.split("/");
  // Only sanitize the filename (last part), not folder names
  parts[parts.length - 1] = parts[parts.length - 1].replace(/#/g, "no.");
  return parts.join("/");
}

// Build the public URL from a storage path (only encode spaces and #)
function toPublicUrl(storagePath) {
  const encoded = storagePath
    .split("/")
    .map(seg => seg.replace(/ /g, "%20").replace(/#/g, "%23"))
    .join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${encoded}`;
}

// ─── Step 1: Find and upload all files with # in their name ──────────────────

console.log("Scanning for files with # in filename...");
const allFiles = collectMp3s(AUDIO_ROOT);
const hashFiles = allFiles.filter(f => path.basename(f).includes("#"));
console.log(`Found ${hashFiles.length} files with # in filename.\n`);

let uploaded = 0, skipped = 0, failed = 0;
const storagePathToUrl = {}; // old storage path (with #) → new public URL (with no.)

async function uploadAll() {
  for (let i = 0; i < hashFiles.length; i++) {
    const file = hashFiles[i];
    const filename = path.basename(file);
    const newStoragePath = toStoragePath(file); // # → no.
    const oldStoragePath = path.relative(AUDIO_ROOT, file).replace(/\\/g, "/"); // original with #
    const label = `[${i + 1}/${hashFiles.length}]`;

    process.stdout.write(`${label} ${filename} ... `);

    const fileBuffer = fs.readFileSync(file);
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(newStoragePath, fileBuffer, {
        contentType: "audio/mpeg",
        upsert: true, // overwrite if already attempted
      });

    const newUrl = toPublicUrl(newStoragePath);

    if (error && !error.message.includes("already exists")) {
      console.log(`✗ FAILED: ${error.message}`);
      failed++;
    } else {
      console.log("✓");
      uploaded++;
    }

    // Map both the old path and new path to the new URL
    storagePathToUrl[oldStoragePath] = newUrl;
    storagePathToUrl[newStoragePath] = newUrl;
  }
}

// ─── Step 2: Update lectures.json with new URLs ───────────────────────────────

function updateJson() {
  const json = JSON.parse(fs.readFileSync(LECTURES_JSON_PATH, "utf8"));
  let updated = 0;

  function walk(node) {
    if (node.lectures) {
      node.lectures.forEach(l => {
        if (!l.audioUrl) return;

        // Decode the current URL back to a storage path
        const urlBase = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/`;
        if (!l.audioUrl.startsWith(urlBase)) return;

        const encodedPath = l.audioUrl.slice(urlBase.length);
        let storagePath;
        try { storagePath = decodeURIComponent(encodedPath); }
        catch (e) { storagePath = encodedPath; }

        // If this file had a # in its filename, update to the new URL
        const filename = storagePath.split("/").pop();
        if (filename.includes("#")) {
          const newStoragePath = storagePath
            .split("/")
            .map((seg, i, arr) => i === arr.length - 1 ? seg.replace(/#/g, "no.") : seg)
            .join("/");
          l.audioUrl = toPublicUrl(newStoragePath);
          updated++;
        }
      });
    }
    (node.children || []).forEach(walk);
  }

  json.categories.forEach(walk);
  fs.writeFileSync(LECTURES_JSON_PATH, JSON.stringify(json, null, 2), "utf8");
  console.log(`\n✓ Updated ${updated} audioUrls in lectures.json.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

uploadAll().then(() => {
  console.log(`\nUpload complete: ${uploaded} uploaded, ${skipped} skipped, ${failed} failed.`);
  console.log("Updating lectures.json...");
  updateJson();
  console.log("Done. Commit lectures.json and push to GitHub.");
}).catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
