import { ThemePackSchema, type ThemePack } from './schema'

// Vite bundles every pack at build time; the app never fetches content.
const raw = import.meta.glob<unknown>('../../content/themes/*.json', {
  eager: true,
  import: 'default',
})

function load(): ThemePack[] {
  const packs: ThemePack[] = []
  for (const [path, data] of Object.entries(raw)) {
    if (path.includes('/_template.json')) continue
    const result = ThemePackSchema.safeParse(data)
    if (!result.success) {
      // scripts/validate-content.ts catches this before build; this is a last line of defence.
      console.error(`Invalid pack ${path}`, result.error.issues)
      continue
    }
    packs.push(result.data)
  }
  return packs.sort((a, b) => a.order - b.order)
}

export const packs: ThemePack[] = load()

export function getPack(id: string): ThemePack | undefined {
  return packs.find((p) => p.id === id)
}
