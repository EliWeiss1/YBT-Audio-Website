/**
 * cleanup-r2-duplicates.js
 *
 * Fixes all R2 objects whose key contains `#`:
 *
 *   Case A — both `#` form AND `no.` form exist:
 *     → Delete the `#` version (no. is already correct)
 *
 *   Case B — only the `#` form exists (no `no.` counterpart):
 *     → Copy to the `no.` key, then delete the `#` key
 *     → Update the matching audioUrl in lectures.json
 *
 * Flags:
 *   --dry-run   Print what would happen without changing R2 or lectures.json
 *
 * Usage: node scripts/cleanup-r2-duplicates.js [--dry-run]
 */

require("dotenv").config({ path: ".env.local" });
const {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectsCommand,
} = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");

const R2_BUCKET     = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL.replace(/\/$/, "");
const JSON_PATH     = path.join(__dirname, "../data/lectures.json");

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// ── helpers ───────────────────────────────────────────────────────────────────

async function listAllKeys() {
  const keys = [];
  let ContinuationToken;
  do {
    const res = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, ContinuationToken }));
    for (const obj of res.Contents ?? []) keys.push(obj.Key);
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

async function copyInR2(srcKey, dstKey) {
  // CopySource must be bucket/key with the key percent-encoded
  const encodedSrc = srcKey.split("/").map(seg => encodeURIComponent(seg)).join("/");
  await r2.send(new CopyObjectCommand({
    Bucket: R2_BUCKET,
    CopySource: `${R2_BUCKET}/${encodedSrc}`,
    Key: dstKey,
    ContentType: "audio/mpeg",
    MetadataDirective: "COPY",
  }));
}

async function deleteKeys(keys) {
  let deleted = 0;
  const errors = [];
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000).map(Key => ({ Key }));
    const res = await r2.send(new DeleteObjectsCommand({
      Bucket: R2_BUCKET,
      Delete: { Objects: batch, Quiet: false },
    }));
    deleted += (res.Deleted ?? []).length;
    errors.push(...(res.Errors ?? []));
  }
  return { deleted, errors };
}

