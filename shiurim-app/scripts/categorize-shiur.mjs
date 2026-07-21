#!/usr/bin/env node
// =============================================================================
// categorize-shiur.mjs — standalone advisory categorizer for the add-fix-shiur
// skill. Re-implements lib/ingest/categorizer.ts's tier-1 (masechta-alias +
// daf-number regex) / tier-2 (Haiku over the full folder hierarchy) logic as a
// plain script, the same way scripts/ingest-shiur.js duplicates ingest logic
// rather than importing the TS module — this repo has no ts-node/tsx, and
// lib/ingest/*.ts uses the `@/` path alias that only Next.js resolves.
//
// This script only PROPOSES a placement — it does not write anything. The
// caller (Claude, following the add-fix-shiur skill) decides whether the
// result is confident enough to act on, or needs the user's confirmation.
//
// Usage:
//   node categorize-shiur.mjs --title "Bava Kamma Daf 5" --description "..."
//
// Prints one JSON object to stdout:
//   { tier, confidence, nodePath: [ids...], labels: [labels...], alternatives }
// =============================================================================
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = process.cwd();
dotenv.config({ path: path.join(ROOT, '.env.local') });
const folderHierarchy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'folder-hierarchy.json'), 'utf8'));
const masechtaLookup = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'masechta-lookup.json'), 'utf8'));

const MASECHTA_ALIASES = Object.entries(masechtaLookup).sort((a, b) => b[0].length - a[0].length);
const DAF_RE = /\b([1-9]|[1-9]\d|1\d{2}|200)[ab]?\b/;
const PIRKEI_AVOT_RE = /\bpirkei\s+avo[st]\b/i;
const PIRKEI_AVOT_NODE_PATH = ['kisvei-chazal', 'kisvei-chazal-all'];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--title') out.title = argv[++i];
    else if (a === '--description') out.description = argv[++i];
  }
  return out;
}

function labelsFor(nodePath) {
  const labels = [];
  let level = folderHierarchy.categories;
  for (const id of nodePath) {
    const node = (level || []).find((n) => n.id === id);
    if (!node) { labels.push(null); level = []; continue; }
    labels.push(node.label);
    level = node.children;
  }
  return labels;
}

async function categorizeWithHaiku(title, description) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const hierarchyJson = JSON.stringify(folderHierarchy, null, 2);
  const prompt = `You are categorizing a Jewish lecture (shiur) into a folder hierarchy.

Folder hierarchy (id and label only):
${hierarchyJson}

Shiur title: "${title}"
Description: "${description || 'none'}"

Respond with ONLY valid JSON, no other text:
{
  "proposed_path": ["category-id", "subcategory-id"],
  "confidence": "high" | "low",
  "alternatives": [["alt-cat-id", "alt-sub-id"], ...]
}

Rules:
- proposed_path must use exact id values from the hierarchy above
- confidence is "high" if you are quite certain, "low" if ambiguous
- alternatives is an array of 0-2 alternative paths (can be empty array)
- If the shiur clearly does not fit any category, use the closest match with confidence "low"`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content.find((b) => b.type === 'text')?.text ?? '{}';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);

  const categoryIds = new Set(folderHierarchy.categories.map((c) => c.id));
  const nodePath = parsed.proposed_path || [];
  const confidence = (!nodePath.length || !categoryIds.has(nodePath[0])) ? 'low' : (parsed.confidence || 'low');

  return { tier: 2, nodePath, confidence, alternatives: parsed.alternatives ?? [] };
}

async function categorize(title, description) {
  if (PIRKEI_AVOT_RE.test(title)) {
    return { tier: 1, nodePath: PIRKEI_AVOT_NODE_PATH, confidence: 'high', alternatives: [] };
  }
  const lower = title.toLowerCase();
  for (const [alias, nodePath] of MASECHTA_ALIASES) {
    const aliasRe = new RegExp(`\\b${alias.replace(/\s+/g, '\\s+')}\\b`);
    if (aliasRe.test(lower) && DAF_RE.test(title)) {
      return { tier: 1, nodePath, confidence: 'high', alternatives: [] };
    }
  }
  return categorizeWithHaiku(title, description);
}

async function main() {
  const { title, description = '' } = parseArgs(process.argv.slice(2));
  if (!title) {
    console.error('Usage: node categorize-shiur.mjs --title "..." [--description "..."]');
    process.exit(1);
  }
  const result = await categorize(title, description);
  console.log(JSON.stringify({ ...result, labels: labelsFor(result.nodePath) }, null, 2));
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
