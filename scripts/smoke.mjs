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
  // A fake microphone that is always allowed, for the speaking screens.
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
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
// Helpers that run in the page.
const tapWord = (word) => `(() => {
  const el = [...document.querySelectorAll('[data-seg][data-i]')].find(e => e.textContent === ${JSON.stringify(word)})
  const opts = { bubbles: true, pointerType: 'touch', clientX: 10, clientY: 10, button: 0 }
  el.dispatchEvent(new PointerEvent('pointerdown', opts)); el.dispatchEvent(new PointerEvent('pointerup', opts))
})()`
const typeInto = (selector, value) => `(() => {
  const input = document.querySelector(${JSON.stringify(selector)})
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true }))
})()`
const clickButton = (text) => `(() => {
  const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)}))
  if (!b) throw new Error('no button ' + ${JSON.stringify(text)}); b.click()
})()`
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
      { const d = msg.params.exceptionDetails; consoleErrors.push([d.text, d.exception?.description, d.url + ':' + d.lineNumber + ':' + d.columnNumber].join(' | ').slice(0, 1500)) }
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.description ?? a.value ?? JSON.stringify(a.preview ?? a)).join(' ').slice(0, 800))
    }
  }
  await send('Runtime.enable')
  await send('Page.enable')
  // Errors whose CDP description is just a class name (e.g. DexieError) get logged with message + stack.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `addEventListener('error', (e) => console.error('[page]', e.error?.name, e.error?.message, e.error?.stack)); addEventListener('unhandledrejection', (e) => console.error('[page]', e.reason?.name, e.reason?.message, e.reason?.stack))` })
  await send('Page.navigate', { url: base + '#/' })

  const idb = (body) => `(async () => {
    const req = indexedDB.open('spanish-app')
    const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error) })
    const all = (store) => new Promise((res) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result) })
    ${body}
  })()`

  await step('Home renders active theme', async () => {
    await waitForText('Comida callejera')
    await waitForText('0 de 12 terminados')
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

  await step('Reading is laid out as paragraphs', async () => {
    const paras = await evaluate(`document.querySelectorAll('[data-para]').length`)
    if (paras < 3) throw new Error(`only ${paras} paragraphs`)
    const sents = await evaluate(`document.querySelectorAll('[data-sent]').length`)
    if (sents <= paras) throw new Error(`sentences (${sents}) not grouped into paragraphs (${paras})`)
  })

  await step('Wrong guess → check shows the glossary meaning', async () => {
    await evaluate(tapWord('esquina'))
    await waitForText('¿Qué crees que significa?')
    await evaluate(typeInto('input[placeholder]', 'street'))
    await evaluate(clickButton('Comprobar'))
    const body = await waitForText('No exactamente')
    if (!body.includes('corner')) throw new Error('glossary meaning not shown')
    if (!body.includes('verificado en')) throw new Error('dictionary source not shown')
    const href = await evaluate(`[...document.querySelectorAll('a')].find(a => a.textContent === 'WordReference')?.href`)
    if (href !== 'https://www.wordreference.com/es/en/translation.asp?spen=esquina') throw new Error(`source link: ${href}`)
    await waitForText('Guardar «corner»')
    await evaluate(clickButton('Cancelar'))
  })

  await step('Tap a word → guess → check → save card', async () => {
    await evaluate(tapWord('taquero'))
    await waitForText('¿Qué crees que significa?')
    await evaluate(typeInto('input[placeholder]', 'taco seller'))
    await evaluate(clickButton('Comprobar'))
    await waitForText('¡Bien!')
    await waitForText('DEM (México)') // taquero: SpanishDict + DEM
    await evaluate(clickButton('Guardar tarjeta'))
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

  await step('Mark done → theme shows 1 de 12', async () => {
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Marcar como terminado')).click()`)
    await waitForText('1 de 12 terminados')
  })

  await step('Home shows 1 due card and a review button', async () => {
    await evaluate(`location.hash = '#/'`)
    await waitForText('1 guardada · 1 pendiente')
    await waitForText('Repasar 1')
  })

  await step('Review (multiple choice): pick the meaning, app grades it Good', async () => {
    await evaluate(`location.hash = '#/review'`)
    const body = await waitForText('elige')
    if (!body.includes('taquero')) throw new Error('front missing word')
    if (!body.includes('____')) throw new Error('example not blanked')
    const opts = await evaluate(`[...document.querySelectorAll('[aria-label="Opciones"] button')].map(b => b.textContent)`)
    if (opts.length !== 4 || !opts.includes('taco seller')) throw new Error('options: ' + JSON.stringify(opts))
    if (body.includes('correcto')) throw new Error('graded before answering')
    await evaluate(clickButton('taco seller'))
    await waitForText('¡Correcto!')
    await evaluate(clickButton('Siguiente'))
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

  await step('Review (typed): after 2 correct answers, typed recall with a fallback', async () => {
    // Simulate a second correct answer and make the card due again.
    await evaluate(`(async () => {
      const req = indexedDB.open('spanish-app')
      const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error) })
      const tx = db.transaction(['cards', 'reviews'], 'readwrite')
      const cards = tx.objectStore('cards'); const reviews = tx.objectStore('reviews')
      const all = await new Promise((res) => { const r = cards.getAll(); r.onsuccess = () => res(r.result) })
      const c = all[0]; c.fsrs.due = new Date(Date.now() - 1000); cards.put(c)
      reviews.add({ cardId: c.id, rating: 3, reviewedAt: new Date(Date.now() - 60000), wasNew: false })
      await new Promise((res) => (tx.oncomplete = res))
    })()`)
    await evaluate(`location.hash = '#/'`)
    await waitForText('Repasar 1')
    await evaluate(`location.hash = '#/review'`)
    await waitForText('escribe')
    if (await evaluate(`!!document.querySelector('[aria-label="Opciones"]')`)) throw new Error('still multiple choice')
    await evaluate(typeInto('input[aria-label="Tu respuesta"]', 'taco vendor'))
    await evaluate(clickButton('Comprobar'))
    await waitForText('No exactamente')
    await waitForText('Mi respuesta también vale')
    await evaluate(clickButton('Mi respuesta también vale'))
    await waitForText('¡Listo!')
    const ratings = await evaluate(`(async () => {
      const req = indexedDB.open('spanish-app')
      const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error) })
      return new Promise((res) => { const r = db.transaction('reviews').objectStore('reviews').getAll(); r.onsuccess = () => res(r.result.map(x => x.rating)) })
    })()`)
    if (JSON.stringify(ratings) !== '[3,3,3]') throw new Error('override should rate Good: ' + JSON.stringify(ratings))
  })

  await step('Review (English → Spanish): unlocked after 2 correct, typed in Spanish, own schedule', async () => {
    // The card now has 2+ correct Spanish → English answers, so its reverse side is due.
    await evaluate(`location.hash = '#/'`)
    await waitForText('Repasar 1')
    await evaluate(`location.hash = '#/review'`)
    await waitForText('¿Cómo se dice en español?')
    await waitForText('taco seller')
    if ((await evaluate(`document.body.innerText`)).includes('taquero')) throw new Error('answer visible before answering')
    await evaluate(typeInto('input[aria-label="Tu respuesta"]', ' Taquero. '))
    await evaluate(clickButton('Comprobar'))
    await waitForText('¡Correcto!')
    await evaluate(clickButton('Siguiente'))
    await waitForText('¡Listo!')
    const rows = await evaluate(idb(`return (await all('reviews')).map(r => [r.rating, r.dir ?? 'fwd'])`))
    if (JSON.stringify(rows.at(-1)) !== '[3,"rev"]') throw new Error('reverse review row: ' + JSON.stringify(rows))
    const card = await evaluate(idb(`const c = (await all('cards')).find(c => c.word === 'taquero'); return { ...c, fsrsRev: { ...c.fsrsRev, due: c.fsrsRev?.due?.toISOString() } }`))
    if (!(new Date(card.fsrsRev.due) > new Date()) || card.fsrsRev.reps !== 1) throw new Error('reverse schedule: ' + JSON.stringify(card.fsrsRev))
  })

  await step('Listening screen: captions, sentence stepping, hide text, word tap', async () => {
    await evaluate(`location.hash = '#/theme/comida-callejera'`)
    await waitForText('Escucha')
    const href = await evaluate(`[...document.querySelectorAll('a')].map(a => a.getAttribute('href')).find(h => h && h.includes('/listen/'))`)
    if (!href) throw new Error('theme view has no /listen/ link')
    await evaluate(`location.hash = '#/listen/cc-listening-elotes'`)
    await waitForText('Buenas tardes')
    await waitForText('Frase 1 de 17')
    const active1 = await evaluate(`document.querySelector('[data-sent].bg-accent-soft')?.dataset.sent`)
    if (active1 !== 'l1-01') throw new Error('active sentence: ' + active1)
    await evaluate(`document.querySelector('button[aria-label="Frase siguiente"]').click()`)
    await waitForText('Frase 2 de 17')
    const active2 = await evaluate(`document.querySelector('[data-sent].bg-accent-soft')?.dataset.sent`)
    if (active2 !== 'l1-02') throw new Error('active sentence after next: ' + active2)
    await evaluate(`document.querySelector('button[aria-label="Frase anterior"]').click()`)
    await waitForText('Frase 1 de 17')
    await evaluate(clickButton('Ocultar texto'))
    await waitForText('Escucha primero')
    if (await evaluate(`document.querySelectorAll('[data-sent]').length`) !== 0) throw new Error('captions still visible')
    await evaluate(clickButton('Ver texto'))
    await waitForText('Buenas tardes')
    await evaluate(tapWord('elote'))
    await waitForText('¿Qué crees que significa?')
    await evaluate(clickButton('Cancelar'))
    for (const label of ['Reproducir', 'Velocidad']) {
      if (!(await evaluate(`!!document.querySelector('button[aria-label="${label}"]')`))) throw new Error('missing ' + label)
    }
    await waitForText('Escuchar y repetir')
  })

  await step('Video clip: embedded player, key word saved, questions answerable', async () => {
    await evaluate(`location.hash = '#/theme/comida-callejera'`)
    await waitForText('Video: pedir en un puesto')
    if (!(await evaluate(`!!document.querySelector('a[href*="/video/cc-video-pedir"]')`))) throw new Error('theme view has no /video/ link')
    await evaluate(`location.hash = '#/video/cc-video-pedir'`)
    await waitForText('Escucha para')
    const src = await evaluate(`document.querySelector('iframe')?.getAttribute('src')`)
    if (src !== 'https://www.youtube-nocookie.com/embed/6CwX_8xM8eE?start=0&end=86&playsinline=1&rel=0&hl=es') throw new Error('iframe src: ' + src)
    await evaluate(`document.querySelector('button[aria-label="Guardar champiñón"]').click()`)
    await waitForText('Tarjeta guardada')
    if (!(await evaluate(`document.querySelector('button[aria-label="Guardar champiñón"]').disabled`))) throw new Error('key word not marked saved')
    const card = await evaluate(idb(`const c = (await all('cards')).find(c => c.word === 'champiñón'); return c && [c.meaning, c.exampleEs]`))
    if (JSON.stringify(card) !== '["mushroom","Quiero una quesadilla de champiñón."]') throw new Error('saved card: ' + JSON.stringify(card))
    await evaluate(clickButton('Un tlacoyo de haba con champiñón'))
    if (!(await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Un tlacoyo de haba con champiñón').className.includes('bg-ok-soft')`))) throw new Error('answer not graded')
  })

  await step('Video clip from a channel that blocks embeds opens YouTube at the start time', async () => {
    await evaluate(`location.hash = '#/video/cc-video-mercado'`)
    await waitForText('Ver en YouTube desde el 0:12')
    if (await evaluate(`!!document.querySelector('iframe')`)) throw new Error('iframe shown for a non-embeddable video')
    const href = await evaluate(`[...document.querySelectorAll('a')].find(a => a.textContent.includes('Ver en YouTube')).href`)
    if (href !== 'https://www.youtube.com/watch?v=Ldf8BmDoEys&t=12s') throw new Error('watch link: ' + href)
  })

  await step('Timer runs on a study screen and stores a reading session', async () => {
    await evaluate(`location.hash = '#/read/cc-reading-tacos'`)
    await waitForText('taquero')
    if (!(await evaluate(`!!document.querySelector('[role="timer"]')`))) throw new Error('no timer on reading screen')
    const clock = async () => {
      const [m, s] = (await evaluate(`document.querySelector('[role="timer"]').textContent`)).replace('⏸ ', '').split(':').map(Number)
      return m * 60 + s
    }
    await sleep(600)
    const before = await clock()
    await sleep(3000)
    const shown = await clock()
    if (shown - before < 2 || shown - before > 4) throw new Error(`timer went ${before} → ${shown}`)
    // Leaving and coming back continues from the stored total.
    await evaluate(`location.hash = '#/theme/comida-callejera'`)
    await sleep(500)
    await evaluate(`location.hash = '#/read/cc-reading-tacos'`)
    await waitForText('taquero')
    await sleep(600)
    const again = await clock()
    if (again < shown) throw new Error(`timer reset on re-entry: ${shown} → ${again}`)
    await evaluate(`location.hash = '#/'`)
    await waitForText('Meta diaria')
    await sleep(300)
    const rows = await evaluate(idb(`return (await all('sessions')).map(r => ({ skill: r.skill, itemId: r.itemId, seconds: r.seconds, ended: !!r.endedAt }))`))
    const reading = rows.filter((r) => r.skill === 'reading' && r.itemId === 'cc-reading-tacos' && r.ended)
    if (!reading.some((r) => r.seconds >= 3)) throw new Error('no ≥3 s reading session: ' + JSON.stringify(rows))
  })

  await step('Goal ring, per-skill bars and streak reflect session seconds', async () => {
    // 23 min of reading today (over half the 45-min goal) and 30 min yesterday → streak 2.
    await evaluate(idb(`
      const tx = db.transaction('sessions', 'readwrite'); const s = tx.objectStore('sessions')
      const now = new Date(); const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12)
      const t = new Date(now.getTime() - 60 * 60000)
      s.add({ skill: 'reading', startedAt: t < new Date(now.getFullYear(), now.getMonth(), now.getDate()) ? now : t, endedAt: now, seconds: 23 * 60 })
      s.add({ skill: 'listening', startedAt: y, endedAt: y, seconds: 30 * 60 })
      await new Promise((res) => (tx.oncomplete = res))`))
    await evaluate(`location.hash = '#/stats'`)
    await waitForText('Estadísticas')
    await evaluate(`location.hash = '#/'`)
    const body = await waitForText('Racha de 2 días')
    if (!/\n2[3-9] \/ 45 min/.test(body)) throw new Error('ring minutes wrong:\n' + body)
    if (!body.includes('✓ 23 / 12 min')) throw new Error('reading bar not full:\n' + body)
    if (!body.includes('faltan')) throw new Error('ring should not be full yet')
  })

  await step('Stats screen: streak, last 7 days, skills, cards', async () => {
    await evaluate(`location.hash = '#/stats'`)
    const body = await waitForText('Últimos 7 días')
    for (const t of ['racha', 'hoy: 2', 'lectura', 'escucha', 'tarjetas', 'temas a2']) {
      if (!body.includes(t)) throw new Error('missing ' + t + '\n' + body)
    }
    const bars = await evaluate(`document.querySelectorAll('button[aria-pressed]').length`)
    if (bars !== 7) throw new Error('expected 7 day bars, got ' + bars)
    await evaluate(`document.querySelectorAll('button[aria-pressed]')[5].click()`)
    await waitForText(': 30 min')
  })

  await step('Settings: daily goal, split adjust, ring follows', async () => {
    await evaluate(`location.hash = '#/settings'`)
    await waitForText('Tiempo diario')
    await evaluate(`document.querySelector('button[aria-label="Más Meta diaria"]').click()`)
    await waitForText('la meta es 50')
    await evaluate(clickButton('Ajustar'))
    await sleep(300)
    const split = await evaluate(idb(`return (await all('settings'))[0].split`))
    const sum = Object.values(split).reduce((a, b) => a + b, 0)
    if (sum !== 50 || split.grammar !== 0) throw new Error('split not scaled to 50: ' + JSON.stringify(split))
    if (await evaluate(`document.body.innerText.includes('la meta es')`)) throw new Error('mismatch notice still shown')
    await evaluate(`location.hash = '#/'`)
    await waitForText('/ 50 min')
  })

  const typeArea = (value) => `(() => {
    const ta = document.querySelector('textarea')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(ta, ${JSON.stringify(value)}); ta.dispatchEvent(new Event('input', { bubbles: true }))
  })()`
  const progressOf = (itemId) => idb(`return (await all('itemProgress')).find(p => p.itemId === ${JSON.stringify(itemId)}) ?? null`)
  const recordingsOf = (itemId) => idb(`return (await all('recordings')).filter(r => r.itemId === ${JSON.stringify(itemId)}).map(r => [r.segmentId ?? '_', r.blob.size])`)
  const waitFor = async (expr, label, timeoutMs = 8000) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const v = await evaluate(expr)
      if (v) return v
      await sleep(150)
    }
    throw new Error('timeout: ' + label + '\n' + (await evaluate('document.body.innerText')).slice(0, 600))
  }

  await step('Writing: word count, autosaved draft, model + checklist, copy, done keeps text', async () => {
    await evaluate(`location.hash = '#/theme/comida-callejera'`)
    await waitForText('Escritura')
    if (!(await evaluate(`!!document.querySelector('a[href="#/write/cc-writing-mensaje"]')`))) throw new Error('theme view has no /write/ link')
    await evaluate(`location.hash = '#/write/cc-writing-mensaje'`)
    await waitForText('0 / 50 palabras')
    await evaluate(typeArea('Hola, Dani. Te recomiendo los tacos de pastor del puesto.'))
    await waitForText('10 / 50 palabras')
    await waitForText('Guardado')
    const draft = await evaluate(progressOf('cc-writing-mensaje'))
    if (!draft?.userText?.startsWith('Hola, Dani')) throw new Error('draft not autosaved: ' + JSON.stringify(draft))
    await send('Page.navigate', { url: base + '#/write/cc-writing-mensaje' })
    await waitForText('10 / 50 palabras')
    const long = 'Hola, Dani. ' + 'Te recomiendo los tacos de pastor y las quesadillas del tianguis. '.repeat(5)
    await evaluate(typeArea(long))
    await waitForText('57 / 50 palabras ✓')
    await evaluate(clickButton('Terminé'))
    await waitForText('Texto modelo')
    await waitForText('0 de 4')
    await evaluate(`document.querySelector('input[type="checkbox"]').click()`)
    await waitForText('1 de 4')
    // Headless Chrome has no real clipboard; capture what the app writes.
    await evaluate(`navigator.clipboard.writeText = async (t) => { window.__clip = t }`)
    await evaluate(clickButton('📋 Copiar para corregir'))
    await waitForText('Copiado')
    const clip = await evaluate(`window.__clip ?? ''`)
    if (!clip.startsWith('Corrige este texto en español mexicano, nivel A2') || !clip.includes('quesadillas')) throw new Error('clipboard: ' + clip)
    await evaluate(clickButton('Marcar como terminado'))
    await waitForText('Escritura')
    const done = await evaluate(progressOf('cc-writing-mensaje'))
    if (done?.status !== 'done' || !done.userText?.includes('quesadillas') || JSON.stringify(done.checklistDone) !== '[0]')
      throw new Error('done should keep draft and ticks: ' + JSON.stringify(done))
  })

  await step('Speaking monologue: record, playback, model answer, self-rating, re-record replaces', async () => {
    await evaluate(`location.hash = '#/speak/cc-speaking-monologo'`)
    await waitForText('Monólogo')
    if (await evaluate(`document.body.innerText.includes('Una respuesta posible')`)) throw new Error('model answer shown before recording')
    await evaluate(clickButton('🎤 Empezar a hablar'))
    await waitForText('Grabando')
    await waitForText('Meta: 60 s')
    await sleep(1200)
    await evaluate(clickButton('● Grabando'))
    await waitForText('Tu grabación')
    await waitForText('Una respuesta posible')
    if (!(await evaluate(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('🔊 Modelo'))`))) throw new Error('no model play button')
    await waitForText('¿Cómo te fue?')
    if (!(await evaluate(`!!document.querySelector('audio[src^="blob:"]')`))) throw new Error('no playback')
    await evaluate(clickButton('Bien'))
    await waitFor(`document.querySelector('button[aria-pressed="true"]')?.textContent === 'Bien'`, 'rating pressed')
    if ((await evaluate(progressOf('cc-speaking-monologo')))?.selfRating !== 3) throw new Error('selfRating not saved')
    await evaluate(clickButton('🎤 Grabar otra vez'))
    await waitForText('Grabando')
    await sleep(600)
    await evaluate(clickButton('● Grabando'))
    await waitForText('Tu grabación')
    await sleep(300)
    const recs = await evaluate(recordingsOf('cc-speaking-monologo'))
    if (recs.length !== 1 || recs[0][1] === 0) throw new Error('expected one non-empty recording: ' + JSON.stringify(recs))
  })

  await step('Recording that never fires "stop" (seen on iOS) still ends, frees the mic and says so', async () => {
    await send('Page.navigate', { url: base + '#/speak/cc-speaking-monologo' })
    await waitForText('Monólogo')
    await evaluate(`(() => {
      window.__stop = MediaRecorder.prototype.stop
      MediaRecorder.prototype.stop = function () {}
      window.__gum = navigator.mediaDevices.getUserMedia
      const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async (c) => (window.__stream = await gum(c))
    })()`)
    await evaluate(clickButton('🎤 Grabar otra vez'))
    await waitForText('Grabando')
    await sleep(500)
    await evaluate(clickButton('● Grabando'))
    await waitFor(`!document.body.innerText.includes('Grabando')`, 'button left recording state', 1000)
    await waitForText('No se grabó sonido', 5000)
    if (!(await evaluate(`window.__stream.getTracks().every(t => t.readyState === 'ended')`))) throw new Error('mic still on')
    // A hash-only Page.navigate does not reload, so undo the patches by hand.
    await evaluate(`MediaRecorder.prototype.stop = window.__stop; navigator.mediaDevices.getUserMedia = window.__gum`)
  })

  await step('Speaking dialogue: each reply shows a model to compare, then waits for Siguiente', async () => {
    await evaluate(`location.hash = '#/speak/cc-speaking-dialogo'`)
    await evaluate(clickButton('▶ Empezar diálogo'))
    await waitForText('¿Qué le damos?')
    const buttons = `[...document.querySelectorAll('button')].map(b => b.textContent)`
    for (let i = 0; i < 5; i++) {
      await waitFor(`${buttons}.some(t => t.startsWith('🎤 Responder'))`, 'responder ' + i)
      await evaluate(clickButton('🎤 Responder'))
      await waitForText('Grabando')
      await sleep(400)
      await evaluate(clickButton('● Grabando'))
      await waitFor(`document.querySelectorAll('audio').length === ${i + 1}`, 'reply audio ' + i)
      const label = i === 4 ? 'Terminar ✓' : 'Siguiente ▶'
      await waitFor(`${buttons}.includes('${label}')`, 'next button ' + i)
      // No auto-advance: the next partner line waits for the learner.
      if (await evaluate(`${buttons}.some(t => t.startsWith('🎤 Responder'))`)) throw new Error('advanced without Siguiente at ' + i)
      const boxes = await evaluate(`[...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent === 'Una respuesta posible (no la única)').length`)
      if (boxes !== i + 1) throw new Error(`expected ${i + 1} model boxes, got ${boxes}`)
      if (i === 0) {
        await waitForText('Me da cuatro tacos de pastor')
        // Re-recording the same turn replaces it and keeps the learner on it.
        await evaluate(clickButton('🎤 Otra vez'))
        await waitForText('Grabando')
        await sleep(400)
        await evaluate(clickButton('● Grabando'))
        await waitFor(`${buttons}.includes('Siguiente ▶')`, 'still on turn 0')
      }
      await evaluate(clickButton(label))
    }
    await waitForText('Repetir el diálogo')
    const turns = (await evaluate(recordingsOf('cc-speaking-dialogo'))).map((r) => r[0]).sort()
    if (JSON.stringify(turns) !== '["turn-0","turn-1","turn-2","turn-3","turn-4"]') throw new Error('turn recordings: ' + JSON.stringify(turns))
  })

  await step('Speaking: add-word field saves a card with an example; shadow mode lists sentences', async () => {
    await evaluate(typeInto('input[aria-label="Palabra en español"]', 'efectivo'))
    await evaluate(typeInto('input[aria-label="Significado"]', 'cash'))
    await evaluate(clickButton('Guardar tarjeta'))
    await waitForText('«efectivo» guardada')
    const card = await evaluate(idb(`return (await all('cards')).find(c => c.word === 'efectivo') ?? null`))
    if (!card || card.meaning !== 'cash' || !card.exampleEs.includes('efectivo')) throw new Error('card: ' + JSON.stringify(card))
    await evaluate(`location.hash = '#/speak/cc-speaking-sombra'`)
    await waitForText('Sombra')
    const n = await evaluate(`[...document.querySelectorAll('button')].filter(b => b.textContent.includes('Escuchar y repetir')).length`)
    if (n !== 6) throw new Error('shadow sentences: ' + n)
    // Headless Chrome has no voice, so this also covers "voice fails → still records" without getting stuck.
    await evaluate(clickButton('🎤 Escuchar y repetir'))
    await waitForText('🔊 Original', 15000)
    if ((await evaluate(recordingsOf('cc-speaking-sombra'))).length !== 1) throw new Error('shadow recording not saved')
    await evaluate(`location.hash = '#/stats'`)
    await waitForText('Habla')
    await waitForText('3.0')
    await waitForText('25')
  })

  await step('Dark mode: setting switches tokens, theme-color and localStorage', async () => {
    await evaluate(`location.hash = '#/settings'`)
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
    await send('Page.navigate', { url: base + '#/settings' })
    await waitForText('Apariencia')
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
