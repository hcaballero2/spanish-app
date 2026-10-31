import { isIOS, isStandalone } from '../lib/platform'

/** Shown only in a browser tab; disappears once the app is on the home screen. */
export default function InstallHint() {
  if (isStandalone()) return null
  return (
    <section className="rounded-2xl border border-line bg-white p-4 text-sm leading-relaxed">
      <h2 className="mb-1 font-semibold">Instala la app</h2>
      {isIOS() ? (
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          <li>Toca el botón <strong>Compartir</strong> (cuadro con flecha) en Safari.</li>
          <li>Elige <strong>Agregar a inicio</strong>.</li>
          <li>Abre <strong>Español</strong> desde la pantalla de inicio.</li>
        </ol>
      ) : (
        <p className="text-muted">Ábrela en Safari del iPhone y usa Compartir → Agregar a inicio.</p>
      )}
      <p className="mt-2 text-xs text-muted">
        Instalada, funciona sin internet y Safari no borra tus datos.
      </p>
    </section>
  )
}
