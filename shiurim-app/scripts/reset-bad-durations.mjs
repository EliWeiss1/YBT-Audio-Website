/**
 * reset-bad-durations.mjs
 *
 * Resets any duration under 60 seconds back to 0.
 * These are bad readings from partial fetches — better to show nothing than a wrong value.
 *
 * Run: node scripts/reset-bad-durations.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_PATH = join(__dirname, '../data/lectures.json')

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'))

let reset = 0
function walk(node) {
  for (const lec of node.lectures ?? []) {
    if (lec.duration > 0 && lec.duration < 60) {
      lec.duration = 0
      reset++
    }
  }
  for (const child of node.children ?? []) walk(child)
}
for (const cat of data.categories) walk(cat)

writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))
console.log(`Reset ${reset} bad durations to 0`)
