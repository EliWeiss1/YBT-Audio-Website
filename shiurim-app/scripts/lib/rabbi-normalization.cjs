// Node-script twin of lib/rabbi-normalization.ts — same data (data/rabbi-aliases.json),
// same matching logic. CommonJS so both the .js scripts (require) and the .mjs
// scripts (import) can use it. Keep the logic in sync with the TS version.
const aliases = require('../../data/rabbi-aliases.json')

const RAW_TO_CANONICAL = {}
for (const [canonical, variants] of Object.entries(aliases.groups)) {
  for (const v of variants) RAW_TO_CANONICAL[v] = canonical
}
const RABBI_PATTERNS = aliases.patterns.map(([src, canonical]) => [new RegExp(src, 'i'), canonical])

/** Returns the canonical display name for a raw speaker tag (non-strings pass through). */
function normalizeRabbi(raw) {
  if (typeof raw !== 'string') return raw
  const exact = RAW_TO_CANONICAL[raw]
  if (exact) return exact
  const trimmed = raw.replace(/\s+/g, ' ').trim().replace(/\s*\(masoret\)$/i, '')
  if (RAW_TO_CANONICAL[trimmed]) return RAW_TO_CANONICAL[trimmed]
  for (const [re, canonical] of RABBI_PATTERNS) {
    if (re.test(trimmed)) return canonical
  }
  return raw
}

exports.normalizeRabbi = normalizeRabbi
exports.RABBI_GROUPS = aliases.groups
