// The TTL back-catalogue's sections, in tab order. A shiur belongs to a section
// by its ID prefix (D-384 → Discussion), not by its category breadcrumb —
// HL- shiurim, for example, live under both Halacha and Holidays in the tree.
//
// Keep in sync with TTL_SECTION_PREFIX in scripts/generate-node-data.mjs, which
// builds public/lectures-data/ttl.json off these same keys.
//
// Other TTL-style prefixes (G-, KC-, SA-, RA-, R-, L-, NR-) are deliberately not
// part of v1 of the TTL tab.

import type { FlatLecture } from '@/lib/lecture-utils'

export const TTL_SECTIONS = [
  { key: 'discussion',  label: 'Discussion', prefix: 'D' },
  { key: 'chumash',     label: 'Chumash',    prefix: 'C' },
  { key: 'nach',        label: 'Nach',       prefix: 'N' },
  { key: 'halacha',     label: 'Halacha',    prefix: 'HL' },
  { key: 'bnai-noach',  label: 'Bnai Noach', prefix: 'BN' },
] as const

export type TtlSectionKey = (typeof TTL_SECTIONS)[number]['key']

export const DEFAULT_TTL_SECTION: TtlSectionKey = 'discussion'

export function isTtlSection(v: unknown): v is TtlSectionKey {
  return TTL_SECTIONS.some(s => s.key === v)
}

/** A TTL lecture as stored in ttl.json — a FlatLecture plus the numeric part of
 *  its id, which is both the sort key and what the list shows in the gutter. */
export type TtlLecture = FlatLecture & { ttlNumber: number }

export type TtlData = { sections: Record<TtlSectionKey, TtlLecture[]> }
