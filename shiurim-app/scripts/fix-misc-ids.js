/**
 * fix-misc-ids.js
 *
 * Misc lectures use their full title as the ID (e.g. "Are Jews Superior 2")
 * which breaks routing at /lectures/[id] due to spaces and special chars.
 * This script assigns them proper slug IDs (e.g. "MISC-001") and updates
 * lectures.json in place.
 *
 * Usage: node scripts/fix-misc-ids.js
 */

const fs = require("fs");
const path = require("path");
const LECTURES_JSON_PATH = path.join(__dirname, "../data/lectures.json");

const json = JSON.parse(fs.readFileSync(LECTURES_JSON_PATH, "utf8"));

const misc = json.categories.find(c => c.id === "misc");
if (!misc) { console.log("No misc category found."); process.exit(0); }

let counter = 1;
let fixed = 0;

function processNode(node) {
  if (node.lectures) {
    node.lectures.forEach(l => {
      // Fix any ID that isn't a standard prefix-number format
      const isStandard = /^[A-Z]+-\d+$/i.test(l.id);
      if (!isStandard) {
        const newId = `MISC-${String(counter).padStart(3, "0")}`;
        console.log(`  ${JSON.stringify(l.id)} → ${newId}  (${l.title})`);
        l.id = newId;
        counter++;
        fixed++;
      }
    });
  }
  (node.children || []).forEach(processNode);
}

console.log("Fixing non-standard Misc IDs:\n");
processNode(misc);

fs.writeFileSync(LECTURES_JSON_PATH, JSON.stringify(json, null, 2), "utf8");
console.log(`\n✓ Fixed ${fixed} Misc lecture IDs.`);
console.log("Done. Commit lectures.json and push to GitHub.");
