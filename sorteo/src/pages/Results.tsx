import ComingSoon from '../components/ComingSoon'

const draws = [
  ['Previa', '10:15'],
  ['Primera', '12:00'],
  ['Matutina', '15:00'],
  ['Vespertina', '18:00'],
  ['Nocturna', '21:00'],
]

export default function Results() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-extrabold">Resultados</h1>
      <div className="rounded-3xl border border-line bg-surface p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-3xl">🎯</div>
        <h2 className="mt-4 text-lg font-bold">Todavía no hay resultados publicados</h2>
        <p className="mt-1 text-sm text-muted">Cuando un sorteo se realice, acá vas a ver el primer premio oficial, el número ganador y si ganaste.</p>
      </div>
      <section className="rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-bold">Sorteos oficiales de la Quiniela de la Ciudad</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {draws.map(([n, h]) => (
            <li key={n} className="flex justify-between py-2"><span>{n}</span><span className="font-semibold tabular-nums">{h}</span></li>
          ))}
        </ul>
        <a href="https://quiniela.loteriadelaciudad.gob.ar/" target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-brand-600">Ver fuente oficial ↗</a>
      </section>
      <ComingSoon stage={8}>Los resultados se leerán de la fuente oficial y Sebastián los confirmará antes de publicarse.</ComingSoon>
    </div>
  )
}
