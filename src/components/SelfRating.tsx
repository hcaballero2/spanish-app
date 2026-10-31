import { patchItemProgress } from '../lib/progress'

const OPTIONS: { value: 1 | 2 | 3 | 4; label: string }[] = [
  { value: 1, label: 'Me costó' },
  { value: 2, label: 'Regular' },
  { value: 3, label: 'Bien' },
  { value: 4, label: 'Muy bien' },
]

/** Self-rating 1–4 after speaking (PLAN §7.4). Feeds the stats screen, not FSRS. */
export default function SelfRating({ itemId, value }: { itemId: string; value?: 1 | 2 | 3 | 4 }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 font-semibold">¿Cómo te fue?</h2>
      <div className="grid grid-cols-4 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => void patchItemProgress(itemId, { selfRating: o.value })}
            className={`rounded-xl border px-1 py-2.5 text-sm ${value === o.value ? 'border-accent bg-accent text-on-accent' : 'border-line bg-card'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  )
}
