// Checks every video clip in the packs against YouTube's public oEmbed endpoint:
// the video exists, its title and channel match the pack, and `embeddable`
// is right (oEmbed answers 401 when the channel blocks embedding).
// Usage: npx tsx scripts/check-videos.ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'content/themes'
let problems = 0
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
  const pack = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  for (const item of pack.items) {
    const v = item.video
    if (!v) continue
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v.youtubeId}`)}`
    const res = await fetch(url)
    const issues: string[] = []
    if (res.status === 401) {
      if (v.embeddable) issues.push('channel blocks embedding: set embeddable false')
      // oEmbed hides the title then; read it from the watch page instead.
      const page = await (await fetch(`https://www.youtube.com/watch?v=${v.youtubeId}`, { headers: { 'Accept-Language': 'en' } })).text()
      const title = page.match(/<meta name="title" content="([^"]*)"/)?.[1]?.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      if (title !== v.title) issues.push(`title is «${title ?? 'not found'}»`)
    } else if (!res.ok) {
      issues.push(`oEmbed ${res.status}: video missing or private`)
    } else {
      const o = (await res.json()) as { title: string; author_name: string }
      if (o.title !== v.title) issues.push(`title is «${o.title}»`)
      if (o.author_name !== v.channel) issues.push(`channel is «${o.author_name}»`)
      if (!v.embeddable) issues.push('embeds fine: set embeddable true')
    }
    problems += issues.length
    console.log(`${issues.length ? '✗' : '✓'} ${item.id}  ${v.youtubeId} (${v.channel})${issues.map((i) => `\n    ${i}`).join('')}`)
  }
}
process.exit(problems ? 1 : 0)
