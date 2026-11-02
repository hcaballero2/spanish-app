// Checks every pack glossary meaning against two reputable ES→EN dictionaries
// (WordReference and SpanishDict) and writes content/checks/<pack>.glossary.json.
// Pages are cached in .cache/dict and requests are spaced out, so re-runs are
// cheap and polite. Words neither dictionary confirms are checked by hand,
// Mexican words against DEM (dem.colmex.mx); the result goes in the pack's
// glossarySources. Usage: npx tsx scripts/check-glossary.ts [packId] [--refetch]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { alternatives, meaningMatches, normalizeMeaning } from '../src/lib/meaning'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const CACHE = '.cache/dict'
const DELAY_MS = 1500
const refetch = process.argv.includes('--refetch')
const only = process.argv.slice(2).find((a) => !a.startsWith('--'))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\\u002F/g, '/')

async function page(site: 'wr' | 'sd', word: string): Promise<string> {
  mkdirSync(CACHE, { recursive: true })
  const file = join(CACHE, `${site}-${encodeURIComponent(word)}.html`)
  if (!refetch && existsSync(file)) return readFileSync(file, 'utf8')
  const url =
    site === 'wr'
      ? `https://www.wordreference.com/es/en/translation.asp?spen=${encodeURIComponent(word)}`
      : `https://www.spanishdict.com/translate/${encodeURIComponent(word)}`
  await sleep(DELAY_MS)
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  const html = res.ok ? await res.text() : ''
  writeFileSync(file, html)
  return html
}

/** WordReference: the Spanish headwords and the English "ToWrd" cells of its main table. */
function parseWr(html: string) {
  const heads = [...html.matchAll(/<td class='FrWrd'[^>]*><strong>([^<]+)/g)].map((m) => decode(m[1]!.trim()))
  const tos = [...html.matchAll(/<td class='ToWrd'\s*>([^<]+)/g)].map((m) => decode(m[1]!.trim())).filter(Boolean)
  return { lemma: heads[0], translations: [...new Set(tos)].slice(0, 25) }
}

/** SpanishDict: the headword it resolved to (conjugations → infinitive) and its quick definitions. */
function parseSd(html: string) {
  const block = html.match(/headwordAndQuickdefsProps":(\{.{0,4000})/)?.[1] ?? ''
  const lemma = block.match(/"headword":\{"displayText":"([^"]+)"/)?.[1]
  const tos = [...block.matchAll(/"quickdef\d":\{"displayText":"([^"]+)"/g)].map((m) => decode(m[1]!))
  return { lemma: lemma && decode(lemma), translations: tos }
}

/** "I can stand" → "stand", "it costs" → "costs": dictionaries list the bare verb. */
function bare(meaning: string): string {
  return normalizeMeaning(meaning).replace(/^(i|you|he|she|it|we|they)( (can|will|am|are|is|was|were|do|did|have|had))? /, '')
}

function agrees(meaning: string, translations: string[]): boolean {
  if (!translations.length) return false
  const keys = translations.join(' / ')
  return alternatives(meaning).some((alt) => meaningMatches(alt, [keys]) || meaningMatches(bare(alt), [keys]))
}

interface Pack {
  id: string
  glossary?: Record<string, string>
}

const packs = readdirSync('content/themes')
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .map((f) => JSON.parse(readFileSync(join('content/themes', f), 'utf8')) as Pack)
  .filter((p) => !only || p.id === only)

for (const pack of packs) {
  const entries = Object.entries(pack.glossary ?? {})
  const results = []
  let i = 0
  for (const [word, meaning] of entries) {
    const wr = parseWr(await page('wr', word))
    const sd = parseSd(await page('sd', word))
    const ok = { wordreference: agrees(meaning, wr.translations), spanishdict: agrees(meaning, sd.translations) }
    results.push({ word, meaning, verdict: ok.wordreference || ok.spanishdict ? 'confirmed' : 'review', ok, wordreference: wr, spanishdict: sd })
    if (++i % 20 === 0) console.log(`${pack.id}: ${i}/${entries.length}`)
  }
  const out = join('content/checks', `${pack.id}.glossary.json`)
  writeFileSync(out, JSON.stringify({ pack: pack.id, checkedAt: new Date().toISOString().slice(0, 10), results }, null, 1) + '\n')
  const review = results.filter((r) => r.verdict === 'review')
  console.log(`${pack.id}: ${results.length - review.length} confirmed, ${review.length} to review → ${out}`)
  // Missing pack.glossarySources entries for confirmed words, ready to paste. Words to
  // review are checked by hand (DEM for Mexican words, "name" for proper names).
  const missing = results.filter((r) => r.verdict === 'confirmed' && !pack.glossarySources?.[r.word])
  if (missing.length > 0) {
    console.log(`glossarySources to add (${missing.length}):`)
    for (const r of missing) console.log(`    ${JSON.stringify(r.word)}: ${JSON.stringify(Object.keys(r.ok).filter((k) => r.ok[k as keyof typeof r.ok]))},`)
  }
  for (const r of review) console.log(`  review: ${r.word} = ${r.meaning}`)
}
