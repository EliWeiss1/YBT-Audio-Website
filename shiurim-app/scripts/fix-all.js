/**
 * fix-all.js
 *
 * One script to fix everything:
 * 1. Builds a URL map by scanning local MP3 files
 * 2. Removes padded/unpadded duplicate IDs within each node (keeps whichever has the URL)
 * 3. Fills in any remaining missing audioUrls by matching prefix+number
 * 4. Writes the fixed lectures.json in place
 *
 * Usage: node scripts/fix-all.js
 */

require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");

const AUDIO_ROOT = "C:\\Users\\eliis\\My Drive\\TTL Organized";
const LECTURES_JSON_PATH = path.join(__dirname, "../data/lectures.json");
const BUCKET_NAME = "audio";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

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

function fileToUrl(absolutePath) {
  const relative = path.relative(AUDIO_ROOT, absolutePath).replace(/\\/g, "/");
  const encoded = relative.split("/").map(seg => encodeURIComponent(seg)).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${encoded}`;
}

// "D-006" or "D-6" → "D:6"
function normalizeKey(id) {
  const m = id.match(/^([A-Z]+)-0*(\d+)$/i);
  if (!m) return null;
  return `${m[1].toUpperCase()}:${parseInt(m[2])}`;
}

// ─── Step 1: Build URL map from local files ───────────────────────────────────

console.log("Scanning local MP3 files...");
const mp3Files = collectMp3s(AUDIO_ROOT);
console.log(`Found ${mp3Files.length} files.\n`);

// keyToUrl: "D:6" → url  (from the actual filename on disk)
// titleToUrl: normalized filename → url  (fallback for non-standard IDs)
const keyToUrl = {};
const titleToUrl = {};

for (const file of mp3Files) {
  const url = fileToUrl(file);
  const filename = path.basename(file, ".mp3");

  // Standard ID match from filename
  const m = filename.match(/^([A-Z]+)-0*(\d+)/i);
  if (m) {
    const key = `${m[1].toUpperCase()}:${parseInt(m[2])}`;
    keyToUrl[key] = url;
  }

  // Title fallback (normalize spaces/case)
  const titleKey = filename.toLowerCase().replace(/\s+/g, " ").trim();
  titleToUrl[titleKey] = url;
}

console.log(`URL map: ${Object.keys(keyToUrl).length} standard entries, ${Object.keys(titleToUrl).length} by filename.\n`);

// ─── Step 2: Load JSON ────────────────────────────────────────────────────────

const json = JSON.parse(fs.readFileSync(LECTURES_JSON_PATH, "utf8"));

// ─── Step 3: For each node, deduplicate AND fill missing URLs ─────────────────

let removedDupes = 0;
let urlsFilled = 0;
let stillMissing = 0;
const missingList = [];
const seenMissing = new Set();

function processNode(node) {
  if (node.lectures) {

    // First pass: find the best URL and canonical ID for each normalizedKey in this node
    const bestForKey = {}; // key → { url, id }
    node.lectures.forEach(l => {
      const key = normalizeKey(l.id);
      if (!key) return;

      const existingUrl = l.audioUrl && l.audioUrl.trim() !== "" ? l.audioUrl : null;
      const localUrl = existingUrl || keyToUrl[key];

      if (!bestForKey[key]) {
        bestForKey[key] = { url: localUrl || null, id: l.id };
      } else {
        // Prefer zero-padded ID (longer = more digits = padded)
        if (l.id.length > bestForKey[key].id.length) {
          bestForKey[key].id = l.id;
        }
        // Prefer whichever has a URL
        if (localUrl && !bestForKey[key].url) {
          bestForKey[key].url = localUrl;
        }
      }
    });

    // Second pass: filter duplicates and apply best URL + canonical ID
    const seenKeys = new Set();
    const before = node.lectures.length;

    node.lectures = node.lectures.filter(l => {
      const key = normalizeKey(l.id);

      // Non-standard ID (e.g. "Adam's Sin - Paradise Lost") — always keep
      if (!key) {
        if (!l.audioUrl || l.audioUrl.trim() === "") {
          // Try matching by title against filenames
          const titleNorm = l.title.toLowerCase().replace(/\s+/g, " ").trim();
          for (const [fileKey, url] of Object.entries(titleToUrl)) {
            // Strip leading ID prefix from fileKey for comparison
            const fileTitle = fileKey.replace(/^[a-z]+-\d+\s+/i, "");
            if (fileTitle === titleNorm || fileKey === titleNorm) {
              l.audioUrl = url;
              urlsFilled++;
              break;
            }
          }
        }
        return true;
      }

      // Already seen this key in this node — it's a duplicate, drop it
      if (seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);

      // Apply canonical ID (zero-padded) and best URL
      const best = bestForKey[key];
      if (best) {
        l.id = best.id; // standardize to zero-padded version

        if (best.url && (!l.audioUrl || l.audioUrl.trim() === "")) {
          l.audioUrl = best.url;
          urlsFilled++;
        }
      }

      // If still no URL, try local file map directly
      if (!l.audioUrl || l.audioUrl.trim() === "") {
        const localUrl = keyToUrl[key];
        if (localUrl) {
          l.audioUrl = localUrl;
          urlsFilled++;
        } else {
          // Genuinely missing — no local file found
          if (!seenMissing.has(l.id)) {
            seenMissing.add(l.id);
            missingList.push({ id: l.id, title: l.title });
            stillMissing++;
          }
        }
      }

      return true;
    });

    removedDupes += before - node.lectures.length;
  }

  (node.children || []).forEach(processNode);
}

json.categories.forEach(processNode);

// ─── Step 4: Write output ─────────────────────────────────────────────────────

fs.writeFileSync(LECTURES_JSON_PATH, JSON.stringify(json, null, 2), "utf8");

console.log(`✓ Removed ${removedDupes} duplicate entries.`);
console.log(`✓ Filled ${urlsFilled} missing audioUrls.`);
console.log(`⚠ Still missing: ${stillMissing} unique lectures with no matching local file.\n`);

if (missingList.length) {
  const byPrefix = {};
  missingList.forEach(m => {
    const prefix = m.id.match(/^([A-Za-z]+)/)?.[1] || "OTHER";
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
  });
  console.log("Missing by prefix:");
  Object.entries(byPrefix).sort((a,b) => b[1]-a[1]).forEach(([p,c]) => console.log(`  ${p}: ${c}`));

  const reportPath = path.join(__dirname, "../data/missing-audio-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(missingList, null, 2));
  console.log(`\nFull list saved to data/missing-audio-report.json`);
}

console.log("\nDone. Commit lectures.json and push to GitHub.");
