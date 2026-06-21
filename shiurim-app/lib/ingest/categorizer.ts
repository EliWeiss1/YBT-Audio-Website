import Anthropic from '@anthropic-ai/sdk'
import type { CategorizeResult } from './types'
import masechtaLookup from '@/data/masechta-lookup.json'
import folderHierarchy from '@/data/folder-hierarchy.json'

// Sort aliases by length descending so multi-word names match before single-word
const MASECHTA_ALIASES = Object.entries(masechtaLookup as Record<string, string[]>)
  .sort((a, b) => b[0].length - a[0].length)

// Daf pattern: number optionally followed by a or b (e.g. "34a", "12", "5b")
const DAF_RE = /\b\d+[ab]?\b/

export async function categorize(title: string, description: string): Promise<CategorizeResult> {
  const lower = title.toLowerCase()

  for (const [alias, nodePath] of MASECHTA_ALIASES) {
    if (lower.includes(alias)) {
      // Confirm there's a daf-like number in the title to avoid false positives
      // (e.g. "Shabbat Laws Overview" should not match "shabbat" without a daf)
      if (DAF_RE.test(title)) {
        return { tier: 1, nodePath, confidence: 'high' }
      }
    }
  }

  // Tier 2: call Haiku
  return await categorizeWithHaiku(title, description)
}

async function categorizeWithHaiku(title: string, description: string): Promise<CategorizeResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const hierarchyJson = JSON.stringify(folderHierarchy, null, 2)
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
- If the shiur clearly does not fit any category, use the closest match with confidence "low"`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content.find(b => b.type === 'text')?.text ?? '{}'
  const parsed = JSON.parse(text) as {
    proposed_path: string[]
    confidence: 'high' | 'low'
    alternatives: string[][]
  }

  return {
    tier: 2,
    nodePath: parsed.proposed_path,
    confidence: parsed.confidence,
    alternatives: parsed.alternatives ?? [],
  }
}
