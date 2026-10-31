// Headless-Chrome smoke test over the DevTools protocol. No dependencies.
// Usage: npm run build && node scripts/smoke.mjs [baseUrl]
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:4173/spanish-app/'
const chrome = process.env.CHROME ?? 'google-chrome'
const port = 9333
const profile = mkdtempSync(join(tmpdir(), 'smoke-'))

const proc = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitForChrome() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/json/version`)
      if (r.ok) return
    } catch {}
    await sleep(200)
  }
  throw new Error('chrome did not start')
}

let id = 0
const pending = new Map()
const consoleErrors = []
let ws

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id
    pending.set(msgId, { resolve, reject })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed')
  return r.result.value
}

async function waitForText(text, timeoutMs = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    // innerText applies CSS text-transform, so compare case-insensitively.
    const body = await evaluate('document.body.innerText')
    if (body.toLowerCase().includes(text.toLowerCase())) return body.toLowerCase()
    await sleep(150)
  }
  throw new Error(`timeout waiting for "${text}"\n--- body ---\n${await evaluate('document.body.innerText')}`)
}

const failures = []
async function step(name, fn) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (e) {
    failures.push(name)
    console.log(`✗ ${name}\n  ${String(e.message ?? e).split('\n').join('\n  ')}`)
  }
}

try {
  await waitForChrome()
  const target = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg.result ?? msg)
      pending.delete(msg.id)
    } else if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.exception?.description ?? 'exception')
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
    }
  }
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.navigate', { url: base + '#/' })

  await step('Home renders active theme', async () => {
    await waitForText('Comida callejera')
    await waitForText('0 de 9 terminados')
  })

  await step('Theme view lists items grouped by skill', async () => {
    await evaluate(`location.hash = '#/theme/comida-callejera'`)
    const body = await waitForText('Un taco en la esquina')
    for (const t of ['Lectura', 'Escucha', 'Habla', 'Escritura', 'Gramática', 'Recursos recomendados']) {
      if (!body.includes(t.toLowerCase())) throw new Error(`missing "${t}"`)
    }
  })

  await step('Reading screen renders tappable text', async () => {
    await evaluate(`location.hash = '#/read/cc-reading-tacos'`)
    await waitForText('Son las ocho de la noche')
    const n = await evaluate(`document.querySelectorAll('[data-seg][data-i]').length`)
    if (n < 100) throw new Error(`only ${n} word spans`)
  })

  await step('Tap a word → sheet → save card', async () => {
    await evaluate(`(() => {
      const el = [...document.querySelectorAll('[data-seg][data-i]')].find(e => e.textContent === 'taquero')
      const opts = { bubbles: true, pointerType: 'touch', clientX: 10, clientY: 10, button: 0 }
      el.dispatchEvent(new PointerEvent('pointerdown', opts))
      el.dispatchEvent(new PointerEvent('pointerup', opts))
    })()`)
    await waitForText('Significado')
    await evaluate(`(() => {
      const input = document.querySelector('input[placeholder]')
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, 'taco seller')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector('form button[type=submit]').click()
    })()`)
    await waitForText('1 tarjeta de este texto')
    const stored = await evaluate(`(async () => {
      const req = indexedDB.open('spanish-app')
      const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error) })
      const tx = db.transaction('cards'); const all = await new Promise((res) => { const r = tx.objectStore('cards').getAll(); r.onsuccess = () => res(r.result) })
      return all.map(c => ({ word: c.word, meaning: c.meaning, state: c.fsrs.state, reps: c.fsrs.reps }))
    })()`)
    if (stored.length !== 1 || stored[0].word !== 'taquero' || stored[0].meaning !== 'taco seller') {
      throw new Error('card not stored as expected: ' + JSON.stringify(stored))
    }
  })

  await step('Known word is underlined; tapping shows saved meaning', async () => {
    const underlined = await evaluate(`[...document.querySelectorAll('[data-seg][data-i]')].filter(e => e.className.includes('underline')).map(e => e.textContent)`)
    if (!underlined.includes('taquero')) throw new Error('taquero not underlined: ' + JSON.stringify(underlined))
    await evaluate(`(() => {
      const el = [...document.querySelectorAll('[data-seg][data-i]')].find(e => e.textContent === 'taquero')
      const opts = { bubbles: true, pointerType: 'touch', clientX: 10, clientY: 10, button: 0 }
      el.dispatchEvent(new PointerEvent('pointerdown', opts)); el.dispatchEvent(new PointerEvent('pointerup', opts))
    })()`)
    await waitForText('Guardar cambios')
    const v = await evaluate(`document.querySelector('input[placeholder]').value`)
    if (v !== 'taco seller') throw new Error('meaning not prefilled: ' + v)
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Cancelar').click()`)
  })

  await step('Gloss toggle reveals English', async () => {
    await evaluate(`document.querySelector('button[aria-label="Ver traducción"]').click()`)
    await waitForText("It's eight at night")
  })

  await step('Mark done → theme shows 1 de 9', async () => {
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Marcar como terminado')).click()`)
    await waitForText('1 de 9 terminados')
  })

  await step('Home shows 1 due card and a review button', async () => {
    await evaluate(`location.hash = '#/'`)
    await waitForText('1 guardada · 1 pendiente')
    await waitForText('Repasar 1')
  })

  await step('Review: front blanks the word, reveal shows meaning, rate Good', async () => {
    await evaluate(`location.hash = '#/review'`)
    const body = await waitForText('Mostrar respuesta')
    if (!body.includes('taquero')) throw new Error('front missing word')
    if (!body.includes('____')) throw new Error('example not blanked')
    if (body.includes('taco seller')) throw new Error('meaning leaked before reveal')
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Mostrar respuesta')).click()`)
    const back = await waitForText('taco seller')
    for (const t of ['Otra vez', 'Difícil', 'Bien', 'Fácil']) if (!back.includes(t.toLowerCase())) throw new Error(`missing ${t}`)
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Bien')).click()`)
    await waitForText('¡Listo!')
    await waitForText('1 tarjeta repasada')
    const stored = await evaluate(`(async () => {
      const req = indexedDB.open('spanish-app')
      const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error) })
      const get = (store) => new Promise((res) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result) })
      const cards = await get('cards'); const reviews = await get('reviews')
      return { reps: cards[0].fsrs.reps, state: cards[0].fsrs.state, dueInMs: cards[0].fsrs.due - Date.now(), reviews: reviews.map(r => ({ rating: r.rating, wasNew: r.wasNew })) }
    })()`)
    if (stored.reps !== 1 || stored.state === 0) throw new Error('card not scheduled: ' + JSON.stringify(stored))
    if (stored.dueInMs < 5 * 60000) throw new Error('Good on a new card should schedule ≥ 10 min out: ' + JSON.stringify(stored))
    if (stored.reviews.length !== 1 || stored.reviews[0].rating !== 3 || stored.reviews[0].wasNew !== true) throw new Error('review row wrong: ' + JSON.stringify(stored))
  })

  await step('Home shows nothing pending after review', async () => {
    await evaluate(`location.hash = '#/'`)
    await waitForText('1 guardada · 0 pendientes')
    await waitForText('Nada pendiente por ahora')
  })

  await step('Vocab list shows the card, search filters, edit sheet opens', async () => {
    await evaluate(`location.hash = '#/vocab'`)
    const body = await waitForText('taco seller')
    if (!body.includes('taquero')) throw new Error('word missing')
    await evaluate(`(() => {
      const input = document.querySelector('input[type=search]')
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, 'zzz'); input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await waitForText('Sin resultados')
    await evaluate(`(() => {
      const input = document.querySelector('input[type=search]')
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, 'taq'); input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await waitForText('taquero')
    await evaluate(`[...document.querySelectorAll('li button')].find(b => b.textContent.includes('taquero')).click()`)
    await waitForText('Guardar cambios')
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Cancelar').click()`)
  })

  await step('Dark mode: setting switches tokens, theme-color and localStorage', async () => {
    await evaluate(`location.hash = '#/'`)
    await waitForText('Apariencia')
    const light = await evaluate(`getComputedStyle(document.body).backgroundColor`)
    if (light !== 'rgb(250, 247, 242)') throw new Error('light paper wrong: ' + light)
    await evaluate(`(() => {
      const sel = document.querySelector('select[aria-label="Tema"]')
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(sel, 'dark'); sel.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    const start = Date.now()
    let dark = ''
    while (Date.now() - start < 5000) {
      dark = await evaluate(`getComputedStyle(document.body).backgroundColor`)
      if (dark === 'rgb(23, 20, 18)') break
      await sleep(100)
    }
    if (dark !== 'rgb(23, 20, 18)') throw new Error('dark paper wrong: ' + dark)
    const meta = await evaluate(`[...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.content + '|' + (m.getAttribute('media') ?? '')).join(',')`)
    if (meta !== '#171412|,#171412|') throw new Error('theme-color metas: ' + meta)
    const card = await evaluate(`getComputedStyle(document.querySelector('section.bg-card')).backgroundColor`)
    if (card !== 'rgb(34, 30, 27)') throw new Error('card surface wrong in dark: ' + card)
    const ls = await evaluate(`localStorage.getItem('theme')`)
    if (ls !== 'dark') throw new Error('localStorage theme: ' + ls)
    // Reload: the pre-paint script must apply dark before React does.
    await send('Page.navigate', { url: base + '#/' })
    await waitForText('Hoy')
    const early = await evaluate(`document.documentElement.dataset.theme`)
    if (early !== 'dark') throw new Error('data-theme after reload: ' + early)
    await evaluate(`(() => {
      const sel = document.querySelector('select[aria-label="Tema"]')
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(sel, 'system'); sel.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await sleep(300)
    const back = await evaluate(`document.documentElement.dataset.theme ?? 'none'`)
    if (back !== 'none') throw new Error('system pref should clear data-theme: ' + back)
  })

  await step('No console errors', async () => {
    if (consoleErrors.length) throw new Error(consoleErrors.join('\n'))
  })
} finally {
  proc.kill()
}

console.log(failures.length ? `\n${failures.length} failure(s)` : '\nall smoke steps passed')
process.exit(failures.length ? 1 : 0)
