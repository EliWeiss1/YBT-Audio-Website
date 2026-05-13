/**
 * patch-hash-urls.js
 *
 * One-shot fix: replaces any remaining `%23` (encoded `#`) in R2 audio URLs
 * with `no.` in lectures.json. Only touches the filename segment of each URL,
 * leaving folder paths and apostrophe encoding untouched.
 *
 * Safe to re-run — idempotent.
 *
 * Usage: node scripts/patch-hash-urls.js
 */

const fs = require("fs");
const path = require("path");

const JSON_PATH = path.join(__dirname, "../data/lectures.json");
const R2_PREFIX = "https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/";

const json = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
let fixed = 0;

function fixUrl(url) {
  if (!url || !url.startsWith(R2_PREFIX)) return url;
  const lastSlash = url.lastIndexOf("/");
  const folder   = url.slice(0, lastSlash + 1);
  const filename = url.slice(lastSlash + 1);
  if (!filename.includes("%23")) return url;
  return folder + filename.replace(/%23/g, "no.");
}

function walk(node) {
  if (node.lectures) {
    for (const l of node.lectures) {
      const fixed_url = fixUrl(l.audioUrl ?? "");
      if (fixed_url !== l.audioUrl) {
        console.log(`  ${l.id}: ...${l.audioUrl.slice(-55)}`);
        console.log(`       → ...${fixed_url.slice(-55)}`);
        l.audioUrl = fixed_url;
        fixed++;
      }
    }
  }
  for (const c of node.children ?? []) walk(c);
}

json.categories.forEach(walk);

fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2), "utf8");
console.log(`\n✓ Fixed ${fixed} URLs in lectures.json.`);
