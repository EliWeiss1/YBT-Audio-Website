// Canonical rabbi name → all raw variants that map to it
const RABBI_GROUPS: Record<string, string[]> = {
  'Rabbi Chait': ['Rabbi Yisroel Chait', 'Rabbi Chait'],
  'Rabbi Mann': ['Rabbi Reuven Mann', 'Rabbi Mann'],
  'Rabbi Bald': ['Rabbi Henoch Bald', 'Rabbi H. Bald', 'R. H. Bald', 'Rabbi Bald'],
  'Rabbi Cinamon': ['Rabbi Zev Cinamon', 'Rabbi Z. Cinamon'],
  'Rabbi Moskowitz': ['Rabbi M. Moskowitz', 'Rabbi Morton Moskowitz', 'Rabbi Moskowitz'],
  'Rabbi David Markowitz': ['Rabbi David Markowitz', 'Rabbi D. Markowitz'],
  'Rabbi Schneeweiss': ['Rabbi Matthew Schneeweiss', 'Rabbi Mathew Schneeweiss', 'Rabbi Schneeweiss'],
  'Rabbi Aaron Zimmer': [
    'Rabbi Aaron Zimmer', 'Rabbi Aron Zimmer', 'Rabbi Aharon Zimmer', 'Rabbi A. Zimmer', 'Rabbi Zimmer',
  ],
}

// Fuzzy rules for names that arrive in many spellings (ingest filenames, email lines,
// typos). Checked after the exact-variant map. Each pattern is matched against the
// trimmed name; titles Rabbi/Rav/R. are interchangeable, the first name is optional,
// and Zimmer/Zimer/Zymmer etc. all count.
const RABBI_PATTERNS: Array<[RegExp, string]> = [
  [/^(rabbi|rav|r\.?)\s+((a|aa?ron|aharon|ahron|arron)\.?\s+)?z[iy]mm?[ae]r$/i, 'Rabbi Aaron Zimmer'],
]

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
  const trimmed = (raw ?? '').replace(/\s+/g, ' ').trim()
  for (const [re, canonical] of RABBI_PATTERNS) {
    if (re.test(trimmed)) return canonical
  }
  return raw
}

/** Returns all raw variants for a canonical name (or just [canonical] if ungrouped) */
export function getRawVariants(canonical: string): string[] {
  return RABBI_GROUPS[canonical] ?? [canonical]
}
