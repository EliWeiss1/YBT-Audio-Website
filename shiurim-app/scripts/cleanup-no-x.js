/**
 * cleanup-no-x.js
 *
 * 1. Lists all R2 keys.
 * 2. For every key matching the " no. X" pattern that also has a "#X" sibling, deletes the "no." version.
 * 3. For every lecture in lectures.json still on a Supabase URL, tries to find the
 *    matching R2 "#" key (by converting "no. X" → "#X" in the storage path) and patches it.
 *
 * Run from shiurim-app/:
 *   node scripts/cleanup-no-x.js
 */

require("dotenv").config({ path: ".env.local" });
const {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPublicUrl(key) {
  return R2_PUBLIC_URL + "/" + key.split("/").map(s => encodeURIComponent(s)).join("/");
}

function supabaseUrlToStoragePath(url) {
  const marker = "/object/public/audio/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

/**
 * Convert a "no. X" R2 key to its "#X" equivalent.
 *   "Folder/D-006 Free Will no.1.mp3"                  → "Folder/D-006 Free Will #1.mp3"
 *   "Folder/BN-9295 Genesis 27 no.2.mp3"               → "Folder/BN-9295 Genesis 27 #2.mp3"
 *   "Folder/BN-9303 Prayer (no.1).mp3"                 → "Folder/BN-9303 Prayer (#1).mp3"
 *   "Folder/BN-9330 Amidah (no.1) (Prayer no.11).mp3"  → "Folder/BN-9330 Amidah (#1) (Prayer #11).mp3"
 */
function noXToHashKey(key) {
  return key
    .replace(/\(no\. ?(\d+)\)/gi, "(#$1)")  // "(no.1)" or "(no. 1)" → "(#1)"
    .replace(/ no\.? ?(\d+)/gi, " #$1");    // " no.1" or " no. 1" → " #1"
}

async function listAllKeys() {
  const keys = [];
  let token;
  do {
    const res = await r2.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      ContinuationToken: token,
    }));
    for (const obj of res.Contents || []) keys.push(obj.Key);
    token = res.NextContinuationToken;
  } while (token);
  return keys;
}

function patchLectures(node, keySet, stats) {
  if (Array.isArray(node)) {
    node.forEach(item => patchLectures(item, keySet, stats));
  } else if (node && typeof node === "object") {
    if (node.audioUrl && node.audioUrl.includes("supabase.co")) {
      const storagePath = supabaseUrlToStoragePath(node.audioUrl);
      if (storagePath) {
        // First: exact match (key already has # in it)
        if (keySet.has(storagePath)) {
          node.audioUrl = toPublicUrl(storagePath);
          stats.patched++;
        } else {
          // Second: convert "no. X" → "#X" and try again
          const hashPath = noXToHashKey(storagePath);
          if (hashPath !== storagePath && keySet.has(hashPath)) {
            node.audioUrl = toPublicUrl(hashPath);
            stats.patched++;
          } else {
            stats.missing.push({ id: node.id, storagePath, tried: hashPath });
          }
        }
      }
    }
    Object.values(node).forEach(v => patchLectures(v, keySet, stats));
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== R2 cleanup: remove 'no. X' duplicates + patch lectures.json ===\n");

  console.log("Listing all R2 keys...");
  const allKeys = await listAllKeys();
  console.log(`Total keys: ${allKeys.length}\n`);

  const keySet = new Set(allKeys);

  // ── Phase 1: delete "no. X" keys that have a "#X" sibling ─────────────────
  const noXKeys = allKeys.filter(k => /\bno\.?\s?\d+/i.test(k));
  console.log(`Found ${noXKeys.length} 'no. X' keys to evaluate.\n`);

  let deleted = 0, noSibling = 0;
  for (const key of noXKeys) {
    const hashKey = noXToHashKey(key);
    if (hashKey === key) { noSibling++; continue; }
    if (keySet.has(hashKey)) {
      console.log(`DEL  ${key}`);
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      keySet.delete(key);
      deleted++;
    } else {
      console.log(`SKIP (no '#' sibling found): ${key}\n     tried: ${hashKey}`);
      noSibling++;
    }
  }
  console.log(`\nDeleted ${deleted} 'no. X' keys. Skipped ${noSibling} (no sibling or pattern unchanged).\n`);

  // ── Phase 2: patch lectures.json Supabase URLs → R2 ───────────────────────
  console.log("Patching lectures.json...");
  const json = JSON.parse(fs.readFileSync(LECTURES_JSON_PATH, "utf8"));
  const stats = { patched: 0, missing: [] };
  patchLectures(json, keySet, stats);
  fs.writeFileSync(LECTURES_JSON_PATH, JSON.stringify(json, null, 2), "utf8");

  console.log(`✓ ${stats.patched} additional audioUrls patched to R2.`);
  if (stats.missing.length) {
    console.log(`\n⚠ ${stats.missing.length} lectures still have no matching R2 key:`);
    stats.missing.forEach(({ id, storagePath, tried }) =>
      console.log(`  - ${id}\n    stored as: ${storagePath}\n    tried #:   ${tried}`)
    );
  }
  console.log("\nDone. Commit the updated lectures.json.");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