/** Replace `#` with `no.` in the filename (last path segment) only. */
function toNoKey(key) {
  const parts = key.split("/");
  parts[parts.length - 1] = parts[parts.length - 1].replace(/#/g, "no.");
  return parts.join("/");
}

function toPublicUrl(key) {
  return `${R2_PUBLIC_URL}/${key.split("/").map(seg => encodeURIComponent(seg)).join("/")}`;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log("*** DRY RUN — nothing will be changed ***\n");
  console.log("=== Cleanup R2 # keys ===\n");

  console.log("Listing all R2 objects...");
  const allKeys = await listAllKeys();
  console.log(`Total objects in R2: ${allKeys.length}\n`);

  const keySet = new Set(allKeys);
  const hashKeys = allKeys.filter(k => k.includes("#"));
  console.log(`Keys containing '#': ${hashKeys.length}\n`);

  if (hashKeys.length === 0) {
    console.log("Nothing to do — no # keys found.");
    return;
  }

  // Sort into cases
  const toDeleteOnly = [];   // Case A: # + no. both exist → just delete #
  const toRename     = [];   // Case B: only # exists → copy to no., delete #

  for (const hashKey of hashKeys) {
    const noKey = toNoKey(hashKey);
    if (keySet.has(noKey)) {
      toDeleteOnly.push(hashKey);
    } else {
      toRename.push({ hashKey, noKey });
    }
  }

  console.log(`Case A — duplicate (both # and no. exist), delete # only: ${toDeleteOnly.length}`);
  console.log(`Case B — only # exists, rename to no.:                    ${toRename.length}\n`);

  // ── Case A: delete # duplicates AND patch their JSON URLs ────────────────
  if (toDeleteOnly.length) {
    console.log("=== Case A: deleting # duplicates + patching JSON URLs ===");
    toDeleteOnly.forEach(k => console.log(`  ✗ ${k}`));
    if (!DRY_RUN) {
      const { deleted, errors } = await deleteKeys(toDeleteOnly);
      console.log(`✓ Deleted ${deleted}.`);
      if (errors.length) errors.forEach(e => console.log(`  ERROR: ${e.Key}: ${e.Message}`));
    }
    // Patch lectures.json for Case A entries (# URL → no. URL)
    const caseAHashKeys = new Set(toDeleteOnly);
    console.log("\nPatching lectures.json for Case A entries...");
    const jsonA = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
    let caseAUpdated = 0;
    function walkA(node) {
      if (node.lectures) {
        for (const l of node.lectures) {
          if (!l.audioUrl || !l.audioUrl.includes(R2_PUBLIC_URL)) continue;
          const currentKey = decodeURIComponent(l.audioUrl.slice(R2_PUBLIC_URL.length + 1));
          if (!currentKey.includes("#")) continue;
          const noKey = toNoKey(currentKey);
          const newUrl = toPublicUrl(noKey);
          if (!DRY_RUN) l.audioUrl = newUrl;
          console.log(`  ${l.id}: ...→ ${noKey.slice(-50)}${DRY_RUN ? " (dry-run)" : ""}`);
          caseAUpdated++;
        }
      }
      for (const c of node.children ?? []) walkA(c);
    }
    jsonA.categories.forEach(walkA);
    if (!DRY_RUN) fs.writeFileSync(JSON_PATH, JSON.stringify(jsonA, null, 2), "utf8");
    console.log(`${DRY_RUN ? "[dry-run] Would update" : "✓ Updated"} ${caseAUpdated} Case A URLs in lectures.json.\n`);
  }

  // ── Case B: rename # → no. ────────────────────────────────────────────────
  if (toRename.length) {
    console.log("=== Case B: renaming # → no. ===");
    const keysToDelete = [];
    let copied = 0, copyFailed = 0;

    for (const { hashKey, noKey } of toRename) {
      process.stdout.write(`  ${hashKey}\n    → ${noKey} ... `);
      if (DRY_RUN) { console.log("(dry-run)"); continue; }
      try {
        await copyInR2(hashKey, noKey);
        keysToDelete.push(hashKey);
        console.log("copied");
        copied++;
      } catch (err) {
        console.log(`FAILED: ${err.message}`);
        copyFailed++;
      }
    }

    if (!DRY_RUN && keysToDelete.length) {
      process.stdout.write(`\nDeleting ${keysToDelete.length} original # keys... `);
      const { deleted, errors } = await deleteKeys(keysToDelete);
      console.log(`✓ Deleted ${deleted}.`);
      if (errors.length) errors.forEach(e => console.log(`  ERROR: ${e.Key}: ${e.Message}`));
    }

    // ── Update lectures.json for renamed keys ─────────────────────────────
    const renamedHashKeys = new Set(
      DRY_RUN
        ? toRename.map(r => r.hashKey)        // in dry-run, show what would change
        : toRename.filter((_, i) => i < copied + copyFailed)
                  .filter(r => !toDeleteOnly.includes(r.hashKey))
                  .map(r => r.hashKey)
    );
    // Simpler: build hashKey → noKey map for all renames attempted
    const renameMap = new Map(toRename.map(({ hashKey, noKey }) => [hashKey, noKey]));

    console.log("\nUpdating lectures.json...");
    const json = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
    let urlsUpdated = 0;

    function walk(node) {
      if (node.lectures) {
        for (const l of node.lectures) {
          if (!l.audioUrl || !l.audioUrl.includes(R2_PUBLIC_URL)) continue;
          const currentKey = decodeURIComponent(l.audioUrl.slice(R2_PUBLIC_URL.length + 1));
          if (!currentKey.includes("#")) continue;
          const noKey = renameMap.get(currentKey) ?? toNoKey(currentKey);
          const newUrl = toPublicUrl(noKey);
          if (!DRY_RUN) l.audioUrl = newUrl;
          console.log(`  ${l.id}: ${currentKey}\n    → ${noKey}${DRY_RUN ? " (dry-run)" : ""}`);
          urlsUpdated++;
        }
      }
      for (const c of node.children ?? []) walk(c);
    }
    json.categories.forEach(walk);

    if (!DRY_RUN) {
      fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2), "utf8");
      console.log(`\n✓ ${urlsUpdated} audioUrls updated in lectures.json.`);
      if (copyFailed) console.log(`⚠ ${copyFailed} copies failed — those keys unchanged.`);
    } else {
      console.log(`\n[dry-run] Would update ${urlsUpdated} audioUrls in lectures.json.`);
    }
  }

  console.log("\nDone." + (DRY_RUN ? " (dry-run, no changes made)" : " Commit lectures.json."));
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
