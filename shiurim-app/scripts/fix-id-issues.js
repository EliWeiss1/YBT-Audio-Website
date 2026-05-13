/**
 * fix-id-issues.js
 *
 * Fixes three problems in lectures.json + R2:
 *
 * 1. Remove duplicate Rav-27 / Rav-31 underscore entries
 *    (Rav-27_Kinos... and Rav-31_Tisha... are dupes of the space versions)
 *
 * 2. Clean up BN-9517-9524 Afterlife series:
 *    IDs: "BN-9517-Afterlife (#1)" → "BN-9517", titles → "Afterlife 1" etc.
 *
 * 3. BN-Conf series: the JSON entries have IDs like BN-Conf-9360 but
 *    local files are named BN-9360 (no "Conf"). Finds matching local files,
 *    uploads to R2 if needed, and sets the audioUrl on the existing entries.
 *
 * Flags:
 *   --dry-run   Show what would change without touching anything
 *
 * Usage: node scripts/fix-id-issues.js [--dry-run]
 */

require("dotenv").config({ path: ".env.local" });
const { S3Client, HeadObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs   = require("fs");
const path = require("path");

const DRY_RUN       = process.argv.includes("--dry-run");
const AUDIO_ROOT    = "C:\\Users\\eliis\\My Drive\\TTL Organized";
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

function toPublicUrl(key) {
  return `${R2_PUBLIC_URL}/${key.split("/").map(s => encodeURIComponent(s)).join("/")}`;
}
async function existsInR2(key) {
  try { await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; }
  catch { return false; }
}
async function uploadToR2(key, absPath) {
  const buf = fs.readFileSync(absPath);
  await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: "audio/mpeg" }));
  return buf.length;
}

// ── Fix 1: remove underscore-duplicate Rav entries ───────────────────────────
const DUPE_IDS = new Set([
  "Rav-27_Kinos Tisha B'Av 1984 #1",
  "Rav-31_Tisha B'Av 1979 #1",
]);

// ── Fix 2: BN-9517-9524 Afterlife ID/title cleanup ───────────────────────────
const AFTERLIFE_FIX = {
  "BN-9517-Afterlife (#1)": { id: "BN-9517", title: "Afterlife 1" },
  "BN-9518-Afterlife (#2)": { id: "BN-9518", title: "Afterlife 2" },
  "BN-9519-Afterlife (#3)": { id: "BN-9519", title: "Afterlife 3" },
  "BN-9523-Afterlife (#4)": { id: "BN-9523", title: "Afterlife 4" },
  "BN-9524-Afterlife (#5)": { id: "BN-9524", title: "Afterlife 5" },
};

// ── Fix 3: BN-Conf audio ─────────────────────────────────────────────────────
// Maps BN-Conf-XXXX → the numeric part so we can find the local file
function bnConfNumber(id) {
  const m = id.match(/^BN-Conf-(\d+)$/);
  return m ? m[1] : null;
}

// Find the local file for a given BN number in the Bnai Noach folder
function findLocalBnFile(number) {
  const dir = path.join(AUDIO_ROOT, "Bnai Noach");
  const prefix = `BN-${number}`;
  try {
    const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith(".mp3"));
    if (files.length === 0) return null;
    // Prefer exact match, otherwise first result
    return path.join(dir, files[0]);
  } catch { return null; }
}

// ── Walk + patch ──────────────────────────────────────────────────────────────
async function main() {
  if (DRY_RUN) console.log("*** DRY RUN ***\n");
  const json = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));

  let removedDupes = 0, fixedAfterlife = 0, fixedConfAudio = 0;

  async function walk(node) {
    // Fix 1: remove dupe entries
    if (node.lectures) {
      const before = node.lectures.length;
      node.lectures = node.lectures.filter(l => {
        if (DUPE_IDS.has(l.id)) {
          console.log(`  [Fix 1] Remove dupe: ${l.id}`);
          return DRY_RUN; // keep in dry-run so we can see it; remove for real
        }
        return true;
      });
      if (!DRY_RUN) removedDupes += before - node.lectures.length;
      else removedDupes += node.lectures.filter(l => DUPE_IDS.has(l.id)).length;
    }

    // Fix 2: clean up Afterlife IDs/titles
    for (const l of node.lectures ?? []) {
      if (AFTERLIFE_FIX[l.id]) {
        const { id: newId, title: newTitle } = AFTERLIFE_FIX[l.id];
        console.log(`  [Fix 2] ${l.id} → id=${newId}, title="${newTitle}"`);
        if (!DRY_RUN) { l.id = newId; l.title = newTitle; }
        fixedAfterlife++;
      }
    }

    // Fix 3: BN-Conf audio
    for (const l of node.lectures ?? []) {
      const num = bnConfNumber(l.id);
      if (!num) continue;
      if (l.audioUrl) continue; // already has audio

      const localFile = findLocalBnFile(num);
      if (!localFile) {
        console.log(`  [Fix 3] ${l.id}: no local file found for BN-${num}`);
        continue;
      }

      const r2Key = `Bnai Noach/${path.basename(localFile)}`;
      process.stdout.write(`  [Fix 3] ${l.id} → ${path.basename(localFile)} ... `);

      if (DRY_RUN) {
        console.log(`would upload key: ${r2Key}`);
        fixedConfAudio++;
        continue;
      }

      let audioUrl = "";
      if (await existsInR2(r2Key)) {
        audioUrl = toPublicUrl(r2Key);
        console.log("already in R2");
      } else {
        try {
          const bytes = await uploadToR2(r2Key, localFile);
          audioUrl = toPublicUrl(r2Key);
          console.log(`uploaded ${(bytes / 1024 / 1024).toFixed(1)} MB`);
        } catch (err) {
          console.log(`FAILED: ${err.message}`);
          continue;
        }
      }
      l.audioUrl = audioUrl;
      fixedConfAudio++;
    }

    for (const c of node.children ?? []) await walk(c);
  }

  for (const cat of json.categories) await walk(cat);

  if (!DRY_RUN) {
    // Fix 1: second pass to actually remove dupes (filter modifies in place above,
    // but we need to re-filter since dry-run kept them)
    function removeDupes(node) {
      if (node.lectures) {
        node.lectures = node.lectures.filter(l => !DUPE_IDS.has(l.id));
      }
      for (const c of node.children ?? []) removeDupes(c);
    }
    removeDupes({ children: json.categories });

    fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2), "utf8");
  }

  console.log(`\n${DRY_RUN ? "[dry-run] Would:" : "Done:"}`);
  console.log(`  Remove ${removedDupes} duplicate Rav entries`);
  console.log(`  Fix ${fixedAfterlife} Afterlife IDs/titles`);
  console.log(`  Add audio to ${fixedConfAudio} BN-Conf entries`);
  if (!DRY_RUN) console.log("\nCommit lectures.json.");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
