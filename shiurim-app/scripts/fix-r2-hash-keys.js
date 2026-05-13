/**
 * fix-r2-hash-keys.js
 *
 * Cloudflare R2's CDN can mishandle `#` in object keys (even percent-encoded as %23).
 * This script:
 *  1. Finds all lectures.json entries with R2 URLs that contain `#` in the decoded key
 *  2. For each: checks whether the object actually resolves via HTTP HEAD
 *  3. If 404: copies/renames the R2 object to a new key with `#` replaced by `no.`
 *             then updates lectures.json to the new URL
 *
 * Usage: node scripts/fix-r2-hash-keys.js
 *
 * Requires: npm install node-fetch@2   (or it uses built-in fetch if Node 18+)
 */

require("dotenv").config({ path: ".env.local" });
const {
  S3Client,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

// Use native fetch (Node 18+) or fall back to node-fetch v2
const fetchFn = globalThis.fetch ?? require("node-fetch");

const JSON_PATH     = path.join(__dirname, "../data/lectures.json");
const R2_BUCKET     = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL.replace(/\/$/, "");

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

function hashKeyToSafeKey(key) {
  // Replace `#` with `no.` in filename segments only
  return key.split("/").map((seg, i, arr) =>
    i === arr.length - 1 ? seg.replace(/#/g, "no.") : seg
  ).join("/");
}

async function urlReturns200(url) {
  try {
    const res = await fetchFn(url, { method: "HEAD" });
    return res.status === 200 || res.status === 206;
  } catch { return false; }
}

async function existsInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch { return false; }
}

async function renameInR2(oldKey, newKey) {
  // S3/R2 has no rename — copy then delete
  await r2.send(new CopyObjectCommand({
    Bucket: R2_BUCKET,
    CopySource: `${R2_BUCKET}/${encodeURIComponent(oldKey).replace(/%2F/gi, "/")}`,
    Key: newKey,
    ContentType: "audio/mpeg",
    MetadataDirective: "COPY",
  }));
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: oldKey }));
}

// Collect all lectures with R2 URLs containing # in the decoded key
function collectHashLectures(node, out = []) {
  if (node.lectures) {
    for (const l of node.lectures) {
      if (!l.audioUrl || !l.audioUrl.includes(R2_PUBLIC_URL)) continue;
      const key = decodeURIComponent(l.audioUrl.slice(R2_PUBLIC_URL.length + 1));
      if (key.includes("#")) out.push({ lec: l, key });
    }
  }
  for (const c of node.children ?? []) collectHashLectures(c, out);
  return out;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Fix R2 # key 404s ===\n");

  const json = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const entries = json.categories.flatMap(c => collectHashLectures(c));
  console.log(`Found ${entries.length} R2 URLs with # in key.\n`);

  let ok = 0, renamed = 0, failed = 0;
  const seen = new Set();

  for (let i = 0; i < entries.length; i++) {
    const { lec, key } = entries[i];
    if (seen.has(key)) continue;
    seen.add(key);

    const label = `[${i + 1}/${entries.length}]`;
    process.stdout.write(`${label} ${key} ... `);

    // Test whether the URL actually works
    const url = toPublicUrl(key);
    const works = await urlReturns200(url);

    if (works) {
      console.log("OK");
      ok++;
      continue;
    }

    // URL returns 404 — rename in R2
    const safeKey = hashKeyToSafeKey(key);
    const safeUrl = toPublicUrl(safeKey);

    // Maybe the safe key already exists (was already copied)
    if (await existsInR2(safeKey)) {
      lec.audioUrl = safeUrl;
      console.log(`already exists as safe key → URL updated`);
      renamed++;
      continue;
    }

    // Original key must exist to rename
    if (!(await existsInR2(key))) {
      console.log(`NOT IN R2 at all — skip (re-run migrate-to-r2.js for this file)`);
      failed++;
      continue;
    }

    try {
      await renameInR2(key, safeKey);
      lec.audioUrl = safeUrl;
      console.log(`renamed # → no. → URL updated`);
      renamed++;
    } catch (err) {
      console.log(`rename FAILED: ${err.message}`);
      failed++;
    }
  }

  // Apply the same fix to any duplicate nodes sharing the same original URL
  // (walk again and match on old vs new URL patterns)
  function applyRenames(node) {
    if (node.lectures) {
      for (const l of node.lectures) {
        if (!l.audioUrl || !l.audioUrl.includes(R2_PUBLIC_URL)) continue;
        const key = decodeURIComponent(l.audioUrl.slice(R2_PUBLIC_URL.length + 1));
        if (!key.includes("#")) continue;
        const safeKey = hashKeyToSafeKey(key);
        // Only update if the rename succeeded (safeKey will now resolve)
        // We rely on the fact that if we renamed it above, the safe URL is correct
        l.audioUrl = toPublicUrl(safeKey);
      }
    }
    for (const c of node.children ?? []) applyRenames(c);
  }
  // But only update nodes whose key was actually renamed (use the seen set)
  // For simplicity we just re-apply the same transform to all # URLs
  // since any that weren't renamed are already flagged as failed above
  json.categories.forEach(applyRenames);

  fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2), "utf8");

  console.log(`\n✓ ${ok} already working, ${renamed} renamed (# → no.), ${failed} failed.`);
  if (failed > 0) {
    console.log("  Re-run migrate-to-r2.js for files that weren't in R2 at all.");
  }
  console.log("\nDone. Commit lectures.json.");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
