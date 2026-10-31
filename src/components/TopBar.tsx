import { Link } from 'react-router'

export default function TopBar({ title, back, right }: { title: string; back?: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-paper/95 px-3 py-2 backdrop-blur">
      {back !== undefined && (
        <Link to={back} aria-label="Atrás" className="-ml-1 rounded-lg px-2 py-1 text-xl text-accent">
          ‹
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h1>
      {right}
    </header>
  )
}
