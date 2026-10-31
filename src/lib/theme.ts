import type { ThemePref } from '../db/types'

const LIGHT = '#faf7f2'
const DARK = '#171412'
const KEY = 'theme'

/**
 * Applies the appearance preference: sets `data-theme` on <html> (the CSS in
 * index.css reads it), keeps the iOS status-bar colour in step, and caches the
 * choice in localStorage so index.html can apply it before React loads.
 */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement
  if (pref === 'system') delete root.dataset.theme
  else root.dataset.theme = pref

  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  for (const m of metas) {
    const media = m.getAttribute('data-media') ?? m.getAttribute('media') ?? ''
    if (!m.hasAttribute('data-media')) m.setAttribute('data-media', media)
    if (pref === 'system') {
      m.setAttribute('media', media)
      m.content = media.includes('dark') ? DARK : LIGHT
    } else {
      // One forced colour for every meta so Safari does not pick the other one.
      m.removeAttribute('media')
      m.content = pref === 'dark' ? DARK : LIGHT
    }
  }

  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* private mode, storage full: the setting still lives in Dexie */
  }
}

export function isDarkNow(): boolean {
  const forced = document.documentElement.dataset.theme
  if (forced === 'dark') return true
  if (forced === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}
