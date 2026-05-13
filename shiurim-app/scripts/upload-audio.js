/**
 * upload-audio.js
 *
 * Uploads all MP3 files from your "TTL Organized" folder to Cloudflare R2,
 * then patches lectures.json with the correct audioUrl for each lecture.
 *
 * Usage (from inside shiurim-app/):
 *   node scripts/upload-audio.js
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

function extractId(filename) {
  const base = path.basename(filename, ".mp3");
  const match = base.match(/^([A-Z]+-[\d]+)/i);
  return match ? match[1].toUpperCase() : null;
}

/** The R2 object key — raw relative path with forward slashes. */
function r2Key(absolutePath) {
  return path.relative(AUDIO_ROOT, absolutePath).replace(/\\/g, "/");
}

/**
 * Public URL for a given key — encodes each path segment so characters
 * like # don't break browser URLs.
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

async function uploadFile(absolutePath) {
  const key = r2Key(absolutePath);

  if (await existsInR2(key)) {
    return toPublicUrl(key);
  }

  const fileBuffer = fs.readFileSync(absolutePath);
  try {
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: "audio/mpeg",
    }));
    return toPublicUrl(key);
  } catch (err) {
    console.error(`  ✗ ${key} — ${err.message}`);
    return null;
  }
}

function patchLectures(node, idToUrl, stats) {
  if (Array.isArray(node)) {
    node.forEach(item => patchLectures(item, idToUrl, stats));
  } else if (node && typeof node === "object") {
    if ("id" in node && "audioUrl" in node) {
      const url = idToUrl[node.id.toUpperCase()];
      if (url) {
        node.audioUrl = url;
        stats.matched++;
      } else {
        stats.unmatched.push(node.id);
      }
    }
    Object.values(node).forEach(v => patchLectures(v, idToUrl, stats));
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Shiurim Audio Uploader → Cloudflare R2 ===\n");

  console.log(`Scanning: ${AUDIO_ROOT}`);
  const mp3Files = collectMp3s(AUDIO_ROOT);
  console.log(`Found ${mp3Files.length} MP3 files.\n`);

  const idToUrl = {};
  let uploaded = 0, alreadyExisted = 0, failed = 0, noId = 0;

  for (let i = 0; i < mp3Files.length; i++) {
    const file = mp3Files[i];
    const id = extractId(file);
    const label = `[${i + 1}/${mp3Files.length}]`;

    if (!id) {
      console.warn(`${label} ⚠ No ID in filename, skipping: ${path.basename(file)}`);
      noId++;
      continue;
    }

    process.stdout.write(`${label} ${id} ... `);
    const key = r2Key(file);
    const alreadyThere = await existsInR2(key);
    const url = await uploadFile(file);

    if (url) {
      idToUrl[id] = url;
      if (alreadyThere) {
        console.log("already in R2");
        alreadyExisted++;
      } else {
        console.log("✓ uploaded");
        uploaded++;
      }
    } else {
      console.log("✗ FAILED");
      failed++;
    }
  }

  console.log(`\nResults: ${uploaded} uploaded, ${alreadyExisted} already existed, ${failed} failed, ${noId} skipped (no ID).\n`);

  console.log("Patching data/lectures.json...");
  const json = JSON.parse(fs.readFileSync(LECTURES_JSON_PATH, "utf8"));
  const stats = { matched: 0, unmatched: [] };
  patchLectures(json, idToUrl, stats);
  fs.writeFileSync(LECTURES_JSON_PATH, JSON.stringify(json, null, 2), "utf8");

  console.log(`✓ ${stats.matched} lectures now have audioUrl set.`);
  if (stats.unmatched.length) {
    console.log(`⚠ ${stats.unmatched.length} lecture IDs had no matching MP3.`);
    stats.unmatched.slice(0, 20).forEach(id => console.log(`    - ${id}`));
    if (stats.unmatched.length > 20) console.log(`    ... and ${stats.unmatched.length - 20} more`);
  }

  console.log("\nAll done. Commit the updated lectures.json.");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
