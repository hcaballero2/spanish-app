import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateSettings } from '../../db/db'
import { LEVELS, THEME_PREFS, type Level, type SplitKey, type ThemePref } from '../../db/types'
import TopBar from '../../components/TopBar'
import { SKILL_LABEL } from '../../lib/sessions'
import { scaleSplit, splitTotal } from '../../lib/split'
import { RATE_STEPS, speak, spanishVoices, ttsAvailable } from '../../lib/tts'

const SPLIT_ORDER: SplitKey[] = ['reading', 'listening', 'speaking', 'writing', 'grammar', 'review']
const THEME_LABEL: Record<ThemePref, string> = { system: 'Como el sistema', light: 'Claro', dark: 'Oscuro' }
const DAILY_MIN = 10
const DAILY_MAX = 120

export default function SettingsScreen() {
  const settings = useLiveQuery(() => db.settings.get(1))
  const voices = useVoices()

  if (!settings) return <main className="p-5 text-muted">Cargando…</main>

  const setDaily = (minutes: number) => {
    const m = Math.max(DAILY_MIN, Math.min(DAILY_MAX, minutes))
    updateSettings({ dailyMinutes: m })
  }
  const setSkill = (k: SplitKey, minutes: number) =>
    updateSettings({ split: { ...settings.split, [k]: Math.max(0, Math.min(60, minutes)) } })
  const splitSum = splitTotal(settings.split)

  return (
    <>
      <TopBar title="Ajustes" back="/" />
      <main className="mx-auto flex max-w-md flex-col gap-4 p-5 pb-16">
        <Section title="Nivel">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <LevelSelect label="Actual" value={settings.currentLevel} onChange={(v) => updateSettings({ currentLevel: v })} />
            <LevelSelect label="Meta" value={settings.targetLevel} onChange={(v) => updateSettings({ targetLevel: v })} />
          </div>
        </Section>

        <Section title="Tiempo diario">
          <Stepper label="Meta diaria" value={settings.dailyMinutes} unit="min" step={5} onChange={setDaily} />
          <p className="mt-3 mb-2 text-xs text-muted">Reparto por habilidad (las barras de Hoy).</p>
          <div className="flex flex-col gap-2">
            {SPLIT_ORDER.map((k) => (
              <Stepper key={k} label={SKILL_LABEL[k]} value={settings.split[k]} unit="min" step={1} onChange={(v) => setSkill(k, v)} />
            ))}
          </div>
          {splitSum !== settings.dailyMinutes && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-3 py-2 text-xs">
              <span>
                El reparto suma {splitSum} min; la meta es {settings.dailyMinutes}.
              </span>
              <button
                type="button"
                onClick={() => updateSettings({ split: scaleSplit(settings.split, settings.dailyMinutes) })}
                className="shrink-0 font-medium text-accent"
              >
                Ajustar
              </button>
            </div>
          )}
        </Section>

        <Section title="Voz">
          {!ttsAvailable() ? (
            <p className="text-sm text-muted">Este navegador no tiene voz.</p>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <label className="flex items-center justify-between gap-3">
                <span className="text-muted">Voz</span>
                <select
                  aria-label="Voz"
                  value={settings.ttsVoiceURI ?? ''}
                  onChange={(e) => updateSettings({ ttsVoiceURI: e.target.value || undefined })}
                  className="min-w-0 max-w-[60%] rounded-lg border border-line bg-paper px-3 py-2 text-base"
                >
                  <option value="">Automática (es-MX)</option>
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} · {v.lang}
                    </option>
                  ))}
                </select>
              </label>
              {voices.length > 0 && !voices.some((v) => v.lang.toLowerCase() === 'es-mx') && (
                <p className="text-xs text-muted">
                  No hay voz de México. En el iPhone: Ajustes › Accesibilidad › Contenido leído › Voces › Español (México).
                </p>
              )}
              <label className="flex items-center justify-between gap-3">
                <span className="text-muted">Velocidad</span>
                <select
                  aria-label="Velocidad de voz"
                  value={settings.ttsRate}
                  onChange={(e) => updateSettings({ ttsRate: Number(e.target.value) })}
                  className="rounded-lg border border-line bg-paper px-3 py-2 text-base"
                >
                  {RATE_STEPS.map((r) => (
                    <option key={r} value={r}>
                      {r.toFixed(1)}×
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => speak('¿Qué onda? Vamos a practicar un poco de español.', { rate: settings.ttsRate, voiceURI: settings.ttsVoiceURI })}
                className="self-start rounded-xl border border-line px-4 py-2 text-accent"
              >
                🔊 Probar voz
              </button>
            </div>
          )}
        </Section>

        <Section title="Repaso">
          <div className="flex flex-col gap-3 text-sm">
            <label className="flex items-center justify-between gap-3">
              <span className="text-muted">Recordatorio desde las</span>
              <select
                aria-label="Hora del recordatorio"
                value={settings.reviewHour}
                onChange={(e) => updateSettings({ reviewHour: Number(e.target.value) })}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-base"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </label>
            <Stepper
              label="Tarjetas nuevas al día"
              value={settings.newCardsPerDay}
              step={5}
              onChange={(v) => updateSettings({ newCardsPerDay: Math.max(5, Math.min(50, v)) })}
            />
          </div>
        </Section>

        <Section title="Apariencia">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">Tema</span>
            <select
              aria-label="Tema"
              value={settings.theme ?? 'system'}
              onChange={(e) => updateSettings({ theme: e.target.value as ThemePref })}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-base"
            >
              {THEME_PREFS.map((t) => (
                <option key={t} value={t}>
                  {THEME_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        </Section>
      </main>
    </>
  )
}

/** Spanish voices; iOS fills the list only after `voiceschanged` (PLAN §4). */
function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (ttsAvailable() ? spanishVoices() : []))
  useEffect(() => {
    if (!ttsAvailable()) return
    const load = () => setVoices(spanishVoices())
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  return voices
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Stepper({
  label,
  value,
  unit,
  step,
  onChange,
}: {
  label: string
  value: number
  unit?: string
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <div className="flex items-center gap-1" role="group" aria-label={label}>
        <button
          type="button"
          aria-label={`Menos ${label}`}
          onClick={() => onChange(value - step)}
          className="h-9 w-9 rounded-lg border border-line text-lg text-accent"
        >
          −
        </button>
        <span className="w-16 text-center tabular-nums">
          {value}
          {unit ? ` ${unit}` : ''}
        </span>
        <button
          type="button"
          aria-label={`Más ${label}`}
          onClick={() => onChange(value + step)}
          className="h-9 w-9 rounded-lg border border-line text-lg text-accent"
        >
          +
        </button>
      </div>
    </div>
  )
}

function LevelSelect({ label, value, onChange }: { label: string; value: Level; onChange: (v: Level) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as Level)} className="rounded-lg border border-line bg-paper px-3 py-2 text-base">
        {LEVELS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}
