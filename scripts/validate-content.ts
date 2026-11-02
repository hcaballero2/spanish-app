// Validates every pack in content/themes against the Zod schema and the
// PLAN.md length rules. Run with `npm run validate`; the build runs it first.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ThemePackSchema, READING_WORDS, countWords } from '../src/content/schema'
import { tokenize } from '../src/lib/words'

const dir = join(process.cwd(), 'content', 'themes')
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'))

let errors = 0
let warnings = 0
const orders = new Map<number, string>()
const ids = new Map<string, string>()

for (const file of files) {
  const data: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  const result = ThemePackSchema.safeParse(data)
  if (!result.success) {
    errors++
    console.error(`✗ ${file}`)
    for (const issue of result.error.issues) {
      console.error(`    ${issue.path.join('.')}: ${issue.message}`)
    }
    continue
  }
  const pack = result.data
  if (orders.has(pack.order)) {
    errors++
    console.error(`✗ ${file}: order ${pack.order} already used by ${orders.get(pack.order)}`)
  }
  if (ids.has(pack.id)) {
    errors++
    console.error(`✗ ${file}: id ${pack.id} already used by ${ids.get(pack.id)}`)
  }
  orders.set(pack.order, file)
  ids.set(pack.id, file)

  const notes: string[] = []
  for (const item of pack.items) {
    if ((item.skill === 'reading' || item.skill === 'listening') && item.segments) {
      const words = item.segments.reduce((n, s) => n + countWords(s.es), 0)
      const target = READING_WORDS[item.level]
      const lo = Math.round(target * 0.65)
      const hi = Math.round(target * 1.35)
      if (words < lo || words > hi) {
        warnings++
        notes.push(`  ⚠ ${item.id}: ${words} words, target ~${target} for ${item.level} (${lo}–${hi})`)
      }
      const missingGloss = item.segments.filter((s) => !s.en).length
      if (missingGloss > 0) {
        warnings++
        notes.push(`  ⚠ ${item.id}: ${missingGloss} segment(s) without English gloss`)
      }
    }
    const text = JSON.stringify(item)
    if (/\b(vosotros|vosotras|os\s+gusta|sois|tenéis|habéis)\b/i.test(text)) {
      errors++
      notes.push(`  ✗ ${item.id}: uses vosotros forms (Mexican Spanish only)`)
    }
  }
  // Every word in a reading/listening text should be in the glossary (answer key for meaning checks).
  const missing = new Set<string>()
  for (const item of pack.items) {
    if (item.skill !== 'reading' && item.skill !== 'listening') continue
    for (const s of item.segments) for (const t of tokenize(s.es)) if (t.key && !pack.glossary?.[t.key]) missing.add(t.key)
  }
  // Every glossary meaning needs the dictionary it was checked in (no machine translation).
  const unsourced = Object.keys(pack.glossary ?? {}).filter((k) => !pack.glossarySources?.[k])
  if (unsourced.length > 0) {
    errors++
    notes.push(`  ✗ glossary has ${unsourced.length} word(s) without a source (run scripts/check-glossary.ts): ${unsourced.slice(0, 15).join(', ')}`)
  }
  if (missing.size > 0) {
    warnings++
    notes.push(`  ⚠ glossary is missing ${missing.size} word(s): ${[...missing].slice(0, 15).join(', ')}${missing.size > 15 ? ', …' : ''}`)
  }
  console.log(`${notes.some((n) => n.includes('✗')) ? '✗' : '✓'} ${file}  (${pack.level}, ${pack.items.length} items)`)
  for (const n of notes) console.log(n)
}

console.log(`\n${files.length} pack(s), ${errors} error(s), ${warnings} warning(s)`)
if (errors > 0) process.exit(1)
