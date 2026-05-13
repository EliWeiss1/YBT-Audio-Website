/**
 * sync-supabase-to-r2.js
 *
 * For every lecture still pointing at Supabase storage:
 *  1. Derives the expected R2 key (same relative path as Supabase storage path)
 *  2. Checks if that key exists in R2 via HeadObject
 *  3. If yes  → updates audioUrl in lectures.json to the R2 public URL (NO upload)
 *  4. If no   → tries to find the matching local MP3 (by ID prefix, handles
 *               apostrophe differences between Supabase paths and local filenames)
 *             → verifies the local-file-based key isn't in R2 either before uploading
 *             → uploads to R2 only if truly absent, then updates audioUrl
 *
 * Flags:
 *   --dry-run   Print what would happen without changing R2 or lectures.json
 *
 * Usage: node scripts/sync-supabase-to-r2.js [--dry-run]
 */

require("dotenv").config({ path: ".env.local" });
const { S3Client, HeadObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");

const AUDIO_ROOT    = "C:\\Users\\eliis\\My Drive\\TTL Organized";
const JSON_PATH     = path.join(__dirname, "../data/lectures.json");
const R2_BUCKET     = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL.replace(/\/$/, "");
const SUPABASE_MARKER = "/storage/v1/object/public/audio/";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// ── helpers ───────────────────────────────────────────────────────────────────

function toPublicUrl(key) {
  const encoded = key.split("/").map(seg => encodeURIComponent(seg)).join("/");
  return `${R2_PUBLIC_URL}/${encoded}`;
}

function supabaseUrlToStoragePath(url) {
  const idx = url.indexOf(SUPABASE_MARKER);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + SUPABASE_MARKER.length));
}

async function existsInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch { return false; }
}

async function uploadToR2(key, localPath) {
  const buf = fs.readFileSync(localPath);
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: "audio/mpeg",
  }));
  return buf.length;
}

// Collect every local MP3, indexed by normalised ID prefix ("C:192", "HL:62", etc.)
function collectLocalByIdKey(dir, results = {}) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectLocalByIdKey(full, results);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".mp3")) {
      const m = entry.name.match(/^([A-Z_]+)-0*(\d+)/i);
      if (m) {
        const key = `${m[1].toUpperCase()}:${parseInt(m[2])}`;
        if (!results[key]) results[key] = [];
        results[key].push(full);
      }
    }
  }
  return results;
}

// Extract normalised ID key from Supabase storage path filename
function pathToIdKey(storagePath) {
  const filename = (storagePath.split("/").pop() ?? "");
  const m = filename.match(/^([A-Z_]+)-0*(\d+)/i);
  if (m) return `${m[1].toUpperCase()}:${parseInt(m[2])}`;
  return null;
}

// Walk lectures.json, return all lectures still pointing at Supabase
function collectSupabaseLectures(node, out = []) {
  if (node.lectures) {
    for (const l of node.lectures) {
      if (l.audioUrl && l.audioUrl.includes("supabase.co"))
        out.push(l);
    }
  }
  for (const c of node.children ?? []) collectSupabaseLectures(c, out);
  return out;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log("*** DRY RUN — no changes will be made ***\n");
  console.log("=== Sync remaining Supabase URLs → R2 ===\n");

  const json = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const supabaseLectures = json.categories.flatMap(c => collectSupabaseLectures(c));
  console.log(`Found ${supabaseLectures.length} Supabase-URL entries in lectures.json.\n`);

  console.log("Scanning local MP3 files...");
  const localIndex = collectLocalByIdKey(AUDIO_ROOT);
  console.log(`Indexed ${Object.keys(localIndex).length} local file keys.\n`);

  let alreadyInR2 = 0, uploaded = 0, notFound = 0;
  const notFoundList = [];
  const seen = new Set();

  for (const lec of supabaseLectures) {
    if (seen.has(lec.id)) continue;
    seen.add(lec.id);

    const storagePath = supabaseUrlToStoragePath(lec.audioUrl);
    if (!storagePath) { console.log(`  SKIP ${lec.id}: can't parse URL`); continue; }

    process.stdout.write(`  ${lec.id}: `);

    // 1. Check R2 with the exact Supabase storage path as key
    if (await existsInR2(storagePath)) {
      const r2Url = toPublicUrl(storagePath);
      console.log(`already in R2 (exact key) → ${DRY_RUN ? "would update URL" : "updated URL"}`);
      if (!DRY_RUN) lec._resolvedUrl = r2Url;
      alreadyInR2++;
      continue;
    }

    // 2. Try ID-prefix lookup in local files
    const idKey = pathToIdKey(storagePath);
    const localMatches = idKey ? localIndex[idKey] : null;

    if (localMatches && localMatches.length > 0) {
      const localFile = localMatches[0];
      const r2Key = path.relative(AUDIO_ROOT, localFile).replace(/\\/g, "/");

      // Always check R2 before uploading
      if (await existsInR2(r2Key)) {
        const r2Url = toPublicUrl(r2Key);
        console.log(`already in R2 (local key "${r2Key}") → ${DRY_RUN ? "would update URL" : "updated URL"}`);
        if (!DRY_RUN) lec._resolvedUrl = r2Url;
        alreadyInR2++;
      } else {
        const sizeMb = (fs.statSync(localFile).size / 1024 / 1024).toFixed(1);
        if (DRY_RUN) {
          console.log(`NOT in R2 — would upload from "${r2Key}" (${sizeMb} MB)`);
        } else {
          try {
            const bytes = await uploadToR2(r2Key, localFile);
            lec._resolvedUrl = toPublicUrl(r2Key);
            console.log(`uploaded ${(bytes / 1024 / 1024).toFixed(1)} MB → updated URL`);
            uploaded++;
          } catch (err) {
            console.log(`UPLOAD FAILED: ${err.message}`);
            notFound++;
            notFoundList.push({ id: lec.id, storagePath, error: err.message });
          }
        }
      }
    } else {
      console.log(`no local file found (idKey="${idKey}")`);
      notFound++;
      notFoundList.push({ id: lec.id, storagePath });
    }
  }

  if (!DRY_RUN) {
    // Apply resolved URLs to all nodes (including duplicates)
    const resolvedById = {};
    supabaseLectures.forEach(l => { if (l._resolvedUrl) resolvedById[l.id] = l._resolvedUrl; });

    function applyResolved(node) {
      if (node.lectures) {
        for (const l of node.lectures) {
          if (resolvedById[l.id]) l.audioUrl = resolvedById[l.id];
          delete l._resolvedUrl;
        }
      }
      for (const c of node.children ?? []) applyResolved(c);
    }
    json.categories.forEach(applyResolved);

    fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2), "utf8");
    console.log(`\n✓ ${alreadyInR2} already in R2 (URL updated), ${uploaded} newly uploaded.`);
  } else {
    console.log(`\n[dry-run] ${alreadyInR2} already in R2, ${uploaded} would be uploaded.`);
  }

  if (notFound) {
    console.log(`⚠ ${notFound} could not be resolved:`);
    notFoundList.forEach(e => console.log(`    ${e.id}: ${e.storagePath}${e.error ? " — " + e.error : ""}`));
  }
  if (!DRY_RUN) console.log("\nDone. Commit lectures.json.");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
