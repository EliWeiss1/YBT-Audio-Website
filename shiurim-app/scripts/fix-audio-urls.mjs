/**
 * fix-audio-urls.mjs
 *
 * Fixes two classes of malformed audioUrl values in lectures.json:
 *
 *  1. Prepended YUTorah prefix:
 *       "https://download.yutorah.org http://www.ybt.org/audio/..."
 *     → strip everything up to and including the first space → keep the real URL
 *
 *  2. Spaces in the filename path:
 *       "http://ybt.org/students/.../Parshas Noach - Seven Days.mp3"
 *     → percent-encode each space as %20 (in path only, not protocol/host)
 *
 * Run: node scripts/fix-audio-urls.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_PATH = join(__dirname, '../data/lectures.json')

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'))

let fixed = 0

function fixUrl(raw) {
  if (!raw || !raw.includes(' ')) return raw

  // Case 1: two URLs separated by a space — keep only the second
  // Detects "... http://" or "... https://"
  const spaceHttpIdx = raw.search(/ https?:\/\//)
  if (spaceHttpIdx !== -1) {
    return raw.slice(spaceHttpIdx + 1).trim()
  }

  // Case 2: single URL with spaces in the path — encode them
  // Only encode spaces; leave everything else untouched
  return raw.replace(/ /g, '%20')
}

function walk(node) {
  for (const lec of node.lectures ?? []) {
    if (lec.audioUrl && lec.audioUrl.includes(' ')) {
      const cleaned = fixUrl(lec.audioUrl)
      if (cleaned !== lec.audioUrl) {
        console.log(`  ${lec.id}`)
        console.log(`    before: ${lec.audioUrl}`)
        console.log(`    after:  ${cleaned}`)
        lec.audioUrl = cleaned
        fixed++
      }
    }
  }
  for (const child of node.children ?? []) walk(child)
}

for (const cat of data.categories) walk(cat)

writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))
console.log(`\n[fix-audio-urls] Fixed ${fixed} URLs → saved to data/lectures.json`)
