/** Top-bar chip that shows or hides every English gloss on a text screen. */
export default function GlossToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label="Mostrar traducción"
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${on ? 'bg-accent text-on-accent' : 'bg-line text-muted'}`}
    >
      en
    </button>
  )
}
