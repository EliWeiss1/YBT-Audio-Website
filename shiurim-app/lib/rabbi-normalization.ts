// Speaker-name normalization. The alias data lives in data/rabbi-aliases.json so the
// Node scripts (scripts/lib/rabbi-normalization.cjs — build step, data scripts) apply
// exactly the same rules. Keep the matching logic below in sync with that file.
import aliases from '../data/rabbi-aliases.json'

// Canonical rabbi name → all raw variants that map to it
const RABBI_GROUPS: Record<string, string[]> = aliases.groups

// Fuzzy rules for names that arrive in many spellings (ingest filenames, email lines,
// typos). Checked after the exact-variant map, in order.
const RABBI_PATTERNS: Array<[RegExp, string]> = (aliases.patterns as [string, string][]).map(
  ([src, canonical]) => [new RegExp(src, 'i'), canonical],
)

// raw variant → canonical name (built once)
const RAW_TO_CANONICAL: Record<string, string> = {}
for (const [canonical, variants] of Object.entries(RABBI_GROUPS)) {
  for (const v of variants) {
    RAW_TO_CANONICAL[v] = canonical
  }
}

/** Returns the canonical display name for a raw speaker tag */
export function normalizeRabbi(raw: string): string {
  const exact = RAW_TO_CANONICAL[raw]
  if (exact) return exact
  const trimmed = (raw ?? '').replace(/\s+/g, ' ').trim().replace(/\s*\(masoret\)$/i, '')
  if (RAW_TO_CANONICAL[trimmed]) return RAW_TO_CANONICAL[trimmed]
  for (const [re, canonical] of RABBI_PATTERNS) {
    if (re.test(trimmed)) return canonical
  }
  return raw
}

/** Returns all raw variants for a canonical name (or just [canonical] if ungrouped) */
export function getRawVariants(canonical: string): string[] {
  return RABBI_GROUPS[canonical] ?? [canonical]
}
