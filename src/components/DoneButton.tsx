export default function DoneButton({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-4 w-full rounded-xl px-4 py-3 font-medium ${done ? 'border border-line text-muted' : 'bg-accent text-on-accent'}`}
    >
      {done ? 'Terminado ✓' : 'Marcar como terminado'}
    </button>
  )
}
