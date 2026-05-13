/**
 * upload-missing-categories.js
 *
 * Uploads files from specific categories that were missed in previous upload runs.
 * Safe to re-run — skips files already in Supabase.
 *
 * Usage: node scripts/upload-missing-categories.js
 */

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const AUDIO_ROOT = "C:\\Users\\eliis\\My Drive\\TTL Organized";
const BUCKET_NAME = "audio";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabase = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Folders to upload (relative to AUDIO_ROOT)
// Add any others that are still broken
const TARGET_FOLDERS = [
  "Shulchan Aruch",
];

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

function toStoragePath(absolutePath) {
  return path.relative(AUDIO_ROOT, absolutePath).replace(/\\/g, "/");
}

function toPublicUrl(storagePath) {
  const encoded = storagePath.split("/").map(seg => seg.replace(/ /g, "%20")).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${encoded}`;
}

async function existsInSupabase(storagePath) {
  const parts = storagePath.split("/");
  const folder = parts.slice(0, -1).join("/");
  const filename = parts[parts.length - 1];
  const { data, error } = await supabase.storage.from(BUCKET_NAME).list(folder, { search: filename });
  if (error) return false;
  return (data || []).some(f => f.name === filename);
}

async function main() {
  for (const folder of TARGET_FOLDERS) {
    const folderPath = path.join(AUDIO_ROOT, folder);
    console.log(`\n=== Uploading: ${folder} ===\n`);

    const files = collectMp3s(folderPath);
    console.log(`Found ${files.length} MP3 files.\n`);

    let uploaded = 0, skipped = 0, failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const storagePath = toStoragePath(file);
      const label = `[${i+1}/${files.length}]`;

      process.stdout.write(`${label} ${path.basename(file)} ... `);

      const already = await existsInSupabase(storagePath);
      if (already) {
        console.log("already exists, skipping");
        skipped++;
        continue;
      }

      const fileBuffer = fs.readFileSync(file);
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, fileBuffer, {
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

    console.log(`\n${folder}: ${uploaded} uploaded, ${skipped} skipped, ${failed} failed.`);
  }

  console.log("\nDone. No JSON changes needed — URLs were already correct.");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
