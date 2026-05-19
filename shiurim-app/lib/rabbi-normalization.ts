// Canonical rabbi name → all raw variants that map to it
const RABBI_GROUPS: Record<string, string[]> = {
  'Rabbi Chait': ['Rabbi Yisroel Chait', 'Rabbi Chait'],
  'Rabbi Mann': ['Rabbi Reuven Mann', 'Rabbi Mann'],
  'Rabbi Bald': ['Rabbi Henoch Bald', 'Rabbi H. Bald', 'R. H. Bald', 'Rabbi Bald'],
  'Rabbi Cinamon': ['Rabbi Zev Cinamon', 'Rabbi Z. Cinamon'],
  'Rabbi Moskowitz': ['Rabbi M. Moskowitz', 'Rabbi Morton Moskowitz', 'Rabbi Moskowitz'],
  'Rabbi David Markowitz': ['Rabbi David Markowitz', 'Rabbi D. Markowitz'],
  'Rabbi Schneeweiss': ['Rabbi Matthew Schneeweiss', 'Rabbi Mathew Schneeweiss', 'Rabbi Schneeweiss'],
}

// raw variant → canonical name (built once)
const RAW_TO_CANONICAL: Record<string, string> = {}
for (const [canonical, variants] of Object.entries(RABBI_GROUPS)) {
  for (const v of variants) {
    RAW_TO_CANONICAL[v] = canonical
  }
}

/** Returns the canonical display name for a raw speaker tag */
export function normalizeRabbi(raw: string): string {
  return RAW_TO_CANONICAL[raw] ?? raw
}

/** Returns all raw variants for a canonical name (or just [canonical] if ungrouped) */
export function getRawVariants(canonical: string): string[] {
  return RABBI_GROUPS[canonical] ?? [canonical]
}
