/**
 * fix-special-chars.js
 *
 * Supabase Storage rejects filenames/paths containing # or '
 * This script:
 * 1. Re-uploads all files whose PATH contains # or ' (with those chars replaced)
 *    — skips files already uploaded in a previous run
 * 2. Updates lectures.json URLs to match the new paths
 * 3. Deletes the old broken versions from Supabase
 *
 * Usage: node scripts/fix-special-chars.js
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

function sanitizeStoragePath(rawPath) {
  return rawPath
    .split("/")
    .map(seg => seg.replace(/#/g, "no.").replace(/'/g, ""))
    .join("/");
}

function toPublicUrl(sanitizedPath) {
  const encoded = sanitizedPath
    .split("/")
    .map(seg => seg.replace(/ /g, "%20"))
    .join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${encoded}`;
}

function needsSanitization(p) {
  return p.includes("#") || p.includes("'");
}

// Check if a file already exists in Supabase by listing its folder
// Returns true if the sanitized filename is already present
async function existsInSupabase(sanitizedPath) {
  const parts = sanitizedPath.split("/");
  const folder = parts.slice(0, -1).join("/");
  const filename = parts[parts.length - 1];

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(folder, { search: filename });

  if (error) return false;
  return (data || []).some(f => f.name === filename);
}

// ─── Step 1: Upload problematic files (skip already-uploaded ones) ────────────

async function reuploadProblematicFiles() {
  console.log("=== Step 1: Uploading files with # or ' in path ===\n");

  const allFiles = collectMp3s(AUDIO_ROOT);
  const problematic = allFiles.filter(f => {
    const relative = path.relative(AUDIO_ROOT, f).replace(/\\/g, "/");
    return needsSanitization(relative);
  });

  console.log(`Found ${problematic.length} files with # or ' in their path.\n`);

  const pathMap = {};
  let uploaded = 0, skipped = 0, failed = 0;

  for (let i = 0; i < problematic.length; i++) {
    const file = problematic[i];
    const rawPath = path.relative(AUDIO_ROOT, file).replace(/\\/g, "/");
    const sanitizedPath = sanitizeStoragePath(rawPath);
    pathMap[rawPath] = sanitizedPath;

    process.stdout.write(`[${i+1}/${problematic.length}] ${path.basename(file)} ... `);

    // Check if already uploaded — skip if so
    const already = await existsInSupabase(sanitizedPath);
    if (already) {
      console.log("already exists, skipping");
      skipped++;
      continue;
    }

    const fileBuffer = fs.readFileSync(file);
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(sanitizedPath, fileBuffer, {
        contentType: "audio/mpeg",
        upsert: false,
      });

    if (error) {
      if (error.message.includes("already exists")) {
        console.log("already exists, skipping");
        skipped++;
      } else {
        console.log(`✗ ${error.message}`);
        failed++;
      }
    } else {
      console.log("✓ uploaded");
      uploaded++;
    }
  }

  console.log(`\nUploaded: ${uploaded}, Skipped (already existed): ${skipped}, Failed: ${failed}\n`);
  return pathMap;
}

// ─── Step 2: Delete old broken versions from Supabase ────────────────────────

async function deleteOldVersions(pathMap) {
  console.log("=== Step 2: Deleting old broken versions from Supabase ===\n");

  const oldPaths = Object.keys(pathMap);
  const batchSize = 100;
  let deleted = 0, errors = 0;

  for (let i = 0; i < oldPaths.length; i += batchSize) {
    const batch = oldPaths.slice(i, i + batchSize);
    const { error } = await supabase.storage.from(BUCKET_NAME).remove(batch);
    if (error) { console.error(`Batch error: ${error.message}`); errors++; }
    else deleted += batch.length;
    process.stdout.write(`Deleting batch ${Math.floor(i/batchSize)+1}/${Math.ceil(oldPaths.length/batchSize)}...\r`);
  }

  console.log(`\nDeleted ${deleted} old paths, ${errors} batch errors.\n`);
}

// ─── Step 3: Update lectures.json ────────────────────────────────────────────

function updateJson(pathMap) {
  console.log("=== Step 3: Updating lectures.json ===\n");

  const json = JSON.parse(fs.readFileSync(LECTURES_JSON_PATH, "utf8"));
  let urlsFixed = 0;
  let idsFixed = 0;

  function processNode(node) {
    if (node.lectures) {
      node.lectures.forEach(l => {
        // Fix URL if decoded path contains # or '
        if (l.audioUrl) {
          const urlBase = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/`;
          if (l.audioUrl.startsWith(urlBase)) {
            const decoded = decodeURIComponent(l.audioUrl.slice(urlBase.length));
            if (needsSanitization(decoded)) {
              l.audioUrl = toPublicUrl(sanitizeStoragePath(decoded));
              urlsFixed++;
            }
          }
        }

        // Fix unpadded IDs — standardize to match zero-padded URL filename
        if (l.audioUrl) {
          const filename = decodeURIComponent(l.audioUrl.split("/").pop());
          const urlIdMatch = filename.match(/^([A-Z]+-\d+)/i);
          if (urlIdMatch) {
            const urlId = urlIdMatch[1].toUpperCase();
            const normalize = id => id.toUpperCase().replace(/^([A-Z]+)-0*(\d+)$/, (_, p, n) => `${p}:${parseInt(n)}`);
            if (normalize(l.id) === normalize(urlId) && l.id !== urlId) {
              l.id = urlId;
              idsFixed++;
            }
          }
        }
      });
    }
    (node.children || []).forEach(processNode);
  }

  json.categories.forEach(processNode);
  fs.writeFileSync(LECTURES_JSON_PATH, JSON.stringify(json, null, 2), "utf8");

  console.log(`✓ Fixed ${urlsFixed} URLs with # or ' in path`);
  console.log(`✓ Standardized ${idsFixed} unpadded IDs\n`);

  let withUrl = 0, withoutUrl = 0;
  function count(node) {
    if (node.lectures) node.lectures.forEach(l => {
      if (l.audioUrl && l.audioUrl.trim()) withUrl++; else withoutUrl++;
    });
    (node.children || []).forEach(count);
  }
  json.categories.forEach(count);
  console.log(`Final: ${withUrl} lectures with audio, ${withoutUrl} without.\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const pathMap = await reuploadProblematicFiles();
  await deleteOldVersions(pathMap);
  updateJson(pathMap);
  console.log("Done. Commit lectures.json and push to GitHub.");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
