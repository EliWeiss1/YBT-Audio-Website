/**
 * add-sefer-hamitzvos.js
 *
 * Inserts two Sefer HaMitzvos Klal Rishon lectures by Rabbi Bald
 * into the Discussion > Mitzvot node of lectures.json.
 * Audio already uploaded to R2 manually.
 *
 * Usage (from inside shiurim-app/):
 *   node scripts/add-sefer-hamitzvos.js
 */

const fs   = require("fs");
const path = require("path");

const JSON_PATH = path.join(__dirname, "../data/lectures.json");

function findNodeByPath(root, labels) {
  let current = root;
  for (const label of labels) {
    const norm = label.toLowerCase();
    const child = (current.children || []).find(c =>
      c.label.toLowerCase() === norm ||
      c.id.toLowerCase()    === norm ||
      c.label.toLowerCase().includes(norm) ||
      norm.includes(c.label.toLowerCase())
    );
    if (!child) return null;
    current = child;
  }
  return current;
}

function idExists(node, id) {
  for (const l of node.lectures || []) {
    if (l.id === id) return true;
  }
  for (const c of node.children || []) {
    if (idExists(c, id)) return true;
  }
  return false;
}

const LECTURES_TO_ADD = [
  {
    id:       "YBT-1175824",
    title:    "Sefer Hamitzvos Klal Rishon Part 2",
    audioUrl: "https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Mitzvot/Sefer%20HaMitvzos%20Clal%20Rishon%20part%202.mp3",
    speaker:  "Rabbi Bald",
  },
  {
    id:       "YBT-1175825",
    title:    "Sefer Hamitzvos Klal Rishon Part 4",
    audioUrl: "https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Mitzvot/sefer-hamitzvos-klal-rishon-part-4.mp3",
    speaker:  "Rabbi Bald",
  },
];

function main() {
  const json = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const root = { children: json.categories };

  const mitzvosNode =
    findNodeByPath(root, ["Discussion", "Mitzvot"]) ||
    findNodeByPath(root, ["Discussion", "Mitzvos"]);

  if (!mitzvosNode) {
    console.error("Could not find Discussion > Mitzvot node.");
    process.exit(1);
  }

  console.log(`Found node: "${mitzvosNode.label}" (id: ${mitzvosNode.id})`);
  console.log(`Currently has ${mitzvosNode.lectures?.length ?? 0} lectures.\n`);

  if (!mitzvosNode.lectures) mitzvosNode.lectures = [];

  for (const item of LECTURES_TO_ADD) {
    if (idExists(root, item.id)) {
      console.log(`⚠ ID ${item.id} already exists — skipping.`);
      continue;
    }

    mitzvosNode.lectures.push({
      id:          item.id,
      title:       item.title,
      audioUrl:    item.audioUrl,
      duration:    0,
      description: "",
      speaker:     item.speaker,
      date:        "",
      tags:        [],
    });

    console.log(`✓ Added [${item.id}] ${item.title}`);
  }

  fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2), "utf8");
  console.log("\n✓ lectures.json saved.");
}

main();
