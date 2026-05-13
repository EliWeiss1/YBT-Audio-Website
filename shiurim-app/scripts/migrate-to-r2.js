/**
 * migrate-to-r2.js
 *
 * Uploads all MP3 files from your local "TTL Organized" folder to Cloudflare R2,
 * then updates every audioUrl in lectures.json from Supabase → R2.
 *
 * Usage (from inside shiurim-app/):
 *   node scripts/migrate-to-r2.js
 */

require("dotenv").config({ path: ".env.local" });
const { S3Client, PutObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const AUDIO_ROOT = "C:\\Users\\eliis\\My Drive\\TTL Organized";
const LECTURES_JSON_PATH = path.join(__dirname, "../data/lectures.json");
const R2_BUCKET = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL.replace(/\/$/, "");

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

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

/**
 * The R2 object key — uses the raw relative path with forward slashes.
 * The S3 API handles special characters in keys fine; only the public URL needs encoding.
 */
function toR2Key(absolutePath) {
  return path.relative(AUDIO_ROOT, absolutePath).replace(/\\/g, "/");
}

/**
 * The public URL for a given key.
 * Encodes each path segment so characters like # don't break browser URLs.
 * e.g. "Folder/BN-9303 Prayer (#1).mp3"
 *   → "https://pub-xxx.r2.dev/Folder/BN-9303%20Prayer%20(%231).mp3"
 */
function toPublicUrl(key) {
  const encoded = key.split("/").map(segment => encodeURIComponent(segment)).join("/");
  return `${R2_PUBLIC_URL}/${encoded}`;
}

async function existsInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function uploadToR2(key, buffer) {
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: "audio/mpeg",
  }));
}

/**
 * Extract the storage path from a Supabase URL (URL-decoded).
 * "https://xxx.supabase.co/storage/v1/object/public/audio/Folder/file.mp3"
 * → "Folder/file.mp3"
 */
function supabaseUrlToStoragePath(url) {
  const marker = "/object/public/audio/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

/**
 * Walk lectures.json and replace every Supabase audioUrl with the R2 equivalent.
 * Matches on the decoded storage path, which equals the R2 key.
 */
function patchLectures(node, keyToUrl, stats) {
  if (Array.isArray(node)) {
    node.forEach(item => patchLectures(item, keyToUrl, stats));
  } else if (node && typeof node === "object") {
    if (node.audioUrl && node.audioUrl.includes("supabase.co")) {
      const storagePath = supabaseUrlToStoragePath(node.audioUrl);
      if (storagePath && keyToUrl.has(storagePath)) {
        node.audioUrl = keyToUrl.get(storagePath);
        stats.patched++;
      } else {
        stats.missing.push({ id: node.id, storagePath });
      }
    }
    Object.values(node).forEach(v => patchLectures(v, keyToUrl, stats));
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Local → Cloudflare R2 Migration ===\n");

  console.log(`Scanning: ${AUDIO_ROOT}`);
  const mp3Files = collectMp3s(AUDIO_ROOT);
  console.log(`Found ${mp3Files.length} MP3 files.\n`);

  // Map from R2 key (raw path) → encoded public URL
  const keyToUrl = new Map();
  let uploaded = 0, skipped = 0, failed = 0;

  for (let i = 0; i < mp3Files.length; i++) {
    const absPath = mp3Files[i];
    const key = toR2Key(absPath);
    const publicUrl = toPublicUrl(key);
    const label = `[${i + 1}/${mp3Files.length}]`;

    process.stdout.write(`${label} ${key} ... `);

    if (await existsInR2(key)) {
      keyToUrl.set(key, publicUrl);
      console.log("already in R2");
      skipped++;
      continue;
    }

    try {
      const buffer = fs.readFileSync(absPath);
      await uploadToR2(key, buffer);
      keyToUrl.set(key, publicUrl);
      console.log(`✓ (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
      uploaded++;
    } catch (err) {
      console.log(`✗ FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nUpload: ${uploaded} uploaded, ${skipped} already in R2, ${failed} failed.\n`);

  // Patch lectures.json
  console.log("Patching data/lectures.json...");
  const json = JSON.parse(fs.readFileSync(LECTURES_JSON_PATH, "utf8"));
  const stats = { patched: 0, missing: [] };
  patchLectures(json, keyToUrl, stats);
  fs.writeFileSync(LECTURES_JSON_PATH, JSON.stringify(json, null, 2), "utf8");

  console.log(`✓ ${stats.patched} audioUrls updated to R2.`);
  if (stats.missing.length) {
    console.log(`⚠ ${stats.missing.length} lectures have Supabase URLs but no matching local file:`);
    stats.missing.slice(0, 20).forEach(({ id, storagePath }) =>
      console.log(`    - ${id}: ${storagePath}`)
    );
    if (stats.missing.length > 20)
      console.log(`    ... and ${stats.missing.length - 20} more`);
  }

  if (failed > 0) {
    console.log(`\n⚠ ${failed} files failed. Run the script again to retry — already-uploaded files are skipped.`);
  }

  console.log("\nDone! Commit the updated lectures.json.");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
